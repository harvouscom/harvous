/**
 * Import sessions — the durable state behind a multi-request import run.
 *
 * A single-request import can't show per-file progress and can't survive the
 * function timeout, so an import now spans many small requests: create session →
 * upload+parse each file → commit items in batches → enrich → finalize. Everything
 * those requests need to share (parsed rows, the portable-id → note-id map used to
 * restore a backup's connection graph, running counters) lives in these two tables
 * because serverless instances share no memory.
 */
import {
  db, first, Notes, NoteVersions, NoteConnections, ImportSessions, ImportSessionItems,
  and, eq, inArray, lt, notInArray, sql,
} from '../db';
import { nowISO } from '../db/dates';
import { deleteNotesCascadeForUser } from './delete-note-cascade';
import type { ParsedImportRow } from './parse-import-files';

export const IMPORT_LIMITS = {
  /** Per uploaded file. Kept under the 50MB library-upload ceiling — see the payload note in the plan. */
  maxFileBytes: 25 * 1024 * 1024,
  /** Files (including entries expanded from a zip) per session. */
  maxFiles: 200,
  /** Parsed notes per session — a CSV or .enex can be many notes per file. */
  maxItems: 2000,
  /** Parsed notes from a single file, so one pathological file can't fill a session. */
  maxItemsPerFile: 500,
  /** Manifest connection pairs stored on the session. */
  maxManifestConnections: 5000,
  /** Items a single commit request will process (keeps each request well inside the timeout). */
  maxCommitBatch: 10,
  /** Items a single enrich request will process — scripture work is the slow part. */
  maxEnrichBatch: 5,
  /** How long an unfinished session sticks around. */
  ttlMs: 24 * 60 * 60 * 1000,
} as const;

/**
 * Version sources the import itself writes: the initial insert, and the rewrite
 * scripture processing does when it turns references into pills. A note carrying
 * only these has not been touched by the user, so undo may take it back.
 */
const IMPORT_OWNED_VERSION_SOURCES = ['import', 'scripture-processing'];

/** Extensions the server will parse. `.zip` is expanded by the client into its entries. */
const SUPPORTED_EXTENSIONS = new Set([
  'md', 'markdown', 'txt', 'csv', 'docx', 'html', 'htm', 'pdf', 'enex',
]);

export function isSupportedImportExtension(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return SUPPORTED_EXTENSIONS.has(ext);
}

export type ImportSessionRow = typeof ImportSessions.$inferSelect;
export type ImportSessionItemRow = typeof ImportSessionItems.$inferSelect;

export interface ImportItemSummary {
  itemId: string;
  clientFileId: string | null;
  fileName: string;
  title: string;
  folderPath: string | null;
  primaryCollection: string | null;
  highlightCount: number;
  tagCount: number;
  sourceType: string;
  status: string;
  duplicateHint: string | null;
  resultNoteId: string | null;
  enriched: boolean;
  error: string | null;
}

export interface ImportSessionSummary {
  sessionId: string;
  status: string;
  notesImported: number;
  threadsCreated: number;
  tagsCreated: number;
  duplicatesSkipped: number;
  highlightsImported: number;
  connectionsImported: number;
  scriptureProcessed: number;
  autoTagsApplied: number;
}

export function buildImportItemSummary(item: ImportSessionItemRow): ImportItemSummary {
  return {
    itemId: item.id,
    clientFileId: item.clientFileId,
    fileName: item.fileName,
    title: item.title,
    folderPath: item.folderPath,
    primaryCollection: item.primaryCollection,
    highlightCount: item.highlightCount,
    tagCount: item.tagCount,
    sourceType: item.sourceType,
    status: item.status,
    duplicateHint: item.duplicateHint,
    resultNoteId: item.resultNoteId,
    enriched: item.enrichedAt != null,
    error: item.error,
  };
}

export function buildImportSessionSummary(session: ImportSessionRow): ImportSessionSummary {
  return {
    sessionId: session.id,
    status: session.status,
    notesImported: session.notesImported,
    threadsCreated: session.threadsCreated,
    tagsCreated: session.tagsCreated,
    duplicatesSkipped: session.duplicatesSkipped,
    highlightsImported: session.highlightsImported,
    connectionsImported: session.connectionsImported,
    scriptureProcessed: session.scriptureProcessed,
    autoTagsApplied: session.autoTagsApplied,
  };
}

