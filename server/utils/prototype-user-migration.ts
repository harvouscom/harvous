/**
 * Idempotent per-user migration helpers for Classic → prototype (2.0) surfaces.
 * - Missing NoteThreads junction rows (create-only) for Classic thread visibility
 * - Thread titles → folder/collection labels on notes
 * - linkedFromNoteId → NoteConnections graph edges
 */

import {
  db,
  first,
  Notes,
  Threads,
  NoteThreads,
  NoteConnections,
  eq,
  and,
  asc,
  gt,
  inArray,
  isNull,
  isNotNull,
  ne,
  sql,
  type SQL,
} from '../db';
import { nowISO } from '../db/dates';
import { generateNoteId } from '@/utils/ids';
import {
  normalizeSecondaryLabels,
  serializeNoteSecondaryCollections,
} from './note-secondary-collections';
import { isPgUndefinedRelation } from './pg-undefined-relation';
import { repairMissingNoteThreadJunctionsForUser } from './thread-junction-repair';

export interface PrototypeUserMigrationResult {
  junctionsRepaired: number;
  collectionsUpdated: number;
  connectionsMigrated: number;
  connectionsSkipped: number;
}

function isSystemThreadId(threadId: string): boolean {
  return threadId === 'thread_unorganized' || threadId.startsWith('thread_onboarding_');
}

/** Exclude per-user onboarding threads (`thread_onboarding_${userId}`). */
const NOT_ONBOARDING_THREAD = sql`NOT starts_with(${Notes.threadId}::text, 'thread_onboarding_')`;

const NOT_ONBOARDING_JUNCTION_THREAD = sql`NOT starts_with(${NoteThreads.threadId}::text, 'thread_onboarding_')`;

/** Shared eligibility: no existing folder label or manual override. */
function collectionBackfillEligible(): SQL[] {
  return [
    isNull(Notes.primaryCollection),
    eq(Notes.collectionUserOverride, false),
    eq(Notes.collectionPinned, false),
  ];
}

type SecondaryRow = {
  noteId: string;
  threadId: string;
  title: string;
};

async function loadThreadTitles(threadIds: string[]): Promise<Map<string, string>> {
  if (threadIds.length === 0) return new Map();
  const rows = await db
    .select({ id: Threads.id, title: Threads.title })
    .from(Threads)
    .where(inArray(Threads.id, threadIds));
  return new Map(rows.map((r) => [r.id, r.title]));
}

async function loadSecondaries(noteIds: string[]): Promise<Map<string, SecondaryRow[]>> {
  const out = new Map<string, SecondaryRow[]>();
  if (noteIds.length === 0) return out;

  const rows = await db
    .select({
      noteId: NoteThreads.noteId,
      threadId: NoteThreads.threadId,
      title: Threads.title,
      createdAt: NoteThreads.createdAt,
    })
    .from(NoteThreads)
    .innerJoin(Threads, eq(NoteThreads.threadId, Threads.id))
    .where(inArray(NoteThreads.noteId, noteIds))
    .orderBy(asc(NoteThreads.noteId), asc(NoteThreads.createdAt));

  for (const r of rows) {
    const list = out.get(r.noteId) ?? [];
    list.push({ noteId: r.noteId, threadId: r.threadId, title: r.title });
    out.set(r.noteId, list);
  }
  return out;
}

function computeSecondariesForNote(
  noteThreadId: string,
  rows: SecondaryRow[] | undefined,
  primaryLabel: string,
): string | null {
  if (!rows?.length) return serializeNoteSecondaryCollections([]);

  const titles: string[] = [];
  for (const r of rows) {
    if (r.threadId === noteThreadId) continue;
    if (isSystemThreadId(r.threadId)) continue;
    const t = (r.title || '').trim();
    if (!t) continue;
    titles.push(t);
  }
  const normalized = normalizeSecondaryLabels(titles, primaryLabel);
  return serializeNoteSecondaryCollections(normalized);
}

