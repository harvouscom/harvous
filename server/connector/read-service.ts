/**
 * `connectorReadService` — every read the Connector makes, as plain data.
 *
 * MCP-free on purpose: tools.ts adapts these to tool results, and a future REST surface
 * (`/api/connector/*`, deferred) would adapt the same functions. Each function scopes to the
 * authenticated `userId`, reuses the query the app itself runs (search, space lists, study
 * threads, share links — see the imports), and returns only what shapes.ts lets out.
 *
 * Hard rules, checked by tools-contract.test.ts:
 *   - read-only: never call a helper that writes as a side effect (`ensurePersonalHomeSpace`,
 *     `healScriptureNoteThreadsFromParents`, `ensureUnorganizedThread`). `requireSpaceAccess`
 *     restoring a missing owner-membership row is an accepted integrity repair, not a write
 *     of the person's content.
 *   - no verse text from the Bible tables, no roster, no author names.
 */

import {
  db,
  Notes,
  ScriptureMetadata,
  StudyThreadEntries,
  eq,
  and,
  or,
  ne,
  like,
  sql,
  isNull,
  isNotNull,
  desc,
  gte,
  inArray,
  first,
  UserMetadata,
  ReadingEvents,
} from '../db';
import { searchNoteRows, classifySearchScope } from '../utils/search-notes-query';
import { requireSpaceAccess, SpaceAccessError } from '../utils/space-access';
import {
  getMemberOfSpaces,
  getNotesForSharedSpace,
  getNotesForSpace,
  getSpacesWithCounts,
  getTagNamesForNotesBatch,
  getThreadsForSpace,
  getThreadsForSpaceBySpaceId,
  getNotesForThread,
  getNotesForThreadForMember,
  visibleSharedThreadsForViewer,
} from '../utils/dashboard-data';
import { requireThreadReadAccess, SharedSpaceLifecycleError } from '../utils/shared-space-lifecycle';
import { getPassageContext, type CrossReference } from '../utils/scripture-knowledge';
import { getUserNoteVisitAggregate } from '../utils/record-note-visit';
import { collapseReadingHistory } from '../utils/record-reading-event';
import { parseLastReadPosition } from '@/utils/last-read-position';
import { readingDwellCountsAsRead, type ReadingDwellBucket } from '@/utils/reading-event-kinds';
import { bibleBookChapterCounts } from '@/utils/bible-book-chapters';
import { deriveContinueReading, pickContinueNote } from '@/utils/prototype-home-trends';
import { findSharedSpaceForNote, sharedSpaceNoteAssociation } from '../utils/note-read-access';
import { listStudyThreadsForSpace } from '../utils/space-study-threads';
import { collectStudyThreadGraphForScope } from '../utils/study-thread-space';
import { fetchStudyThreadNoteRows } from '../utils/study-thread-note-rows';
import { findPublicSharedNoteByToken } from '../utils/shared-note-lookup';
import { extractScripturePillsFromHtml } from '../utils/crossref-gaps';
import { findNotesCitingReference } from '../utils/notes-by-reference';
import { canonicalizeServiceReference } from '../utils/church-service-passage';
import { parseScriptureReference } from '@/utils/scripture-detector';
import { verseKeysFromScriptureReference } from '@/utils/scripture-verse-keys';
import { parseNoteSecondaryCollections } from '../utils/note-secondary-collections';
import { normalizeServerNoteId } from '../utils/normalize-note-id';
import { isValidShareToken } from '@/utils/ids';
import { MIN_SEARCH_QUERY_LENGTH } from '@/utils/search-query';
import { MAX_GRAPH_NODES, MAX_PASSAGE_HIGHLIGHTS, noteUrl } from './config';
import {
  ConnectorRefusal,
  NOTE_NOT_FOUND,
  SPACE_NOT_FOUND,
  decodeCursor,
  nextCursorFor,
  snippetFromHtml,
  toNoteDetail,
  toNoteSummary,
  type NoteDetail,
  type NoteSummary,
} from './shapes';

export interface Page {
  limit: number;
  cursor?: string | null;
}

function normalizeSpaceId(raw: string): string {
  const t = raw.trim();
  return t.startsWith('space_') ? t : `space_${t}`;
}

/** `requireSpaceAccess`, with its errors turned into refusals the reader can act on. */
async function spaceForViewer(rawSpaceId: string, userId: string) {
  try {
    return (await requireSpaceAccess(normalizeSpaceId(rawSpaceId), userId)).space;
  } catch (err) {
    if (err instanceof SpaceAccessError) {
      throw new ConnectorRefusal(err.status === 404 ? 'not_found' : 'no_access', SPACE_NOT_FOUND);
    }
    throw err;
  }
}

