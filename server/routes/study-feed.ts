/**
 * GET /api/study-feed — one person's study, in the order it happened.
 *
 * Reads five existing logs and merges them: notes written, notes edited, highlights made,
 * chapters read, notes returned to. Nothing is written here, and nothing new is stored to
 * make it work — the feed is a view over what the app already records, which is why it can
 * show a trail reaching back before it was built.
 *
 * Two rules this route must not break:
 *
 * 1. **It never stamps anything.** `Notes.lastVisited` and `Notes.updatedAt` are delta-pull
 *    triggers in server/routes/sync.ts, so touching a note to record that it was shown would
 *    push a sync delta per row read. Reading the feed is not an event in it.
 *
 * 2. **Every source fails alone.** A database without ReadingEvents yet should show a feed
 *    without reading in it, not an error page. Same reasoning as /api/reading/recent.
 *
 * Collapsing lives in server/utils/study-feed-collapse.ts; day and session grouping happens
 * on the client, where the timezone is known.
 */

import { Hono } from 'hono';
import { getAuthenticatedAuth, requireAuth } from '../middleware/auth';
import { rateLimit } from '@/utils/rate-limit';
import { handleAPIError } from '@/utils/error-handling';
import {
  db,
  Notes,
  NoteVersions,
  NoteVisitEvents,
  ReadingEvents,
  SpaceMemberships,
  SpaceNotes,
  Spaces,
  StudyThreadEntries,
  SyncDeletedEntities,
  and,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  ne,
} from '../db';
import {
  isNoteVisitEventsTableMissing,
  isReadingEventsTableMissing,
  isStudyThreadEntriesTableMissing,
  isSyncDeletedEntitiesTableMissing,
} from '../utils/pg-undefined-relation';
import {
  buildHighlightItems,
  buildNoteCreatedItems,
  buildNoteUpdatedItems,
  buildReadingItems,
  buildRevisitItems,
  studyFeedSnippet,
  type NoteUpdateSpan,
} from '../utils/study-feed-collapse';
import { batchAuthorAttribution } from '../utils/dashboard-data';
import {
  parseStudyFeedScope,
  studyFeedItemNoteId,
  type StudyFeedItem,
  type StudyFeedResponse,
} from '@/utils/study-feed-items';
import { isSpaceMembershipsTableMissing } from '../utils/pg-undefined-relation';

const route = new Hono();

/**
 * Six months back, matching the reading history window.
 *
 * The feed is a trail, not an archive: what someone wants from it is the recent shape of
 * their study, and everything older is better reached by searching for it. The window also
 * bounds the work — five queries over an unbounded history would grow with the account.
 */
const FEED_WINDOW_DAYS = 180;
/** Per source, before collapsing. Generous enough that a heavy day never truncates mid-page. */
const SOURCE_ROW_CAP = 300;
const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 100;

/**
 * Run one source; if its table has not been migrated yet, contribute nothing.
 *
 * `enabled` is how scope is applied — a source the current scope does not want is never
 * queried, rather than queried and filtered. On `home` that skips the whole shared fan-out,
 * which is the expensive half of this route.
 */
async function source<T>(
  load: () => Promise<T[]>,
  isMissing: (error: unknown) => boolean,
  label: string,
  enabled = true,
): Promise<T[]> {
  if (!enabled) return [];
  try {
    return await load();
  } catch (error) {
    if (isMissing(error)) return [];
    const cause = error instanceof Error ? (error as Error & { cause?: unknown }).cause : undefined;
    console.error(
      `[study-feed] ${label}`,
      error instanceof Error ? error.message.slice(0, 120) : error,
      '| cause:',
      cause instanceof Error ? cause.message : cause,
    );
    return [];
  }
}