/** Earliest non-system junction thread (by NoteThreads.createdAt order in loadSecondaries). */
function pickPrimaryThreadFromJunctions(rows: SecondaryRow[] | undefined): string | null {
  if (!rows?.length) return null;
  for (const r of rows) {
    if (!isSystemThreadId(r.threadId)) return r.threadId;
  }
  return null;
}

async function applyCollectionBackfillForNote(
  noteId: string,
  primaryThreadId: string,
  secondariesByNote: Map<string, SecondaryRow[]>,
  titleByThreadId: Map<string, string>,
): Promise<boolean> {
  if (isSystemThreadId(primaryThreadId)) return false;

  const rawTitle = titleByThreadId.get(primaryThreadId);
  if (rawTitle == null) return false;
  const primaryLabel = rawTitle.trim();
  if (!primaryLabel.length) return false;

  const secondarySerialized = computeSecondariesForNote(
    primaryThreadId,
    secondariesByNote.get(noteId),
    primaryLabel,
  );

  await db
    .update(Notes)
    .set({
      primaryCollection: primaryLabel,
      secondaryCollections: secondarySerialized,
      collectionPinned: true,
      updatedAt: nowISO(),
    })
    .where(eq(Notes.id, noteId));

  return true;
}

/**
 * Copy Classic thread titles into `Notes.primaryCollection` / `secondaryCollections`
 * for one user. Skips notes with existing collection overrides or labels.
 * Uses `Notes.threadId` and, when unorganized, earliest non-system `NoteThreads` row.
 */
export async function backfillCollectionsFromThreadsForUser(
  userId: string,
  options?: { batchSize?: number; maxNotes?: number },
): Promise<number> {
  const batchSize = options?.batchSize ?? 400;
  const maxNotes = options?.maxNotes;
  let updated = 0;
  let totalExamined = 0;

  updated += await backfillFromThreadIdColumn(userId, batchSize, maxNotes, () => {
    totalExamined++;
    return maxNotes != null && totalExamined >= maxNotes;
  });

  if (maxNotes != null && totalExamined >= maxNotes) return updated;

  const junctionUpdated = await backfillFromJunctionOnlyNotes(userId, batchSize, maxNotes, totalExamined);
  updated += junctionUpdated;

  return updated;
}

async function backfillFromThreadIdColumn(
  userId: string,
  batchSize: number,
  maxNotes: number | undefined,
  shouldStop: () => boolean,
): Promise<number> {
  let lastId: string | null = null;
  let updated = 0;

  while (true) {
    const conditions: SQL[] = [
      eq(Notes.userId, userId),
      ...collectionBackfillEligible(),
      ne(Notes.threadId, 'thread_unorganized'),
      NOT_ONBOARDING_THREAD,
    ];
    if (lastId) conditions.push(gt(Notes.id, lastId));

    const batch = await db
      .select({ id: Notes.id, threadId: Notes.threadId })
      .from(Notes)
      .where(and(...conditions))
      .orderBy(asc(Notes.id))
      .limit(batchSize);

    if (batch.length === 0) break;

    const noteIds = batch.map((n) => n.id);
    const primaryThreadIds = [...new Set(batch.map((n) => n.threadId))];
    const titleByThreadId = await loadThreadTitles(primaryThreadIds);
    const secondariesByNote = await loadSecondaries(noteIds);

    for (const note of batch) {
      if (shouldStop()) return updated;

      const didUpdate = await applyCollectionBackfillForNote(
        note.id,
        note.threadId,
        secondariesByNote,
        titleByThreadId,
      );
      if (didUpdate) updated++;
    }

    lastId = batch[batch.length - 1]!.id;
    if (batch.length < batchSize) break;
  }

  return updated;
}