function isMyHome(space: { type: string; title: string }): boolean {
  return space.type === 'personal' && space.title.trim().toLowerCase() === 'my home';
}

// ─── search_notes ──────────────────────────────────────────────────────────────

export async function searchNotes(
  userId: string,
  args: { query: string; spaceId?: string | null } & Page,
): Promise<{ results: NoteSummary[]; nextCursor: string | null }> {
  const query = args.query.trim();
  if (query.length < MIN_SEARCH_QUERY_LENGTH) {
    throw new ConnectorRefusal('bad_request', `Search needs at least ${MIN_SEARCH_QUERY_LENGTH} characters.`);
  }
  const scope = { query, spaceId: args.spaceId ?? null };
  const offset = decodeCursor(args.cursor, 'search_notes', scope);
  const space = args.spaceId ? await spaceForViewer(args.spaceId, userId) : null;

  const rows = await searchNoteRows({
    userId,
    query,
    scope: classifySearchScope(space),
    spaceId: space?.id ?? null,
    threadId: null,
    // 2.0 study lives in notes with scripture pills; legacy scripture notes are Bible text.
    excludeLegacyScripture: true,
    limit: args.limit + 1,
    offset,
  });

  return {
    results: rows.slice(0, args.limit).map((row) =>
      toNoteSummary(
        {
          id: row.id,
          title: row.title,
          content: row.content,
          noteType: row.noteType,
          contentEncrypted: false,
          updatedAt: row.updatedAt,
          createdAt: row.createdAt,
          authorUserId: row.authorUserId,
          spaceId: space ? space.id : row.spaceId,
        },
        userId,
      ),
    ),
    nextCursor: nextCursorFor('search_notes', scope, offset, args.limit, rows.length),
  };
}

// ─── get_note ──────────────────────────────────────────────────────────────────

async function noteHighlights(noteId: string, userId: string) {
  const rows = await db
    .select({
      kind: StudyThreadEntries.entryKindRaw,
      anchorQuote: StudyThreadEntries.anchorQuote,
      anchorTextSnapshot: StudyThreadEntries.anchorTextSnapshot,
      miniNoteBody: StudyThreadEntries.miniNoteBody,
      notesBody: StudyThreadEntries.notesBody,
    })
    .from(StudyThreadEntries)
    .where(
      and(
        eq(StudyThreadEntries.parentNoteId, noteId),
        eq(StudyThreadEntries.userId, userId),
        eq(StudyThreadEntries.isArchived, false),
        // Scripture-anchored entries carry passage text from the Bible tables — out of scope.
        isNull(StudyThreadEntries.scriptureReference),
      ),
    )
    .orderBy(desc(StudyThreadEntries.createdAt))
    .limit(50);
  return rows
    .map((r) => ({
      text: (r.anchorQuote ?? r.anchorTextSnapshot ?? '').trim(),
      note: (r.miniNoteBody || r.notesBody || '').trim() || null,
      kind: r.kind,
    }))
    .filter((h) => h.text || h.note);
}

export async function getNote(
  userId: string,
  args: { noteId: string; spaceId?: string | null },
): Promise<NoteDetail> {
  const noteId = normalizeServerNoteId(args.noteId);
  const note = first(await db.select().from(Notes).where(eq(Notes.id, noteId)).limit(1));
  if (!note) throw new ConnectorRefusal('not_found', NOTE_NOT_FOUND);

  const isOwn = note.userId === userId;
  let space: { id: string; title: string } | null = null;

  if (args.spaceId) {
    const ctx = await spaceForViewer(args.spaceId, userId);
    if (ctx.type === 'personal') {
      if (!isOwn || (!isMyHome(ctx) && note.spaceId !== ctx.id)) {
        throw new ConnectorRefusal('not_found', NOTE_NOT_FOUND);
      }
    } else {
      const association = await sharedSpaceNoteAssociation({ space: ctx, note, viewerUserId: userId });
      // Your own locked note is still yours to see as metadata, whatever space you name.
      if (!association && !(isOwn && note.contentEncrypted)) {
        throw new ConnectorRefusal('not_found', NOTE_NOT_FOUND);
      }
      space = { id: ctx.id, title: ctx.title };
    }
  } else if (!isOwn) {
    if (note.contentEncrypted) throw new ConnectorRefusal('not_found', NOTE_NOT_FOUND);
    space = await findSharedSpaceForNote(note.id, userId);
    if (!space) throw new ConnectorRefusal('not_found', NOTE_NOT_FOUND);
  }

  if (note.contentEncrypted) {
    // toNoteDetail returns metadata only for your own locked note and refuses anyone else's.
    return toNoteDetail({ ...note, authorUserId: note.userId, content: null }, userId);
  }

  const legacy = note.noteType === 'scripture';
  const [tags, legacyMeta, highlights] = await Promise.all([
    isOwn ? getTagNamesForNotesBatch([note.id], userId).then((m) => m.get(note.id) ?? []) : [],
    legacy
      ? db
          .select({ reference: ScriptureMetadata.reference, translation: ScriptureMetadata.translation })
          .from(ScriptureMetadata)
          .where(eq(ScriptureMetadata.noteId, note.id))
          .limit(1)
          .then((rows) => first(rows) ?? null)
      : null,
    isOwn ? noteHighlights(note.id, userId) : [],
  ]);

  return toNoteDetail(
    {
      id: note.id,
      title: note.title,
      content: note.content,
      noteType: note.noteType,
      contentEncrypted: false,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      authorUserId: note.userId,
      folder: note.primaryCollection,
      otherFolders: parseNoteSecondaryCollections(note.secondaryCollections),
      tags,
      scriptureReferences: legacy ? [] : extractScripturePillsFromHtml(note.content),
      legacyScripture: legacyMeta,
      space,
      highlights,
    },
    userId,
  );
}