route.get('/api/study-feed', requireAuth, rateLimit('read'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const limitParam = Number.parseInt(c.req.query('limit') ?? '', 10);
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(limitParam, 1), MAX_LIMIT)
      : DEFAULT_LIMIT;

    const beforeRaw = c.req.query('before');
    const beforeDate = beforeRaw ? new Date(beforeRaw) : null;
    const before = beforeDate && !Number.isNaN(beforeDate.getTime()) ? beforeDate : null;

    const windowStart = new Date(Date.now() - FEED_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    /*
     * Scope decides which halves of the trail run, not how they are filtered afterwards.
     * Reading a source and then discarding it would cost the same query for nothing, and on
     * `home` — the scope for "just my own study" — the shared fan-out is the expensive half.
     */
    const scope = parseStudyFeedScope(c.req.query('scope'));
    const wantsOwn = scope.kind !== 'space';
    const wantsShared = scope.kind !== 'home';

    /**
     * Every source is windowed and cursored the same way. A collapsed bucket that straddles
     * the cursor re-emits on the next page with a different span; item ids are derived from
     * the bucket start, so the client replaces rather than duplicates it.
     */
    const windowed = <C extends { createdAt: unknown }>(column: C['createdAt']) => {
      const bounds = [gte(column as never, windowStart)];
      if (before) bounds.push(lt(column as never, before));
      return bounds;
    };

    /*
     * Sequential, not `Promise.all`.
     *
     * This route reads five tables, and firing them together holds five pooled connections
     * for as long as the slowest one takes. The pool is fifteen wide and the app already
     * opens a dozen queries on a cold load, so the parallel version did not merely make this
     * endpoint flaky — it exhausted the pool and took navigation, entitlements and the user
     * profile down with it (`EMAXCONNSESSION`). A feed is not latency-critical: it is read
     * once on arrival and then paged by hand. One connection at a time is the right price.
     */
    const noteRows = await source(
      () =>
        db
          .select({
            id: Notes.id,
            title: Notes.title,
            content: Notes.content,
            noteType: Notes.noteType,
            primaryCollection: Notes.primaryCollection,
            createdAt: Notes.createdAt,
          })
          .from(Notes)
          .where(and(eq(Notes.userId, auth.userId), ...windowed(Notes.createdAt)))
          .orderBy(desc(Notes.createdAt))
          .limit(SOURCE_ROW_CAP),
      () => false,
      'notes',
      wantsOwn,
    );

    const versionRows = await source(
      () =>
        db
          .select({
            noteId: NoteVersions.noteId,
            title: NoteVersions.title,
            content: NoteVersions.content,
            createdAt: NoteVersions.createdAt,
          })
          .from(NoteVersions)
          .where(
            and(
              eq(NoteVersions.authorId, auth.userId),
              eq(NoteVersions.source, 'save'),
              ...windowed(NoteVersions.createdAt),
            ),
          )
          .orderBy(desc(NoteVersions.createdAt))
          .limit(SOURCE_ROW_CAP),
      () => false,
      'note versions',
      wantsOwn,
    );

    const highlightRows = await source(
      () =>
        db
          .select({
            id: StudyThreadEntries.id,
            parentNoteId: StudyThreadEntries.parentNoteId,
            highlightAccentRaw: StudyThreadEntries.highlightAccentRaw,
            sourceSnippet: StudyThreadEntries.sourceSnippet,
            anchorQuote: StudyThreadEntries.anchorQuote,
            scriptureReference: StudyThreadEntries.scriptureReference,
            scripturePassageTranslation: StudyThreadEntries.scripturePassageTranslation,
            scripturePassageExcerpt: StudyThreadEntries.scripturePassageExcerpt,
            createdAt: StudyThreadEntries.createdAt,
          })
          .from(StudyThreadEntries)
          .where(
            and(
              eq(StudyThreadEntries.userId, auth.userId),
              eq(StudyThreadEntries.isArchived, false),
              ...windowed(StudyThreadEntries.createdAt),
            ),
          )
          .orderBy(desc(StudyThreadEntries.createdAt))
          .limit(SOURCE_ROW_CAP),
      isStudyThreadEntriesTableMissing,
      'highlights',
      wantsOwn,
    );

    const readingRows = await source(
      () =>
        db
          .select({
            book: ReadingEvents.book,
            bookOrder: ReadingEvents.bookOrder,
            chapter: ReadingEvents.chapter,
            translation: ReadingEvents.translation,
            dwellBucket: ReadingEvents.dwellBucket,
            createdAt: ReadingEvents.createdAt,
          })
          .from(ReadingEvents)
          .where(and(eq(ReadingEvents.userId, auth.userId), ...windowed(ReadingEvents.createdAt)))
          .orderBy(desc(ReadingEvents.createdAt))
          .limit(SOURCE_ROW_CAP),
      isReadingEventsTableMissing,
      'reading',
      wantsOwn,
    );

    const visitRows = await source(
      () =>
        db
          .select({
            noteId: NoteVisitEvents.noteId,
            dwellBucket: NoteVisitEvents.dwellBucket,
            createdAt: NoteVisitEvents.createdAt,
          })
          .from(NoteVisitEvents)
          .where(
            and(eq(NoteVisitEvents.userId, auth.userId), ...windowed(NoteVisitEvents.createdAt)),
          )
          .orderBy(desc(NoteVisitEvents.createdAt))
          .limit(SOURCE_ROW_CAP),
      isNoteVisitEventsTableMissing,
      'note visits',
      wantsOwn,
    );

    /*
     * The spaces you are in, and what other people wrote in them.
     *
     * Two queries, not one per space: the membership list comes back first and the notes are
     * fetched with a single `inArray` over it — the same batching `getNewNoteCountsForUser`
     * uses, and the reason this stays one round trip however many spaces somebody has joined.
     *
     * `ne(Notes.userId, …)` is the load-bearing clause. Your own note in a shared space is
     * already in this feed as something you wrote; without this it would arrive a second
     * time as something that happened in a space, and the day would double-count your work.
     * Encrypted and removed notes are excluded on the same terms every other shared-space
     * read uses — see `countNewNotesInSpaceSince`.
     */
    const memberships = await source(
      () =>
        db
          .select({
            spaceId: SpaceMemberships.spaceId,
            title: Spaces.title,
            color: Spaces.color,
            orgId: Spaces.orgId,
            lastVisitedAt: SpaceMemberships.lastVisitedAt,
          })
          .from(SpaceMemberships)
          .innerJoin(Spaces, eq(SpaceMemberships.spaceId, Spaces.id))
          .where(
            and(
              eq(SpaceMemberships.userId, auth.userId),
              ne(Spaces.type, 'personal'),
              isNull(Spaces.deletedAt),
            ),
          ),
      isSpaceMembershipsTableMissing,
      'memberships',
      wantsShared,
    );

    const scopedSpaces =
      scope.kind === 'space'
        ? memberships.filter((m) => m.spaceId === scope.spaceId)
        : memberships;
    const spaceById = new Map(scopedSpaces.map((m) => [m.spaceId, m]));

    const spaceNoteRows = await source(
      () =>
        db
          .select({
            noteId: Notes.id,
            title: Notes.title,
            content: Notes.content,
            authorUserId: Notes.userId,
            spaceId: SpaceNotes.spaceId,
            addedAt: SpaceNotes.addedAt,
            createdAt: Notes.createdAt,
            updatedAt: Notes.updatedAt,
          })
          .from(SpaceNotes)
          .innerJoin(Notes, eq(Notes.id, SpaceNotes.noteId))
          .where(
            and(
              inArray(SpaceNotes.spaceId, [...spaceById.keys()]),
              isNull(SpaceNotes.removedAt),
              eq(Notes.contentEncrypted, false),
              ne(Notes.userId, auth.userId),
              ...windowed(Notes.updatedAt),
            ),
          )
          .orderBy(desc(Notes.updatedAt))
          .limit(SOURCE_ROW_CAP),
      () => false,
      'space notes',
      wantsShared && spaceById.size > 0,
    );

    const authors = await batchAuthorAttribution(spaceNoteRows.map((row) => row.authorUserId));

    const spaceItems: StudyFeedItem[] = [];
    for (const row of spaceNoteRows) {
      const space = row.spaceId ? spaceById.get(row.spaceId) : null;
      const at = row.updatedAt ?? row.createdAt;
      if (!space || !at) continue;
      const author = authors[row.authorUserId];
      const watermark = space.lastVisitedAt;

      spaceItems.push({
        // A church channel and a shared space differ only in where they came from, which is
        // what `orgId` records — the two read the same on the page, so they share a shape.
        kind: space.orgId ? 'church-note' : 'space-note',
        id: `space-note:${row.noteId}:${space.spaceId}`,
        at: at instanceof Date ? at.toISOString() : String(at),
        noteId: row.noteId,
        title: row.title ?? null,
        snippet: studyFeedSnippet(row.content),
        actor: {
          displayName: author?.displayName || 'Someone',
          userColor: author?.userColor ?? null,
          profileImageUrl: author?.profileImageUrl ?? null,
        },
        space: { id: space.spaceId, title: space.title, color: space.color },
        isNewSinceVisit: watermark
          ? new Date(at).getTime() > new Date(watermark).getTime()
          : false,
      });
    }

    const noteCreatedAt = new Map<string, string>();
    const noteTitles = new Map<string, string | null>();
    for (const row of noteRows) {
      const created = row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt;
      if (created) noteCreatedAt.set(row.id, String(created));
      noteTitles.set(row.id, row.title ?? null);
    }

    const createdItems = buildNoteCreatedItems(noteRows);
    const updatedItems = buildNoteUpdatedItems(versionRows, noteCreatedAt);
    const highlightItems = buildHighlightItems(highlightRows, noteTitles);
    const readingItems = buildReadingItems(readingRows);

    const updateSpans: NoteUpdateSpan[] = updatedItems.map((item) => ({
      noteId: item.noteId,
      startMs: new Date(item.startAt ?? item.at).getTime(),
      endMs: new Date(item.at).getTime(),
    }));
    const revisitItems = buildRevisitItems(visitRows, updateSpans);

    let items: StudyFeedItem[] = [
      ...createdItems,
      ...updatedItems,
      ...highlightItems,
      ...readingItems,
      ...revisitItems,
      ...spaceItems,
    ];

    /*
     * A note deleted since the event was logged should not surface. Event logs are append-only
     * and outlive their subjects on purpose — the tombstone feed is what tells us which ones
     * are gone, and it is also how a note deleted on another device disappears here.
     */
    const referencedNoteIds = [
      ...new Set(items.map(studyFeedItemNoteId).filter((id): id is string => !!id)),
    ];
    if (referencedNoteIds.length > 0) {
      const tombstones = await source(
        () =>
          db
            .select({ entityId: SyncDeletedEntities.entityId })
            .from(SyncDeletedEntities)
            .where(
              and(
                eq(SyncDeletedEntities.userId, auth.userId),
                eq(SyncDeletedEntities.entityType, 'note'),
                inArray(SyncDeletedEntities.entityId, referencedNoteIds),
              ),
            ),
        isSyncDeletedEntitiesTableMissing,
        'tombstones',
      );

      const liveNotes = await source(
        () =>
          db
            .select({
              id: Notes.id,
              title: Notes.title,
              noteType: Notes.noteType,
              primaryCollection: Notes.primaryCollection,
            })
            .from(Notes)
            .where(inArray(Notes.id, referencedNoteIds)),
        () => false,
        'note existence',
      );

      const deleted = new Set(tombstones.map((row) => row.entityId));
      const live = new Map(liveNotes.map((row) => [row.id, row]));
      items = items.filter((item) => {
        const noteId = studyFeedItemNoteId(item);
        if (!noteId) return true;
        return !deleted.has(noteId) && live.has(noteId);
      });

      /*
       * A revisit knows only which note was open. Everything a row needs to introduce that
       * note — its name, whether it is scripture, which folder it sits in — lives on the
       * note, so it is read here rather than duplicated onto the visit log. Note highlights
       * borrow the same lookup for their parent's name.
       */
      for (const item of items) {
        if (item.kind === 'note-revisited') {
          const note = live.get(item.noteId);
          item.title = note?.title ?? null;
          item.noteType = note?.noteType ?? null;
          item.folder = note?.primaryCollection ?? null;
        } else if (item.kind === 'highlight-note' && item.noteId) {
          item.noteTitle = live.get(item.noteId)?.title ?? null;
        }
      }
    }

    items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    const page = items.slice(0, limit);
    /*
     * More is only claimed when this page filled. Sources are capped independently, so a
     * short page can still sit above older rows; the cursor is the last item's timestamp and
     * the next request re-reads from there.
     */
    const nextCursor = items.length > limit && page.length > 0 ? page[page.length - 1].at : null;

    const body: StudyFeedResponse = { success: true, items: page, nextCursor };
    return c.json(body);
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/study-feed',
      action: 'study_feed',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

export default route;