/**
 * Start a session, reaping this user's expired ones on the way in. Opportunistic
 * cleanup rather than a scheduled function: only the owner's rows matter, and the
 * only moment they reliably care is when starting another import.
 */
export async function createImportSession(userId: string): Promise<ImportSessionRow> {
  const now = new Date();
  try {
    const expired = await db
      .select({ id: ImportSessions.id })
      .from(ImportSessions)
      .where(and(eq(ImportSessions.userId, userId), lt(ImportSessions.expiresAt, now)));
    if (expired.length > 0) {
      const ids = expired.map((row) => row.id);
      await db.delete(ImportSessionItems).where(inArray(ImportSessionItems.sessionId, ids));
      await db.delete(ImportSessions).where(inArray(ImportSessions.id, ids));
    }
  } catch {
    // Cleanup is best-effort; never block a new import on it.
  }

  const session = first(
    await db
      .insert(ImportSessions)
      .values({
        id: `impsess_${crypto.randomUUID()}`,
        userId,
        status: 'open',
        createdAt: now,
        expiresAt: new Date(now.getTime() + IMPORT_LIMITS.ttlMs),
      })
      .returning(),
  )!;
  return session;
}

/** Fetch a session the caller owns. Returns null for missing, foreign, or expired sessions. */
export async function getImportSession(sessionId: string, userId: string): Promise<ImportSessionRow | null> {
  const session = first(
    await db
      .select()
      .from(ImportSessions)
      .where(and(eq(ImportSessions.id, sessionId), eq(ImportSessions.userId, userId)))
      .limit(1),
  );
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) return null;
  return session;
}

/** Same, but also requires the session to still be accepting work. */
export async function getOpenImportSession(sessionId: string, userId: string): Promise<ImportSessionRow | null> {
  const session = await getImportSession(sessionId, userId);
  if (!session || session.status !== 'open') return null;
  return session;
}

export async function getImportSessionItems(sessionId: string): Promise<ImportSessionItemRow[]> {
  return db
    .select()
    .from(ImportSessionItems)
    .where(eq(ImportSessionItems.sessionId, sessionId))
    .orderBy(ImportSessionItems.ord);
}

export async function countImportSessionItems(sessionId: string): Promise<number> {
  const row = first(
    await db
      .select({ value: sql<number>`count(*)::int` })
      .from(ImportSessionItems)
      .where(eq(ImportSessionItems.sessionId, sessionId)),
  );
  return row?.value ?? 0;
}

/** Distinct client file rows already uploaded into this session. */
export async function countImportSessionFiles(sessionId: string): Promise<number> {
  const row = first(
    await db
      .select({ value: sql<number>`count(distinct ${ImportSessionItems.clientFileId})::int` })
      .from(ImportSessionItems)
      .where(eq(ImportSessionItems.sessionId, sessionId)),
  );
  return row?.value ?? 0;
}

/**
 * The parts of a `ParsedImportRow` that survive the trip through the database.
 * `index` is dropped (it only ordered rows inside one parse call) and the promoted
 * display fields are rebuilt from their columns on the way back out.
 */
interface StoredImportPayload {
  note: ParsedImportRow['note'];
  portableBuild?: ParsedImportRow['portableBuild'];
  secondaryCollections: string[];
}

export function importItemPayloadToRow(item: ImportSessionItemRow): ParsedImportRow {
  const payload = JSON.parse(item.payload) as StoredImportPayload;
  return {
    index: item.ord,
    fileName: item.fileName,
    folderPath: item.folderPath,
    title: item.title,
    highlightCount: item.highlightCount,
    tagCount: item.tagCount,
    sourceType: item.sourceType,
    primaryCollection: item.primaryCollection,
    secondaryCollections: payload.secondaryCollections ?? [],
    note: payload.note,
    portableBuild: payload.portableBuild,
  };
}

export interface InsertImportItemsInput {
  sessionId: string;
  userId: string;
  clientFileId: string | null;
  fileSize: number;
  rows: ParsedImportRow[];
  startOrd: number;
  /** Existing note ids and dedupe keys, for the advisory duplicate badge shown in review. */
  duplicateHintFor: (row: ParsedImportRow) => { hint: 'id' | 'content' | null; sourceId: string | null };
}