// ─── list_spaces ───────────────────────────────────────────────────────────────

export interface SpaceSummary {
  id: string;
  title: string;
  kind: 'personal' | 'shared' | 'public';
  role: 'owner' | 'member';
  isMyHome: boolean;
}

export async function listSpaces(
  userId: string,
  args: Page,
): Promise<{ spaces: SpaceSummary[]; nextCursor: string | null }> {
  const offset = decodeCursor(args.cursor, 'list_spaces', {});
  const [owned, joined] = await Promise.all([getSpacesWithCounts(userId), getMemberOfSpaces(userId)]);

  const kindOf = (type: string): SpaceSummary['kind'] =>
    type === 'shared' ? 'shared' : type === 'public' ? 'public' : 'personal';

  // Allowlisted fields only — the helpers also return member counts and church names,
  // which the Connector does not share.
  const all: SpaceSummary[] = [
    ...owned.map((s) => ({
      id: s.id,
      title: s.title?.trim() || 'Untitled space',
      kind: kindOf(s.type),
      role: 'owner' as const,
      isMyHome: isMyHome({ type: s.type, title: s.title ?? '' }),
    })),
    ...joined.map((s) => ({
      id: s.id,
      title: s.title?.trim() || 'Untitled space',
      kind: kindOf(s.type),
      role: 'member' as const,
      isMyHome: false,
    })),
  ];
  // My Home first, then the rest by title — a stable order so cursors stay meaningful.
  all.sort((a, b) => Number(b.isMyHome) - Number(a.isMyHome) || a.title.localeCompare(b.title));

  const page = all.slice(offset, offset + args.limit + 1);
  return {
    spaces: page.slice(0, args.limit),
    nextCursor: nextCursorFor('list_spaces', {}, offset, args.limit, page.length),
  };
}

// ─── list_threads_in_space ─────────────────────────────────────────────────────

export interface ThreadSummary {
  id: string;
  title: string;
  subtitle: string | null;
  noteCount: number;
  isCurrent: boolean;
  updatedAt: string | null;
}

export async function listThreadsInSpace(
  userId: string,
  args: { spaceId: string } & Page,
): Promise<{ space: { id: string; title: string }; threads: ThreadSummary[]; nextCursor: string | null }> {
  const space = await spaceForViewer(args.spaceId, userId);
  const scope = { spaceId: space.id };
  const offset = decodeCursor(args.cursor, 'list_threads_in_space', scope);

  // Same split as GET /api/spaces/:id/threads: personal spaces read your own threads;
  // shared ones read the space's, and members see only the current (pinned) thread.
  const threads =
    space.type === 'personal'
      ? await getThreadsForSpace(space.id, userId)
      : visibleSharedThreadsForViewer(await getThreadsForSpaceBySpaceId(space.id), space.userId === userId);

  const page = threads.slice(offset, offset + args.limit + 1);
  return {
    space: { id: space.id, title: space.title },
    threads: page.slice(0, args.limit).map((t) => ({
      id: t.id,
      title: t.title?.trim() || 'Untitled thread',
      subtitle: t.subtitle?.trim() || null,
      noteCount: t.noteCount,
      isCurrent: Boolean(t.isPinned),
      updatedAt: (t.updatedAt ?? t.createdAt)?.toISOString?.() ?? null,
    })),
    nextCursor: nextCursorFor('list_threads_in_space', scope, offset, args.limit, page.length),
  };
}

// ─── list_notes_in_space ───────────────────────────────────────────────────────

type SpaceNoteRow = {
  id: string;
  title: string | null;
  content: string | null;
  noteType?: string | null;
  contentEncrypted?: boolean | null;
  updatedAt?: Date | string | null;
  createdAt?: Date | string | null;
  primaryCollection?: string | null;
  authorUserId?: string | null;
  userId?: string | null;
};

