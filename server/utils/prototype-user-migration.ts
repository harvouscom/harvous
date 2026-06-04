/**
 * Idempotent per-user migration helpers for Classic → prototype (2.0) surfaces.
 * - Thread titles → folder/collection labels on notes
 * - linkedFromNoteId → NoteConnections graph edges
 */

import { db, first, Notes, Threads, NoteThreads, NoteConnections, eq, and, asc, gt, inArray, isNull, isNotNull, ne, sql, type SQL } from '../db';
import { nowISO } from '../db/dates';
import { generateNoteId } from '@/utils/ids';
import {
  normalizeSecondaryLabels,
  serializeNoteSecondaryCollections,
} from './note-secondary-collections';
import { isPgUndefinedRelation } from './pg-undefined-relation';

export interface PrototypeUserMigrationResult {
  collectionsUpdated: number;
  connectionsMigrated: number;
  connectionsSkipped: number;
}

function isSystemThreadId(threadId: string): boolean {
  return threadId === 'thread_unorganized' || threadId.startsWith('thread_onboarding_');
}

/** Exclude per-user onboarding threads (`thread_onboarding_${userId}`). */
const NOT_ONBOARDING_THREAD = sql`NOT starts_with(${Notes.threadId}::text, 'thread_onboarding_')`;

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

/**
 * Copy Classic thread titles into `Notes.primaryCollection` / `secondaryCollections`
 * for one user. Skips notes with existing collection overrides or labels.
 */
export async function backfillCollectionsFromThreadsForUser(
  userId: string,
  options?: { batchSize?: number; maxNotes?: number },
): Promise<number> {
  const batchSize = options?.batchSize ?? 400;
  const maxNotes = options?.maxNotes;
  let lastId: string | null = null;
  let updated = 0;
  let totalExamined = 0;

  while (true) {
    const conditions: SQL[] = [
      eq(Notes.userId, userId),
      isNull(Notes.primaryCollection),
      eq(Notes.collectionUserOverride, false),
      eq(Notes.collectionPinned, false),
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
      if (maxNotes != null && totalExamined >= maxNotes) {
        lastId = '__stop__';
        break;
      }
      totalExamined++;

      if (isSystemThreadId(note.threadId)) continue;

      const rawTitle = titleByThreadId.get(note.threadId);
      if (rawTitle == null) continue;
      const primaryLabel = rawTitle.trim();
      if (!primaryLabel.length) continue;

      const secondarySerialized = computeSecondariesForNote(
        note.threadId,
        secondariesByNote.get(note.id),
        primaryLabel,
      );

      await db
        .update(Notes)
        .set({
          primaryCollection: primaryLabel,
          secondaryCollections: secondarySerialized,
          updatedAt: nowISO(),
        })
        .where(eq(Notes.id, note.id));
      updated++;
    }

    if (lastId === '__stop__') break;
    lastId = batch[batch.length - 1]!.id;
    if (batch.length < batchSize) break;
    if (maxNotes != null && totalExamined >= maxNotes) break;
  }

  return updated;
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

/** Run both migration steps for one authenticated user. */
export async function runPrototypeUserMigration(userId: string): Promise<PrototypeUserMigrationResult> {
  const collectionsUpdated = await backfillCollectionsFromThreadsForUser(userId);
  const { migrated, skipped } = await migrateLinkedFromNoteConnectionsForUser(userId);
  return {
    collectionsUpdated,
    connectionsMigrated: migrated,
    connectionsSkipped: skipped,
  };
}

/** Whether the user has Classic thread organization not yet reflected in folders. */
export async function userNeedsCollectionBackfill(userId: string): Promise<boolean> {
  const row = first(
    await db
      .select({ id: Notes.id })
      .from(Notes)
      .where(
        and(
          eq(Notes.userId, userId),
          isNull(Notes.primaryCollection),
          eq(Notes.collectionUserOverride, false),
          eq(Notes.collectionPinned, false),
          ne(Notes.threadId, 'thread_unorganized'),
          NOT_ONBOARDING_THREAD,
        ),
      )
      .limit(1),
  );
  return row != null;
}