export async function insertImportItems(input: InsertImportItemsInput): Promise<ImportSessionItemRow[]> {
  if (input.rows.length === 0) return [];
  const createdAt = new Date();
  const values = input.rows.map((row, i) => {
    const { hint, sourceId } = input.duplicateHintFor(row);
    const payload: StoredImportPayload = {
      note: row.note,
      portableBuild: row.portableBuild,
      secondaryCollections: row.secondaryCollections,
    };
    return {
      id: `impitem_${crypto.randomUUID()}`,
      sessionId: input.sessionId,
      userId: input.userId,
      clientFileId: input.clientFileId,
      fileName: row.fileName,
      folderPath: row.folderPath,
      sourceType: row.sourceType,
      fileSize: input.fileSize,
      ord: input.startOrd + i,
      title: row.title,
      highlightCount: row.highlightCount,
      tagCount: row.tagCount,
      primaryCollection: row.primaryCollection,
      payload: JSON.stringify(payload),
      sourceId,
      status: 'parsed',
      duplicateHint: hint,
      createdAt,
    };
  });
  return db.insert(ImportSessionItems).values(values).returning();
}

export async function setImportItemsIncluded(
  sessionId: string,
  itemIds: string[],
  included: boolean,
): Promise<void> {
  if (itemIds.length === 0) return;
  await db
    .update(ImportSessionItems)
    .set({ status: included ? 'parsed' : 'excluded', updatedAt: new Date() })
    .where(
      and(
        eq(ImportSessionItems.sessionId, sessionId),
        inArray(ImportSessionItems.id, itemIds),
        // Never resurrect or exclude something already written to the library.
        inArray(ImportSessionItems.status, ['parsed', 'excluded']),
      ),
    );
}

export async function storeImportManifest(
  sessionId: string,
  connections: Array<{ fromNoteId: string; toNoteId: string }>,
): Promise<number> {
  const trimmed = connections
    .filter((c) => typeof c?.fromNoteId === 'string' && typeof c?.toNoteId === 'string')
    .slice(0, IMPORT_LIMITS.maxManifestConnections)
    .map((c) => ({ fromNoteId: c.fromNoteId, toNoteId: c.toNoteId }));
  await db
    .update(ImportSessions)
    .set({ manifestConnections: JSON.stringify(trimmed), updatedAt: new Date() })
    .where(eq(ImportSessions.id, sessionId));
  return trimmed.length;
}

export async function bumpImportSessionCounters(
  sessionId: string,
  delta: Partial<Record<
    'notesImported' | 'threadsCreated' | 'tagsCreated' | 'duplicatesSkipped'
    | 'highlightsImported' | 'scriptureProcessed' | 'autoTagsApplied',
    number
  >>,
): Promise<void> {
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const [key, value] of Object.entries(delta)) {
    if (!value) continue;
    const column = sql.identifier(key);
    patch[key] = sql`${column} + ${value}`;
  }
  if (Object.keys(patch).length === 1) return;
  await db.update(ImportSessions).set(patch).where(eq(ImportSessions.id, sessionId));
}

/**
 * Close out a session: rebuild the portable-id → note-id map from the committed and
 * duplicate items, restore the backup's connection graph through it, and mark done.
 * Idempotent — finalizing an already-finished session returns the stored summary.
 */