export async function listNotesInSpace(
  userId: string,
  args: { spaceId: string } & Page,
): Promise<{
  space: { id: string; title: string };
  notes: NoteSummary[];
  total: number;
  nextCursor: string | null;
}> {
  const space = await spaceForViewer(args.spaceId, userId);
  const scope = { spaceId: space.id };
  const offset = decodeCursor(args.cursor, 'list_notes_in_space', scope);
  const options = { excludeLegacyScriptureNotes: true, sortByLastUpdated: true, space };

  // Mirrors GET /api/spaces/:id/notes. The shared helper already excludes every locked note,
  // so other members' locked notes are never listed; your own locked notes in a personal
  // space are listed as `locked: true` with no snippet.
  const result =
    space.type === 'personal'
      ? await getNotesForSpace(space.id, userId, args.limit, offset, options)
      : await getNotesForSharedSpace(space.id, userId, args.limit, offset, options);

  const notes = (result.notes as SpaceNoteRow[]).map((n) =>
    toNoteSummary(
      {
        id: n.id,
        title: n.title,
        content: n.content,
        noteType: n.noteType,
        contentEncrypted: n.contentEncrypted,
        updatedAt: n.updatedAt,
        createdAt: n.createdAt,
        authorUserId: n.authorUserId ?? n.userId ?? userId,
        folder: space.type === 'personal' ? (n.primaryCollection ?? null) : undefined,
      },
      userId,
    ),
  );

  return {
    space: { id: space.id, title: space.title },
    notes,
    total: result.total,
    // The helper pages itself and reports `hasMore`; nextCursorFor still applies the offset cap.
    nextCursor: result.hasMore
      ? nextCursorFor('list_notes_in_space', scope, offset, args.limit, args.limit + 1)
      : null,
  };
}

// ─── list_study_thread_connections ─────────────────────────────────────────────

export async function listStudyThreadConnections(
  userId: string,
  args: { noteId?: string | null; spaceId?: string | null } & Page,
): Promise<
  | {
      by: 'note';
      noteId: string;
      notes: Array<{ id: string; title: string; snippet: string | null }>;
      connections: Array<{ from: string; to: string }>;
      truncated: boolean;
    }
  | {
      by: 'space';
      space: { id: string; title: string };
      threads: Array<{ id: string; title: string; noteCount: number; noteIds: string[] }>;
      nextCursor: string | null;
    }
> {
  if (Boolean(args.noteId) === Boolean(args.spaceId)) {
    throw new ConnectorRefusal('bad_request', 'Pass exactly one of noteId or spaceId.');
  }

  if (args.noteId) {
    const noteId = normalizeServerNoteId(args.noteId);
    // Study threads are your own connections (NoteConnections are per person), as in the app.
    const focus = first(
      await db
        .select({ id: Notes.id })
        .from(Notes)
        .where(and(eq(Notes.id, noteId), eq(Notes.userId, userId)))
        .limit(1),
    );
    if (!focus) throw new ConnectorRefusal('not_found', NOTE_NOT_FOUND);

    const { graph } = await collectStudyThreadGraphForScope(noteId, userId, {
      maxNodes: MAX_GRAPH_NODES,
    });
    const rows = await fetchStudyThreadNoteRows(graph.nodeIds, userId);
    const byId = new Map(rows.map((r) => [r.id, r]));
    const notes = graph.nodeIds
      .map((id) => byId.get(id))
      .filter((r): r is NonNullable<typeof r> => r != null)
      .map((r) => ({
        id: r.id,
        title: r.title?.trim() || 'Untitled note',
        snippet: r.noteType === 'scripture' ? null : snippetFromHtml(r.content),
      }));
    const live = new Set(notes.map((n) => n.id));
    return {
      by: 'note',
      noteId,
      notes,
      connections: graph.edges
        .filter((e) => live.has(e.fromId) && live.has(e.toId))
        .map((e) => ({ from: e.fromId, to: e.toId })),
      truncated: graph.nodeIds.length >= MAX_GRAPH_NODES,
    };
  }

  const space = await spaceForViewer(args.spaceId!, userId);
  const scope = { spaceId: space.id };
  const offset = decodeCursor(args.cursor, 'list_study_thread_connections', scope);
  const threads = await listStudyThreadsForSpace(userId, space.id);
  const page = threads.slice(offset, offset + args.limit + 1);
  return {
    by: 'space',
    space: { id: space.id, title: space.title },
    threads: page.slice(0, args.limit).map((t) => ({
      id: t.id,
      title: t.title?.trim() || t.suggestedTitle?.trim() || 'Untitled thread',
      noteCount: t.noteCount,
      noteIds: t.memberIds.slice(0, MAX_GRAPH_NODES),
    })),
    nextCursor: nextCursorFor('list_study_thread_connections', scope, offset, args.limit, page.length),
  };
}