async function backfillFromJunctionOnlyNotes(
  userId: string,
  batchSize: number,
  maxNotes: number | undefined,
  alreadyExamined: number,
): Promise<number> {
  let lastId: string | null = null;
  let updated = 0;
  let examined = alreadyExamined;

  while (true) {
    const conditions: SQL[] = [
      eq(Notes.userId, userId),
      ...collectionBackfillEligible(),
      eq(Notes.threadId, 'thread_unorganized'),
      ne(NoteThreads.threadId, 'thread_unorganized'),
      NOT_ONBOARDING_JUNCTION_THREAD,
    ];
    if (lastId) conditions.push(gt(Notes.id, lastId));

    const batch = await db
      .selectDistinct({ id: Notes.id })
      .from(Notes)
      .innerJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id))
      .where(and(...conditions))
      .orderBy(asc(Notes.id))
      .limit(batchSize);

    if (batch.length === 0) break;

    const noteIds = batch.map((n) => n.id);
    const secondariesByNote = await loadSecondaries(noteIds);

    const primaryThreadIds = new Set<string>();
    for (const noteId of noteIds) {
      const primary = pickPrimaryThreadFromJunctions(secondariesByNote.get(noteId));
      if (primary) primaryThreadIds.add(primary);
    }
    const titleByThreadId = await loadThreadTitles([...primaryThreadIds]);

    for (const note of batch) {
      if (maxNotes != null && examined >= maxNotes) return updated;
      examined++;

      const primaryThreadId = pickPrimaryThreadFromJunctions(secondariesByNote.get(note.id));
      if (!primaryThreadId) continue;

      const didUpdate = await applyCollectionBackfillForNote(
        note.id,
        primaryThreadId,
        secondariesByNote,
        titleByThreadId,
      );
      if (didUpdate) updated++;
    }

    lastId = batch[batch.length - 1]!.id;
    if (batch.length < batchSize) break;
    if (maxNotes != null && examined >= maxNotes) break;
  }

  return updated;
}

/**
 * Pin primary folders on notes already backfilled from Classic threads (primary matches thread title).
 * Idempotent — only touches unpinned notes whose primaryCollection equals their thread pile title.
 */
export async function repairMigratedCollectionPins(
  userId?: string,
  options?: { dryRun?: boolean; batchSize?: number },
): Promise<{ candidates: number; updated: number }> {
  const dryRun = options?.dryRun ?? false;
  const batchSize = options?.batchSize ?? 400;
  let lastId: string | null = null;
  let candidates = 0;
  let updated = 0;

  while (true) {
    const conditions: SQL[] = [
      isNotNull(Notes.primaryCollection),
      eq(Notes.collectionPinned, false),
      eq(Notes.collectionUserOverride, false),
      ne(Notes.threadId, 'thread_unorganized'),
      NOT_ONBOARDING_THREAD,
      sql`trim(${Notes.primaryCollection}) = trim(${Threads.title})`,
    ];
    if (userId) conditions.push(eq(Notes.userId, userId));
    if (lastId) conditions.push(gt(Notes.id, lastId));

    const batch = await db
      .select({ id: Notes.id })
      .from(Notes)
      .innerJoin(Threads, eq(Notes.threadId, Threads.id))
      .where(and(...conditions))
      .orderBy(asc(Notes.id))
      .limit(batchSize);

    if (batch.length === 0) break;

    candidates += batch.length;
    if (!dryRun) {
      const ids = batch.map((n) => n.id);
      await db
        .update(Notes)
        .set({ collectionPinned: true, updatedAt: nowISO() })
        .where(inArray(Notes.id, ids));
      updated += batch.length;
    }

    lastId = batch[batch.length - 1]!.id;
    if (batch.length < batchSize) break;
  }

  return { candidates, updated: dryRun ? 0 : updated };
}

/**
 * Create NoteConnections rows from existing `Notes.linkedFromNoteId` values.
 * Idempotent — duplicate pairs are skipped via unique constraint.
 */