export async function finalizeImportSession(
  sessionId: string,
  userId: string,
): Promise<{ summary: ImportSessionSummary; items: ImportItemSummary[] } | null> {
  const session = await getImportSession(sessionId, userId);
  if (!session) return null;

  const items = await getImportSessionItems(sessionId);
  if (session.status === 'done') {
    return { summary: buildImportSessionSummary(session), items: items.map(buildImportItemSummary) };
  }

  let connectionsImported = 0;
  const manifest = session.manifestConnections
    ? (JSON.parse(session.manifestConnections) as Array<{ fromNoteId: string; toNoteId: string }>)
    : [];

  if (manifest.length > 0) {
    // Duplicates map too: re-importing a backup should still restore edges that point
    // at notes the user already has.
    const sourceIdToNoteId = new Map<string, string>();
    for (const item of items) {
      if (item.sourceId && item.resultNoteId) sourceIdToNoteId.set(item.sourceId, item.resultNoteId);
    }

    const rows: (typeof NoteConnections.$inferInsert)[] = [];
    const seenPairs = new Set<string>();
    for (const conn of manifest) {
      const from = sourceIdToNoteId.get(conn.fromNoteId);
      const to = sourceIdToNoteId.get(conn.toNoteId);
      if (!from || !to || from === to) continue;
      const key = `${from}→${to}`;
      if (seenPairs.has(key)) continue;
      seenPairs.add(key);
      rows.push({
        id: `conn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        fromNoteId: from,
        toNoteId: to,
        userId,
        spaceId: null,
        createdAt: nowISO(),
      });
    }
    if (rows.length > 0) {
      try {
        await db.insert(NoteConnections).values(rows).onConflictDoNothing();
        connectionsImported = rows.length;
      } catch {
        // A partially restorable graph is still worth the import; surfaced as 0 connections.
      }
    }
  }

  const updated = first(
    await db
      .update(ImportSessions)
      .set({ status: 'done', connectionsImported, updatedAt: new Date() })
      .where(eq(ImportSessions.id, sessionId))
      .returning(),
  )!;

  return { summary: buildImportSessionSummary(updated), items: items.map(buildImportItemSummary) };
}

/** Drop an unfinished session and its parsed items. Nothing was written to the library yet. */
export async function abandonImportSession(sessionId: string, userId: string): Promise<void> {
  const session = first(
    await db
      .select({ id: ImportSessions.id })
      .from(ImportSessions)
      .where(and(eq(ImportSessions.id, sessionId), eq(ImportSessions.userId, userId)))
      .limit(1),
  );
  if (!session) return;
  await db.delete(ImportSessionItems).where(eq(ImportSessionItems.sessionId, sessionId));
  await db
    .update(ImportSessions)
    .set({ status: 'abandoned', updatedAt: new Date() })
    .where(eq(ImportSessions.id, sessionId));
}

/**
 * Undo a finished import: delete the notes it created, through the same cascade the
 * normal delete path uses (versions, joins, sync tombstones). Notes the user has
 * edited since the import are left alone — undo removes what the import added, not
 * work done on top of it.
 */
export async function undoImportSession(
  sessionId: string,
  userId: string,
): Promise<{ deletedNoteIds: string[]; keptEditedNoteIds: string[] } | null> {
  const session = await getImportSession(sessionId, userId);
  if (!session) return null;

  const items = await db
    .select()
    .from(ImportSessionItems)
    .where(and(eq(ImportSessionItems.sessionId, sessionId), eq(ImportSessionItems.status, 'committed')));
  const candidateIds = items.map((item) => item.resultNoteId).filter((id): id is string => !!id);
  if (candidateIds.length === 0) {
    await db
      .update(ImportSessions)
      .set({ status: 'abandoned', updatedAt: new Date() })
      .where(eq(ImportSessions.id, sessionId));
    return { deletedNoteIds: [], keptEditedNoteIds: [] };
  }

  const noteRows = await db
    .select({ id: Notes.id })
    .from(Notes)
    .where(and(eq(Notes.userId, userId), inArray(Notes.id, candidateIds)));
  const ownedIds = noteRows.map((row) => row.id);

  // Which notes has the user actually worked on since the import? Not `updatedAt` —
  // scripture processing stamps that on every imported note the moment it runs, so
  // it would keep everything. Version provenance is the honest signal: an untouched
  // imported note has only the versions the import itself wrote.
  const editedRows = ownedIds.length
    ? await db
        .selectDistinct({ noteId: NoteVersions.noteId })
        .from(NoteVersions)
        .where(
          and(
            inArray(NoteVersions.noteId, ownedIds),
            notInArray(NoteVersions.source, IMPORT_OWNED_VERSION_SOURCES),
          ),
        )
    : [];
  const edited = new Set(editedRows.map((row) => row.noteId));

  const deletable = ownedIds.filter((id) => !edited.has(id));
  const kept = ownedIds.filter((id) => edited.has(id));

  const result = await deleteNotesCascadeForUser(userId, deletable);

  if (result.deletedNoteIds.length > 0) {
    await db
      .update(ImportSessionItems)
      .set({ status: 'failed', error: 'Undone', updatedAt: new Date() })
      .where(
        and(
          eq(ImportSessionItems.sessionId, sessionId),
          inArray(ImportSessionItems.resultNoteId, result.deletedNoteIds),
        ),
      );
  }

  await db
    .update(ImportSessions)
    .set({ status: 'abandoned', updatedAt: new Date() })
    .where(eq(ImportSessions.id, sessionId));

  return { deletedNoteIds: result.deletedNoteIds, keptEditedNoteIds: kept };
}
