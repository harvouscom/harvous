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
 *
 * **The personal trail is plan-gated; shared-space activity is not.** Free sees the last
 * `FREE_HISTORY_WINDOW_DAYS` of their own notes, versions, highlights, reading and reviews;
 * `full_history` (Harvous Plus) removes that floor. A room's activity is someone else's data
 * as much as the viewer's — locking it to the *viewer's* plan would let a free member of a
 * Plus host's space lose history the host is paying to keep — so `spaceNoteRows` keeps the
 * flat `FEED_WINDOW_DAYS` floor unconditionally, the same for every plan. See
 * `docs/future/MONETIZATION_AND_PRICING.md` for why this is the one windowed exception.
 */

import { Hono } from 'hono';
import { getAuthenticatedAuth, requireAuth } from '../middleware/auth';
import { hasFeatureWithReconcile } from '../middleware/require-feature';
import { FREE_HISTORY_WINDOW_DAYS } from '@/lib/billing-plans';
import { rateLimit } from '@/utils/rate-limit';
import { handleAPIError } from '@/utils/error-handling';
import {
  NoteVersions,
  NoteVisitEvents,
  Notes,
  ReadingEvents,
  ReviewEvents,
  ReviewItems,
  SpaceMemberships,
  SpaceNotes,
  Spaces,
  StudyThreadEntries,
  SyncDeletedEntities,
  and,
  db,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  ne,
  type SQL,
} from '../db';
import {
  isNoteVisitEventsTableMissing,
  isReadingEventsTableMissing,
  isReviewTableMissing,
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
import { REVIEW_OUTCOMES } from '@/utils/review-item-kinds';
import {
  parseStudyFeedScope,
  studyFeedItemNoteId,
  type StudyFeedItem,
  type StudyFeedResponse,
} from '@/utils/study-feed-items';
import { isSpaceMembershipsTableMissing } from '../utils/pg-undefined-relation';

const route = new Hono();

/**
 * Six months back — the shared-space floor, and free's floor before the 3.9 history change.
 *
 * The feed is a trail, not an archive: what someone wants from it is the recent shape of
 * their study, and everything older is better reached by searching for it. The window also
 * bounds the work — five queries over an unbounded history would grow with the account. Kept
 * as the unconditional floor for shared-space rows; the personal sources now use
 * `FREE_HISTORY_WINDOW_DAYS`/`full_history` instead. See the file doc comment.
 */
const FEED_WINDOW_DAYS = 180;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Per source, before collapsing. Generous enough that a heavy day never truncates mid-page. */
const SOURCE_ROW_CAP = 300;
const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 100;
/** A hard stop on the answer aggregate: the daily engine cap makes this months of study. */
const REVIEW_ANSWER_LIMIT = 2000;

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

/**
 * Does a free account have personal study older than its floor? One cheap existence check per
 * table, `userId`-indexed (`Notes_userIdIndex`, `NoteVersions_authorId_createdAtIndex`) and
 * short-circuited on the first hit — not a third full source fan-out. Called only once the
 * trail has already run out, so this never runs on a page that still has more to give up.
 */
async function hasOlderPersonalStudyFeedHistory(userId: string, before: Date): Promise<boolean> {
  const noteHit = await source(
    () =>
      db
        .select({ id: Notes.id })
        .from(Notes)
        .where(and(eq(Notes.userId, userId), lt(Notes.createdAt, before)))
        .limit(1),
    () => false,
    'older notes probe',
  );
  if (noteHit.length > 0) return true;

  const versionHit = await source(
    () =>
      db
        .select({ id: NoteVersions.id })
        .from(NoteVersions)
        .where(
          and(
            eq(NoteVersions.authorId, userId),
            eq(NoteVersions.source, 'save'),
            lt(NoteVersions.createdAt, before),
          ),
        )
        .limit(1),
    () => false,
    'older versions probe',
  );
  return versionHit.length > 0;
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

    /*
     * A hot read path (Home mounts this on every load), so the entitlement check is the same
     * throttled reconcile `GET /api/subscription/status` uses rather than a full Polar
     * round-trip per request — see `syncEntitlementsFromProvider`'s doc comment.
     */
    const hasFullHistory = await hasFeatureWithReconcile(auth, 'full_history', { throttle: true });
    const personalFloor = hasFullHistory
      ? null
      : new Date(Date.now() - FREE_HISTORY_WINDOW_DAYS * DAY_MS);
    const sharedFloor = new Date(Date.now() - FEED_WINDOW_DAYS * DAY_MS);

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
     *
     * Two floors, never mixed: `personalWindowed` is the reader's own plan (no floor at all
     * once they hold `full_history`); `sharedWindowed` is the flat, plan-independent floor
     * every room uses regardless of who is looking at it.
     */
    const personalWindowed = <C extends { createdAt: unknown }>(column: C['createdAt']) => {
      const bounds: SQL[] = [];
      if (personalFloor) bounds.push(gte(column as never, personalFloor));
      if (before) bounds.push(lt(column as never, before));
      return bounds;
    };
    const sharedWindowed = <C extends { createdAt: unknown }>(column: C['createdAt']) => {
      const bounds: SQL[] = [gte(column as never, sharedFloor)];
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
          .where(and(eq(Notes.userId, auth.userId), ...personalWindowed(Notes.createdAt)))
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
              ...personalWindowed(NoteVersions.createdAt),
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
              ...personalWindowed(StudyThreadEntries.createdAt),
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
          .where(and(eq(ReadingEvents.userId, auth.userId), ...personalWindowed(ReadingEvents.createdAt)))
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
            and(eq(NoteVisitEvents.userId, auth.userId), ...personalWindowed(NoteVisitEvents.createdAt)),
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
              /*
               * Your own notes come out of this half only while the *own* half is running, and
               * then only to avoid printing them twice: an unscoped feed already has them,
               * untagged, from the personal sources above.
               *
               * Narrowed to a single space there is no own half — `wantsOwn` is false — so the
               * guard had nothing left to de-duplicate against and was simply deleting you from
               * your own trail. A space where only you had written came back empty, which is the
               * one thing the space scope exists to show. Activity is a trail, not an inbox.
               */
              ...(wantsOwn ? [ne(Notes.userId, auth.userId)] : []),
              ...sharedWindowed(Notes.updatedAt),
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
        /* Never your own: nothing you wrote is news to you, however long since you last
           opened the space. Only reachable under a space scope, which is the one case where
           this half returns your notes at all. */
        isNewSinceVisit:
          watermark && row.authorUserId !== auth.userId
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

    /*
     * How the reader did, for the day's sentence and the week caption — timestamps and a flag,
     * never an item id or a typed attempt. `shown` is not an answer and is left out.
     */
    const reviewAnswers = await source(
      () =>
        db
          .select({
            at: ReviewEvents.createdAt,
            action: ReviewEvents.action,
            // What was asked about, by the name the feed already prints on its other rows.
            // Ids and the reader's typed attempt stay out; a label is what lets the day say
            // "you came back to John 15:5" instead of counting at them.
            reference: ReviewItems.scriptureReference,
            noteTitle: Notes.title,
          })
          .from(ReviewEvents)
          .leftJoin(ReviewItems, eq(ReviewItems.id, ReviewEvents.reviewItemId))
          .leftJoin(Notes, eq(Notes.id, ReviewItems.noteId))
          .where(
            and(
              eq(ReviewEvents.userId, auth.userId),
              inArray(ReviewEvents.action, [...REVIEW_OUTCOMES]),
              ...personalWindowed(ReviewEvents.createdAt),
            ),
          )
          .limit(REVIEW_ANSWER_LIMIT),
      isReviewTableMissing,
      'review answers',
    );

    /*
     * The Plus upsell only fires once the trail is genuinely exhausted for this request — not
     * at the 90-day mark itself, since under `all`/`home` scope a still-flowing shared-space
     * source can hold `nextCursor` open well past it. That is a real but harmless imprecision:
     * the edge appears a little later than the earliest correct moment, never earlier, and
     * never for a scope with no personal floor to hit (`wantsOwn` false, or already Plus).
     * One cheap probe, only when the page actually asks for it.
     */
    let lockedBefore: string | null = null;
    if (wantsOwn && personalFloor && nextCursor === null) {
      const older = await hasOlderPersonalStudyFeedHistory(auth.userId, personalFloor);
      if (older) lockedBefore = personalFloor.toISOString();
    }

    const body: StudyFeedResponse = {
      success: true,
      items: page,
      nextCursor,
      lockedBefore,
      reviewAnswers: reviewAnswers.map((row) => ({
        at: row.at.toISOString(),
        held: row.action === 'recalled',
        label: row.reference?.trim() || row.noteTitle?.trim() || null,
      })),
    };
    /*
     * Never the app-wide GET default.
     *
     * `server/app.ts` gives any GET without a header of its own
     * `private, max-age=30, stale-while-revalidate=60`, and the SPA client deliberately does not
     * send `cache: 'no-store'` so those headers can work. For this route that turns a correct
     * invalidation into a lie: the refetch fired the instant a note is saved is inside the
     * thirty seconds, so the browser answers it from its own cache with the body from before
     * the write, and serves that for another minute while it revalidates. Only a full reload
     * looked right, which is exactly how this was reported. The service worker hides it —
     * it forces `no-store` on `/api/` — so it only bites where the SW is not in control: a
     * first load before it claims the page, the native WebView, and dev.
     */
    return c.json(body, 200, { 'Cache-Control': 'private, no-store' });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/study-feed',
      action: 'study_feed',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

export default route;