export async function migrateLinkedFromNoteConnectionsForUser(userId: string): Promise<{
  migrated: number;
  skipped: number;
}> {
  const linkedNotes = await db
    .select({ id: Notes.id, linkedFromNoteId: Notes.linkedFromNoteId, spaceId: Notes.spaceId })
    .from(Notes)
    .where(and(eq(Notes.userId, userId), isNotNull(Notes.linkedFromNoteId)));

  let migrated = 0;
  let skipped = 0;

  for (const note of linkedNotes) {
    if (!note.linkedFromNoteId) continue;
    try {
      await db.insert(NoteConnections).values({
        id: generateNoteId(),
        fromNoteId: note.linkedFromNoteId,
        toNoteId: note.id,
        userId,
        spaceId: note.spaceId ?? null,
        createdAt: nowISO(),
      });
      migrated += 1;
    } catch (error) {
      if (isPgUndefinedRelation(error, 'NoteConnections')) throw error;
      skipped += 1;
    }
  }

  return { migrated, skipped };
}

/** Run migration steps for one authenticated user (additive only). */
export async function runPrototypeUserMigration(userId: string): Promise<PrototypeUserMigrationResult> {
  const junctionsRepaired = await repairMissingNoteThreadJunctionsForUser(userId);
  const collectionsUpdated = await backfillCollectionsFromThreadsForUser(userId);
  const { migrated, skipped } = await migrateLinkedFromNoteConnectionsForUser(userId);
  return {
    junctionsRepaired,
    collectionsUpdated,
    connectionsMigrated: migrated,
    connectionsSkipped: skipped,
  };
}

async function hasThreadIdBackfillCandidate(userId: string): Promise<boolean> {
  const row = first(
    await db
      .select({ id: Notes.id })
      .from(Notes)
      .where(
        and(
          eq(Notes.userId, userId),
          ...collectionBackfillEligible(),
          ne(Notes.threadId, 'thread_unorganized'),
          NOT_ONBOARDING_THREAD,
        ),
      )
      .limit(1),
  );
  return row != null;
}

async function hasJunctionOnlyBackfillCandidate(userId: string): Promise<boolean> {
  const row = first(
    await db
      .select({ id: Notes.id })
      .from(Notes)
      .innerJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id))
      .where(
        and(
          eq(Notes.userId, userId),
          ...collectionBackfillEligible(),
          eq(Notes.threadId, 'thread_unorganized'),
          ne(NoteThreads.threadId, 'thread_unorganized'),
          NOT_ONBOARDING_JUNCTION_THREAD,
        ),
      )
      .limit(1),
  );
  return row != null;
}

/** Whether the user has Classic thread organization not yet reflected in folders. */
export async function userNeedsCollectionBackfill(userId: string): Promise<boolean> {
  if (await hasThreadIdBackfillCandidate(userId)) return true;
  return hasJunctionOnlyBackfillCandidate(userId);
}

/** Count notes eligible for folder backfill (for admin batch dry-run). */
export async function countCollectionBackfillCandidates(userId?: string): Promise<number> {
  const threadIdConditions: SQL[] = [
    ...collectionBackfillEligible(),
    ne(Notes.threadId, 'thread_unorganized'),
    NOT_ONBOARDING_THREAD,
  ];
  if (userId) threadIdConditions.push(eq(Notes.userId, userId));

  const threadIdRows = await db
    .select({ id: Notes.id })
    .from(Notes)
    .where(and(...threadIdConditions));

  const junctionConditions: SQL[] = [
    ...collectionBackfillEligible(),
    eq(Notes.threadId, 'thread_unorganized'),
    ne(NoteThreads.threadId, 'thread_unorganized'),
    NOT_ONBOARDING_JUNCTION_THREAD,
  ];
  if (userId) junctionConditions.push(eq(Notes.userId, userId));

  const junctionRows = await db
    .selectDistinct({ id: Notes.id })
    .from(Notes)
    .innerJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id))
    .where(and(...junctionConditions));

  const ids = new Set([...threadIdRows.map((r) => r.id), ...junctionRows.map((r) => r.id)]);
  return ids.size;
}
