/**
 * Writing a Discover listing into someone's account.
 *
 * Split into `prepare` (reads, id generation, content rewriting — all outside
 * the transaction) and `write` (inserts only), because the caller has to open
 * the transaction itself: `DiscoverInstalls` must be inserted **first, inside
 * it**, so a second tap loses to the unique index instead of racing a
 * check-then-act. See server/routes/discover.ts.
 *
 * The note and pack writers deliberately duplicate the chains in
 * `server/routes/shared.ts` (:421 and :588) rather than sharing them.
 * Restructuring a 946-line file every public share link depends on, to serve a
 * second caller, costs more than ~90 duplicated lines — the same call
 * `SpaceStudySuggestions` made against `LibraryItemSuggestions`
 * (server/db/schema.ts). Extract on the third caller.
 *
 * One thing that is **not** copied: `/api/shared/add-to-harvous` has no
 * duplicate guard at all, so importing a shared thread twice writes a second
 * thread and every note again. Here the guard is the caller's unique index.
 */

import {
  db,
  Notes,
  Threads,
  NoteThreads,
  NoteTemplates,
  LibraryItems,
  UserMetadata,
  ScriptureMetadata,
  ResourceMetadata,
  NoteScriptureReferences,
  eq,
  and,
  desc,
  isNotNull,
  isNull,
  first,
} from '../db';
import { now, nowISO } from '../db/dates';
import { generateNoteId, generateThreadId } from '@/utils/ids';
import { getCurrentSeason } from '@/utils/season-helpers';
import { awardNoteCreatedXP, awardThreadCreatedXP } from './xp-system';
import {
  processScriptureReferences,
  transformCanonicalScriptureContent,
} from './process-scripture-references';
import { getEffectiveHighestSimpleNoteId } from './highest-simple-note-id';
import { ensurePersonalHomeSpace } from './ensure-personal-home-space';
import { createInitialNoteVersion } from './note-version-service';
import { buildIndependentCopyAttribution } from './note-versioning';
import { isNoteTemplateIconColor } from '@/utils/note-template-icon';
import { validateResourceUrl, extractDomain } from '@/utils/validation';
import { ensurePersonalLibrary } from './ensure-personal-library';
import type {
  NotePayload,
  PackPayload,
  ResourcePayload,
  TemplatePayload,
} from './discover-snapshot';

/** Matches SHARED_BULK_INSERT_CHUNK in shared.ts — same tables, same reason. */
const BULK_INSERT_CHUNK = 400;
const XP_AWARD_CONCURRENCY = 8;
const NOTE_TEMPLATE_DESCRIPTION_MAX_LENGTH = 90;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type NoteInsert = typeof Notes.$inferInsert;

export interface CreatedIds {
  templateId?: string | null;
  noteId?: string | null;
  threadId?: string | null;
  noteIds?: string[];
  libraryItemId?: string | null;
}

interface PreparedBase {
  /** What `DiscoverInstalls.createdRefId` records — the thing the person got. */
  primaryRefId: string;
  createdIds: CreatedIds;
}

interface PreparedTemplate extends PreparedBase {
  kind: 'template';
  row: typeof NoteTemplates.$inferInsert;
}

interface PreparedResource extends PreparedBase {
  kind: 'resource';
  row: typeof LibraryItems.$inferInsert;
  /** Set when the installer already has this link — nothing is written. */
  duplicateOf: string | null;
}

interface PreparedNotes extends PreparedBase {
  kind: 'note' | 'pack';
  thread: (typeof Threads.$inferInsert) | null;
  noteRows: NoteInsert[];
  junctionRows: (typeof NoteThreads.$inferInsert)[];
  scriptureRows: (typeof ScriptureMetadata.$inferInsert)[];
  resourceRows: (typeof ResourceMetadata.$inferInsert)[];
  referenceRows: (typeof NoteScriptureReferences.$inferInsert)[];
  effectiveHighest: number;
  threadIdForScripture: string;
  threadTitle: string | null;
  threadSubtitle: string | null;
}

export type PreparedInstall = PreparedTemplate | PreparedResource | PreparedNotes;