// ─── get_shared_note ───────────────────────────────────────────────────────────

const SHARE_URL_TOKEN = /\/shared\/note\/([A-Za-z0-9]+)\/?(?:[?#].*)?$/;

/** Accepts the bare token or a full `…/shared/note/<token>` link. */
export function shareTokenFrom(input: string): string | null {
  const trimmed = input.trim();
  const fromUrl = trimmed.match(SHARE_URL_TOKEN)?.[1];
  const token = fromUrl ?? trimmed;
  return isValidShareToken(token) ? token : null;
}

export async function getSharedNote(
  userId: string,
  args: { shareToken: string },
): Promise<NoteDetail> {
  const token = shareTokenFrom(args.shareToken);
  const notFound = new ConnectorRefusal('not_found', 'Share link not found, or no longer shared.');
  if (!token) throw notFound;
  const note = await findPublicSharedNoteByToken(token);
  if (!note) throw notFound;

  const legacy = note.noteType === 'scripture';
  const legacyMeta = legacy
    ? first(
        await db
          .select({ reference: ScriptureMetadata.reference, translation: ScriptureMetadata.translation })
          .from(ScriptureMetadata)
          .where(eq(ScriptureMetadata.noteId, note.id))
          .limit(1),
      ) ?? null
    : null;

  return toNoteDetail(
    {
      id: note.id,
      title: note.title,
      content: note.content,
      noteType: note.noteType,
      contentEncrypted: false,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      authorUserId: note.userId,
      scriptureReferences: legacy ? [] : extractScripturePillsFromHtml(note.content),
      legacyScripture: legacyMeta,
    },
    userId,
  );
}

// ─── find_by_passage ───────────────────────────────────────────────────────────

export interface PassageHighlight {
  /** The verse(s) highlighted, as stored ("Romans 8:28"). */
  reference: string;
  translation: string | null;
  /** `note` when the person wrote something on it; `highlight` when they only marked it. */
  kind: 'highlight' | 'note';
  /** The person's own words on it. Never Bible text. */
  note: string | null;
  /** The note it was made in, when it wasn't made while reading. */
  onNoteId: string | null;
  createdAt: string | null;
}

/**
 * The person's own highlights and annotations overlapping a passage.
 *
 * Selects only allowlisted columns: `scripturePassageExcerpt`, `sourceSnippet` and
 * `anchorQuote` can all hold Bible text, so they are never read. `mapStudyRow` is not
 * reused for the same reason. Word lookups share this table as `entryKindRaw = 'reference'`
 * and are left out, as the reader leaves them out.
 */
async function passageHighlights(
  userId: string,
  book: string,
  verseKeys: Set<string>,
): Promise<PassageHighlight[]> {
  const chapters = [...new Set([...verseKeys].map((k) => Number(k.split('|')[1])))];
  if (chapters.length === 0) return [];
  // One prefix per chapter — served by StudyThreadEntries_userId_scriptureReferenceIndex.
  const chapterMatch = or(
    ...chapters.flatMap((ch) => [
      like(StudyThreadEntries.scriptureReference, `${book} ${ch}:%`),
      eq(StudyThreadEntries.scriptureReference, `${book} ${ch}`),
    ]),
  );
  const rows = await db
    .select({
      reference: StudyThreadEntries.scriptureReference,
      translation: StudyThreadEntries.scripturePassageTranslation,
      miniNoteBody: StudyThreadEntries.miniNoteBody,
      notesBody: StudyThreadEntries.notesBody,
      parentNoteId: StudyThreadEntries.parentNoteId,
      createdAt: StudyThreadEntries.createdAt,
    })
    .from(StudyThreadEntries)
    .where(
      and(
        eq(StudyThreadEntries.userId, userId),
        eq(StudyThreadEntries.isArchived, false),
        ne(StudyThreadEntries.entryKindRaw, 'reference'),
        isNotNull(StudyThreadEntries.scriptureReference),
        chapterMatch,
        // A highlight made inside a locked note carries words from it (the mini-note) and
        // the note's id; the connector returns neither for a locked note.
        sql`NOT EXISTS (
          SELECT 1 FROM ${Notes}
          WHERE ${Notes.id} = ${StudyThreadEntries.parentNoteId} AND ${Notes.contentEncrypted} = true
        )`,
      ),
    )
    .orderBy(desc(StudyThreadEntries.createdAt))
    .limit(MAX_PASSAGE_HIGHLIGHTS * 4);

  const out: PassageHighlight[] = [];
  for (const row of rows) {
    if (!row.reference) continue;
    if (!verseKeysFromScriptureReference(row.reference).some((k) => verseKeys.has(k))) continue;
    const note = (row.miniNoteBody || row.notesBody || '').trim() || null;
    out.push({
      reference: row.reference,
      translation: row.translation?.trim() || null,
      kind: note ? 'note' : 'highlight',
      note,
      onNoteId: row.parentNoteId ?? null,
      createdAt: row.createdAt ? row.createdAt.toISOString() : null,
    });
    if (out.length >= MAX_PASSAGE_HIGHLIGHTS) break;
  }
  return out;
}

export async function findByPassage(
  userId: string,
  args: { passage: string } & Page,
): Promise<{
  passage: string;
  notes: Array<NoteSummary & { references: string[] }>;
  highlights: PassageHighlight[];
  nextCursor: string | null;
}> {
  const unreadable = new ConnectorRefusal(
    'bad_request',
    `I couldn't read "${args.passage.trim().slice(0, 80)}" as a Bible reference. Try something like "Romans 8" or "John 3:16".`,
  );
  const canonical = canonicalizeServiceReference(args.passage);
  if (!canonical.ok || !canonical.reference) throw unreadable;
  const passage = canonical.reference;
  const parsed = parseScriptureReference(passage);
  const verseKeys = new Set(verseKeysFromScriptureReference(passage));
  if (!parsed || verseKeys.size === 0) throw unreadable;

  const scope = { passage };
  const offset = decodeCursor(args.cursor, 'find_by_passage', scope);
  const [matches, highlights] = await Promise.all([
    findNotesCitingReference(userId, passage, parsed.book),
    // Highlights ride along on the first page only.
    offset === 0 ? passageHighlights(userId, parsed.book, verseKeys) : Promise.resolve([]),
  ]);

  const page = matches.slice(offset, offset + args.limit + 1);
  return {
    passage,
    notes: page.slice(0, args.limit).map((m) => ({
      ...toNoteSummary(
        {
          id: m.id,
          title: m.title,
          content: m.content,
          contentEncrypted: m.contentEncrypted,
          updatedAt: m.updatedAt,
          authorUserId: userId,
        },
        userId,
      ),
      references: m.references,
    })),
    highlights,
    nextCursor: nextCursorFor('find_by_passage', scope, offset, args.limit, page.length),
  };
}

// ─── list_notes_in_thread ──────────────────────────────────────────────────────

/**
 * Notes in one thread (series or topic). Mirrors GET /api/threads/:id/notes, minus the
 * junction repair it runs first (a write). Other members' locked notes are dropped, as
 * listNotesInSpace does; your own locked notes come back as `locked: true`, no snippet.
 */
export async function listNotesInThread(
  userId: string,
  args: { threadId: string } & Page,
): Promise<{ thread: { id: string; title: string }; notes: NoteSummary[]; nextCursor: string | null }> {
  const raw = args.threadId.trim();
  const threadId = raw.startsWith('thread_') ? raw : `thread_${raw}`;
  let access: Awaited<ReturnType<typeof requireThreadReadAccess>>;
  try {
    access = await requireThreadReadAccess(db, { threadId, viewerUserId: userId });
  } catch (err) {
    if (err instanceof SharedSpaceLifecycleError) {
      throw new ConnectorRefusal('not_found', 'That thread was not found, or you do not have access to it.');
    }
    throw err;
  }
  const { thread } = access;
  if (thread.spaceId) await spaceForViewer(thread.spaceId, userId);

  const scope = { threadId };
  const offset = decodeCursor(args.cursor, 'list_notes_in_thread', scope);
  const result = thread.spaceId
    ? await getNotesForThreadForMember(threadId, userId, args.limit, offset)
    : await getNotesForThread(threadId, userId, args.limit, offset, thread);
  const rows = (Array.isArray(result) ? [] : result.notes) as SpaceNoteRow[];
  const hasMore = Array.isArray(result) ? false : Boolean(result.hasMore);

  const notes = rows
    .map((n) =>
      toNoteSummary(
        {
          id: n.id,
          title: n.title,
          content: n.content,
          noteType: n.noteType,
          contentEncrypted: n.contentEncrypted,
          updatedAt: n.updatedAt,
          createdAt: n.createdAt,
          authorUserId: n.authorUserId ?? n.userId ?? userId,
        },
        userId,
      ),
    )
    .filter((n) => !(n.locked && !n.byYou));

  return {
    thread: { id: thread.id, title: thread.id === 'thread_unorganized' ? 'Unorganized' : (thread.title ?? 'Untitled thread') },
    notes,
    nextCursor: hasMore ? nextCursorFor('list_notes_in_thread', scope, offset, args.limit, args.limit + 1) : null,
  };
}

// ─── where_i_left_off ──────────────────────────────────────────────────────────

const LEFT_OFF_CANDIDATES = 60;
const LEFT_OFF_RECENT = 5;
const READING_WINDOW_DAYS = 180;

export interface ContinueReadingOut {
  /** "Romans 9" — the chapter to open. */
  reference: string;
  book: string;
  chapter: number;
  /** `resume`: left partway through. `next`: the last one was read, this is the next. */
  reason: 'resume' | 'next';
  resumeVerse?: number;
}

/**
 * "Pick up where you left off", answered the way Home answers it: the note most recently
 * edited or read (`pickContinueNote`) and the chapter to keep reading (`deriveContinueReading`),
 * from the same inputs Home fetches. Your own study only.
 */
export async function whereILeftOff(userId: string): Promise<{
  continueNote: (NoteSummary & { url: string }) | null;
  continueReading: ContinueReadingOut | null;
  recentNotes: Array<NoteSummary & { url: string }>;
}> {
  const since = new Date(Date.now() - READING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const [recent, visits, meta, readingRows] = await Promise.all([
    db
      .select({
        id: Notes.id,
        title: Notes.title,
        content: Notes.content,
        noteType: Notes.noteType,
        contentEncrypted: Notes.contentEncrypted,
        isPinned: Notes.isPinned,
        updatedAt: Notes.updatedAt,
        createdAt: Notes.createdAt,
        folder: Notes.primaryCollection,
      })
      .from(Notes)
      .where(and(eq(Notes.userId, userId), ne(Notes.noteType, 'scripture')))
      .orderBy(desc(Notes.updatedAt))
      .limit(LEFT_OFF_CANDIDATES),
    getUserNoteVisitAggregate(userId),
    db
      .select({ lastReadPosition: UserMetadata.lastReadPosition })
      .from(UserMetadata)
      .where(eq(UserMetadata.userId, userId))
      .limit(1),
    db
      .select({
        book: ReadingEvents.book,
        bookOrder: ReadingEvents.bookOrder,
        chapter: ReadingEvents.chapter,
        dwellBucket: ReadingEvents.dwellBucket,
        createdAt: ReadingEvents.createdAt,
      })
      .from(ReadingEvents)
      .where(and(eq(ReadingEvents.userId, userId), gte(ReadingEvents.createdAt, since)))
      .orderBy(desc(ReadingEvents.createdAt))
      .limit(1000)
      .catch(() => []),
  ]);

  // A note read recently but edited long ago is outside the recent-edit window; fetch it too.
  const known = new Set(recent.map((n) => n.id));
  const visitedIds = visits.map((v) => v.noteId).filter((id) => !known.has(id)).slice(0, 20);
  const visited = visitedIds.length
    ? await db
        .select({
          id: Notes.id,
          title: Notes.title,
          content: Notes.content,
          noteType: Notes.noteType,
          contentEncrypted: Notes.contentEncrypted,
          isPinned: Notes.isPinned,
          updatedAt: Notes.updatedAt,
          createdAt: Notes.createdAt,
          folder: Notes.primaryCollection,
        })
        .from(Notes)
        .where(and(eq(Notes.userId, userId), inArray(Notes.id, visitedIds), ne(Notes.noteType, 'scripture')))
    : [];
  const candidates = [...recent, ...visited];

  const lastSubstantiveVisitAtById: Record<string, number> = {};
  for (const v of visits) lastSubstantiveVisitAtById[v.noteId] = Date.parse(v.lastVisitedAt);

  const summarize = (n: (typeof candidates)[number]) => ({
    ...toNoteSummary({ ...n, authorUserId: userId }, userId),
    url: noteUrl(n.id),
  });
  const pick = pickContinueNote(candidates, { lastSubstantiveVisitAtById });

  const lastRead = parseLastReadPosition(first(meta)?.lastReadPosition);
  const readChapters = collapseReadingHistory(readingRows).map((c) => ({
    book: c.book,
    chapter: c.chapter,
    countsAsRead: readingDwellCountsAsRead(c.dwellBucket as ReadingDwellBucket),
  }));
  const reading = deriveContinueReading({ lastRead, readChapters }, bibleBookChapterCounts());

  return {
    continueNote: pick ? summarize(pick) : null,
    continueReading: reading
      ? {
          reference: `${reading.book} ${reading.chapter}`,
          book: reading.book,
          chapter: reading.chapter,
          reason: reading.reason,
          ...(reading.resumeVerse ? { resumeVerse: reading.resumeVerse } : {}),
        }
      : null,
    recentNotes: recent
      .filter((n) => n.id !== pick?.id)
      .slice(0, LEFT_OFF_RECENT)
      .map(summarize),
  };
}

// ─── passage_context ───────────────────────────────────────────────────────────

/** "Romans 5:1-5", or "Exodus 6:28-7:7" across chapters. */
export function formatCrossReference(cr: CrossReference): string {
  const start = `${cr.book} ${cr.chapterStart}:${cr.verseStart}`;
  if (cr.chapterEnd !== cr.chapterStart) return `${start}-${cr.chapterEnd}:${cr.verseEnd}`;
  if (cr.verseEnd !== cr.verseStart) return `${start}-${cr.verseEnd}`;
  return start;
}

/**
 * The knowledge layer around a passage — the side panel the reader shows: themes,
 * cross-references, people and places, and this person's own notes that connect to it.
 * Names and references only, never verse text.
 */
export async function passageContext(
  userId: string,
  args: { passage: string },
): Promise<{
  passage: string;
  themes: string[];
  crossReferences: string[];
  people: string[];
  places: string[];
  yourRelatedNotes: Array<{ id: string; title: string; reason: string; url: string }>;
}> {
  const canonical = canonicalizeServiceReference(args.passage);
  if (!canonical.ok || !canonical.reference) {
    throw new ConnectorRefusal(
      'bad_request',
      `I couldn't read "${args.passage.trim().slice(0, 80)}" as a Bible reference. Try something like "Romans 8" or "John 3:16".`,
    );
  }
  const passage = canonical.reference;
  const verses = verseKeysFromScriptureReference(passage)
    .slice(0, 200)
    .map((key) => {
      const [book, chapter, verse] = key.split('|');
      return { book: book!, chapter: Number(chapter), verse: Number(verse) };
    });
  const ctx = await getPassageContext(userId, verses, { relatedLimit: 8 });
  return {
    passage,
    themes: ctx.themes.map((t) => t.label),
    crossReferences: ctx.crossReferences.map(formatCrossReference),
    people: ctx.people.map((p) => p.name),
    places: ctx.places.map((p) => p.name),
    yourRelatedNotes: ctx.relatedNotes.map((n) => ({
      id: n.noteId,
      title: n.title,
      reason: n.reason,
      url: noteUrl(n.noteId),
    })),
  };
}

// ─── search / fetch (ChatGPT deep research and company knowledge) ─────────────
//
// ChatGPT's research modes only use two tools named exactly `search` and `fetch`, with fixed
// shapes, and only cite results that carry a `url`. These are thin adapters over the reads
// above — no new query — so the same scoping, locking and Bible-text rules apply.

export interface SearchResult {
  id: string;
  title: string;
  url: string;
}

const SEARCH_LIMIT = 10;

/** A Bible reference goes to the passage lookup; anything else is full-text search. */
export async function searchForResearch(userId: string, query: string): Promise<{ results: SearchResult[] }> {
  const trimmed = query.trim();
  const looksLikeReference = (() => {
    const canonical = canonicalizeServiceReference(trimmed);
    return canonical.ok && Boolean(canonical.reference) && Boolean(parseScriptureReference(canonical.reference!));
  })();
  const notes = looksLikeReference
    ? (await findByPassage(userId, { passage: trimmed, limit: SEARCH_LIMIT })).notes
    : (await searchNotes(userId, { query: trimmed, limit: SEARCH_LIMIT })).results;
  return { results: notes.map((n) => ({ id: n.id, title: n.title, url: noteUrl(n.id) })) };
}

export interface FetchedDocument {
  id: string;
  title: string;
  text: string;
  url: string;
  metadata: Record<string, string>;
}

export async function fetchForResearch(userId: string, id: string): Promise<FetchedDocument> {
  const note = await getNote(userId, { noteId: id });
  const url = noteUrl(note.id);
  if (note.locked) {
    return { id: note.id, title: note.title, text: note.message, url, metadata: { locked: 'true' } };
  }
  const metadata: Record<string, string> = { author: note.byYou ? 'you' : 'another member of a shared space' };
  if (note.updatedAt) metadata.updatedAt = note.updatedAt;
  if (note.folder) metadata.folder = note.folder;
  if (note.tags?.length) metadata.tags = note.tags.join(', ');
  if (note.space) metadata.space = note.space.title;
  const refs = note.scripture?.reference ? [note.scripture.reference] : note.scriptureReferences;
  if (refs.length) metadata.scripture = refs.join('; ');
  const highlights = note.highlights?.length
    ? '\n\nHighlights:\n' + note.highlights.map((h) => `- ${h.text ? `"${h.text}"` : ''}${h.note ? ` — ${h.note}` : ''}`).join('\n')
    : '';
  const body =
    note.bodyMarkdown ?? 'This note is a passage of Scripture; only its reference is shared.';
  return { id: note.id, title: note.title, text: `${body}${highlights}`, url, metadata };
}