/**
 * A row must exist before the transaction takes `FOR UPDATE` on it.
 *
 * Duplicated from the inline copies in shared.ts and the private
 * `ensureUserMetadataForImport` in routes/user.ts. Not extracted across those
 * yet: shared.ts is large and load-bearing, and a shared helper is only worth
 * the churn once someone is changing it for another reason anyway.
 */
async function ensureUserMetadata(userId: string): Promise<void> {
  const existing = first(
    await db.select({ userId: UserMetadata.userId }).from(UserMetadata).where(eq(UserMetadata.userId, userId)).limit(1),
  );
  if (existing) return;
  const highest = await db
    .select({ simpleNoteId: Notes.simpleNoteId })
    .from(Notes)
    .where(and(eq(Notes.userId, userId), isNotNull(Notes.simpleNoteId)))
    .orderBy(desc(Notes.simpleNoteId))
    .limit(1);
  await db.insert(UserMetadata).values({
    id: `user_metadata_${userId}`,
    userId,
    highestSimpleNoteId: highest.length > 0 ? highest[0].simpleNoteId || 0 : 0,
    userColor: 'blue',
    currentSeason: getCurrentSeason(),
    createdAt: nowISO(),
  });
}

export function prepareTemplateInstall(
  payload: TemplatePayload,
  listing: { title: string; description: string | null },
  userId: string,
): PreparedTemplate {
  const templateId = `ntpl_${crypto.randomUUID()}`;
  const timestamp = new Date();
  return {
    kind: 'template',
    primaryRefId: templateId,
    createdIds: { templateId },
    row: {
      id: templateId,
      userId,
      // Personal scope. An installed template is yours, not your space's —
      // putting it in front of a room is a separate, deliberate act.
      spaceId: null,
      orgId: null,
      name: payload.name?.trim().slice(0, 120) || listing.title,
      description: listing.description?.trim().slice(0, NOTE_TEMPLATE_DESCRIPTION_MAX_LENGTH) || null,
      title: payload.title?.trim().slice(0, 120) || null,
      content: payload.content,
      noteType: payload.noteType ?? 'default',
      iconColor: isNoteTemplateIconColor(payload.iconColor) ? payload.iconColor : 'blue',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  };
}

/**
 * One link into the installer's own library.
 *
 * Returns a failure the caller turns into a 4xx when the snapshotted URL no
 * longer validates — a listing can sit in the catalog for months, and the rules
 * that govern what may be stored are the install-time ones, not the ones that
 * happened to apply when it was submitted.
 */
export async function prepareResourceInstall(
  payload: ResourcePayload,
  userId: string,
): Promise<PreparedResource | { error: string; code: string; status: 400 }> {
  const validation = validateResourceUrl(payload.sourceUrl);
  if (!validation.isValid || !validation.normalizedUrl) {
    return {
      status: 400,
      code: validation.code || 'INVALID_URL',
      error: validation.error || 'That link is no longer valid.',
    };
  }
  const normalizedUrl = validation.normalizedUrl;
  const library = await ensurePersonalLibrary(userId);

  /* Soft duplicate, matching /api/library/items/create: report the item they
     already have rather than refusing or writing a second copy. */
  const duplicate = first(
    await db
      .select({ id: LibraryItems.id })
      .from(LibraryItems)
      .where(
        and(
          eq(LibraryItems.libraryId, library.id),
          eq(LibraryItems.sourceUrl, normalizedUrl),
          isNull(LibraryItems.archivedAt),
        ),
      )
      .limit(1),
  );

  const itemId = duplicate?.id ?? `libi_${crypto.randomUUID()}`;
  const timestamp = now();
  return {
    kind: 'resource',
    primaryRefId: itemId,
    createdIds: { libraryItemId: itemId },
    duplicateOf: duplicate?.id ?? null,
    row: {
      id: itemId,
      libraryId: library.id,
      kind: 'link',
      title: payload.title,
      description: payload.description,
      sourceUrl: normalizedUrl,
      sourceDomain: extractDomain(normalizedUrl),
      sourceSiteName: payload.sourceSiteName,
      sourceImage: payload.sourceImage,
      fileStorageKey: null,
      fileName: null,
      fileMime: null,
      fileBytes: null,
      access: 'members',
      createdByUserId: userId,
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
    },
  };
}

/** Shared by the note and pack branches — one snapshotted note becomes one row. */
function buildNoteRow(input: {
  note: NotePayload;
  newNoteId: string;
  threadId: string;
  spaceId: string;
  userId: string;
  authorDisplayName: string | null;
  createdAt: Date;
  simpleNoteId: number;
}): { row: NoteInsert; content: string } {
  const content = transformCanonicalScriptureContent({
    noteId: input.newNoteId,
    content: input.note.content ?? '',
    translation: 'NET',
    pillsOnly: input.note.noteType !== 'scripture',
  }).updatedContent;

  return {
    content,
    row: {
      id: input.newNoteId,
      title: input.note.title || null,
      content,
      threadId: input.threadId,
      spaceId: input.spaceId,
      simpleNoteId: input.simpleNoteId,
      noteType: input.note.noteType || 'default',
      userId: input.userId,
      isPublic: false,
      addedBy: 'discover',
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      lastVisited: input.note.noteType === 'scripture' ? null : input.createdAt,
      contentEncrypted: false,
      // The first caller in the codebase to pass a real display name — both
      // shared.ts callers pass null, because a share link resolves the author
      // live. A listing cannot: its byline was frozen at submit.
      ...buildIndependentCopyAttribution({
        sourceNoteId: input.note.sourceId,
        sourceVersionId: input.note.sourceVersionId,
        sourceAuthorId: input.note.sourceAuthorId,
        sourceAuthorDisplayName: input.authorDisplayName,
      }),
    },
  };
}

function sidecarRows(note: NotePayload, newNoteId: string, ts: Date) {
  const scripture: (typeof ScriptureMetadata.$inferInsert)[] = [];
  const resource: (typeof ResourceMetadata.$inferInsert)[] = [];
  if (note.scripture) {
    scripture.push({
      id: `scripture_${newNoteId}_${crypto.randomUUID()}`,
      noteId: newNoteId,
      reference: note.scripture.reference,
      book: note.scripture.book,
      chapter: note.scripture.chapter,
      verse: note.scripture.verse,
      verseEnd: note.scripture.verseEnd,
      chapterEnd: note.scripture.chapterEnd,
      translation: note.scripture.translation,
      originalText: note.scripture.originalText,
      createdAt: ts,
    });
  }
  if (note.resource) {
    resource.push({
      id: `resource_${newNoteId}_${crypto.randomUUID()}`,
      noteId: newNoteId,
      sourceUrl: note.resource.sourceUrl,
      sourceDomain: note.resource.sourceDomain,
      sourceName: note.resource.sourceName,
      sourceTitle: note.resource.sourceTitle,
      sourceDescription: note.resource.sourceDescription,
      sourceImage: note.resource.sourceImage,
      createdAt: ts,
    });
  }
  return { scripture, resource };
}

/** One note into the installer's unorganized thread, exactly as a shared note arrives. */
export async function prepareNoteInstall(
  payload: NotePayload,
  authorDisplayName: string | null,
  userId: string,
): Promise<PreparedNotes> {
  await ensureUserMetadata(userId);
  const effectiveHighest = await getEffectiveHighestSimpleNoteId(userId);
  const spaceId = await ensurePersonalHomeSpace(userId);
  const newNoteId = generateNoteId();
  const ts = nowISO();
  const createdAt = new Date();

  const { row } = buildNoteRow({
    note: payload,
    newNoteId,
    threadId: 'thread_unorganized',
    spaceId,
    userId,
    authorDisplayName,
    createdAt,
    simpleNoteId: effectiveHighest + 1,
  });
  const sidecars = sidecarRows(payload, newNoteId, ts);

  return {
    kind: 'note',
    primaryRefId: newNoteId,
    createdIds: { noteId: newNoteId },
    thread: null,
    noteRows: [row],
    junctionRows: [],
    scriptureRows: sidecars.scripture,
    resourceRows: sidecars.resource,
    referenceRows: [],
    effectiveHighest,
    threadIdForScripture: 'thread_unorganized',
    threadTitle: null,
    threadSubtitle: null,
  };
}

/** A whole pack: one new thread, N notes, and the edges between them. */
export async function preparePackInstall(
  payload: PackPayload,
  authorDisplayName: string | null,
  userId: string,
): Promise<PreparedNotes> {
  await ensureUserMetadata(userId);
  const effectiveHighest = await getEffectiveHighestSimpleNoteId(userId);
  const spaceId = await ensurePersonalHomeSpace(userId);
  const newThreadId = generateThreadId();
  const ts = nowISO();
  const base = Date.now();

  const noteRows: NoteInsert[] = [];
  const junctionRows: (typeof NoteThreads.$inferInsert)[] = [];
  const scriptureRows: (typeof ScriptureMetadata.$inferInsert)[] = [];
  const resourceRows: (typeof ResourceMetadata.$inferInsert)[] = [];
  const sourceToNew = new Map<string, string>();
  const createdNoteIds: string[] = [];

  payload.notes.forEach((note, index) => {
    const newNoteId = generateNoteId();
    sourceToNew.set(note.sourceId, newNoteId);
    const createdAt = new Date(base + index);
    const { row } = buildNoteRow({
      note,
      newNoteId,
      threadId: newThreadId,
      spaceId,
      userId,
      authorDisplayName,
      createdAt,
      simpleNoteId: effectiveHighest + 1 + index,
    });
    noteRows.push(row);
    junctionRows.push({
      id: `note-thread-${newNoteId}-${base + index}-${crypto.randomUUID().slice(0, 9)}`,
      noteId: newNoteId,
      threadId: newThreadId,
      createdAt: ts,
    } as typeof NoteThreads.$inferInsert);
    const sidecars = sidecarRows(note, newNoteId, ts);
    scriptureRows.push(...sidecars.scripture);
    resourceRows.push(...sidecars.resource);
    createdNoteIds.push(newNoteId);
  });

  const referenceRows: (typeof NoteScriptureReferences.$inferInsert)[] = [];
  const seen = new Set<string>();
  for (const edge of payload.references ?? []) {
    const from = sourceToNew.get(edge.from);
    const to = sourceToNew.get(edge.to);
    if (!from || !to) continue;
    const key = `${from}:${to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    referenceRows.push({
      id: `note-scripture-${from}-${to}-${crypto.randomUUID()}`,
      noteId: from,
      scriptureNoteId: to,
      createdAt: ts,
    } as typeof NoteScriptureReferences.$inferInsert);
  }

  return {
    kind: 'pack',
    primaryRefId: newThreadId,
    createdIds: { threadId: newThreadId, noteIds: createdNoteIds },
    thread: {
      id: newThreadId,
      title: payload.thread.title,
      subtitle: payload.thread.subtitle,
      // Lands in My Home like any imported thread, never in a shared space.
      spaceId: null,
      userId,
      isPublic: false,
      color: payload.thread.color || 'paper',
      createdAt: ts,
      updatedAt: ts,
      lastVisited: ts,
    } as typeof Threads.$inferInsert,
    noteRows,
    junctionRows,
    scriptureRows,
    resourceRows,
    referenceRows,
    effectiveHighest,
    threadIdForScripture: newThreadId,
    threadTitle: payload.thread.title,
    threadSubtitle: payload.thread.subtitle,
  };
}

/**
 * The inserts. Called inside the caller's transaction, after the install row.
 *
 * `simpleNoteId` is re-derived here under `FOR UPDATE` rather than trusted from
 * prepare: two installs racing would otherwise both read the same high-water
 * mark and hand out the same numbers.
 */
export async function writeInstall(tx: Tx, prepared: PreparedInstall, userId: string): Promise<void> {
  if (prepared.kind === 'template') {
    await tx.insert(NoteTemplates).values(prepared.row);
    return;
  }

  if (prepared.kind === 'resource') {
    // Already on their shelf; the install row still gets written, so the count
    // and the "already yours" answer stay right.
    if (!prepared.duplicateOf) await tx.insert(LibraryItems).values(prepared.row);
    return;
  }

  const locked = first(
    await tx.select().from(UserMetadata).where(eq(UserMetadata.userId, userId)).for('update').limit(1),
  );
  if (!locked) throw new Error('User metadata missing during Discover install');

  if (prepared.thread) await tx.insert(Threads).values(prepared.thread);

  const firstSimpleNoteId = Math.max(prepared.effectiveHighest, locked.highestSimpleNoteId ?? 0) + 1;
  prepared.noteRows.forEach((row, index) => {
    row.simpleNoteId = firstSimpleNoteId + index;
  });

  for (let i = 0; i < prepared.noteRows.length; i += BULK_INSERT_CHUNK) {
    await tx.insert(Notes).values(prepared.noteRows.slice(i, i + BULK_INSERT_CHUNK));
  }
  for (const row of prepared.noteRows) {
    await createInitialNoteVersion(tx, {
      noteId: row.id,
      noteAuthorId: userId,
      content: { title: row.title ?? null, content: row.content ?? '', contentEncrypted: false },
      createdAt: row.createdAt,
      source: 'discover-install',
    });
  }
  for (let i = 0; i < prepared.junctionRows.length; i += BULK_INSERT_CHUNK) {
    await tx.insert(NoteThreads).values(prepared.junctionRows.slice(i, i + BULK_INSERT_CHUNK));
  }
  for (let i = 0; i < prepared.scriptureRows.length; i += BULK_INSERT_CHUNK) {
    await tx.insert(ScriptureMetadata).values(prepared.scriptureRows.slice(i, i + BULK_INSERT_CHUNK));
  }
  for (let i = 0; i < prepared.resourceRows.length; i += BULK_INSERT_CHUNK) {
    await tx.insert(ResourceMetadata).values(prepared.resourceRows.slice(i, i + BULK_INSERT_CHUNK));
  }
  for (let i = 0; i < prepared.referenceRows.length; i += BULK_INSERT_CHUNK) {
    await tx.insert(NoteScriptureReferences).values(prepared.referenceRows.slice(i, i + BULK_INSERT_CHUNK));
  }
  if (prepared.noteRows.length > 0) {
    await tx
      .update(UserMetadata)
      .set({ highestSimpleNoteId: firstSimpleNoteId + prepared.noteRows.length - 1, updatedAt: nowISO() })
      .where(eq(UserMetadata.userId, userId));
  }
}

/**
 * Scripture processing and XP. Non-fatal by design: the copy is already durable,
 * and a pill that resolves a minute late is not worth failing an install over.
 */
export async function runInstallPostCommit(
  prepared: PreparedInstall,
  userId: string,
): Promise<string[]> {
  if (prepared.kind === 'template' || prepared.kind === 'resource') return [];
  const warnings: string[] = [];

  for (const row of prepared.noteRows) {
    if (!row.content) continue;
    try {
      await processScriptureReferences(
        row.id,
        userId,
        prepared.threadIdForScripture,
        row.content,
        'NET',
        { pillsOnly: row.noteType !== 'scripture', persistParentContent: false },
      );
    } catch (error) {
      console.warn('[discover-install] copy is durable; scripture postprocessing failed', {
        noteId: row.id,
        error,
      });
      warnings.push('Scripture references will finish processing later.');
    }
  }

  try {
    const items = prepared.noteRows.map((row) => ({
      noteId: row.id,
      isScripture: row.noteType === 'scripture',
      content: row.content ?? '',
    }));
    for (let i = 0; i < items.length; i += XP_AWARD_CONCURRENCY) {
      await Promise.all(
        items
          .slice(i, i + XP_AWARD_CONCURRENCY)
          .map((x) => awardNoteCreatedXP(userId, x.noteId, x.isScripture, x.content).catch(() => {})),
      );
    }
    if (prepared.kind === 'pack' && prepared.createdIds.threadId) {
      await awardThreadCreatedXP(
        userId,
        prepared.createdIds.threadId,
        prepared.threadTitle ?? '',
        prepared.threadSubtitle,
      );
    }
  } catch (error) {
    console.warn('[discover-install] XP postprocessing failed', error);
  }

  // De-duplicated: one line per install is the useful signal, not one per note.
  return [...new Set(warnings)];
}
