/**
 * Drizzle ORM schema for the Harvous database (Supabase Postgres).
 *
 * Date columns use `timestamp({ withTimezone: true, mode: 'date' })` which
 * returns native JS Date objects. JSON.stringify auto-converts them to ISO strings.
 */

import { pgTable, text, integer, real, boolean, timestamp, uniqueIndex, index, primaryKey } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Helper for date columns — Postgres TIMESTAMPTZ, returned as JS Date objects
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

// ─── Spaces ────────────────────────────────────────────────────────────────────

export const Spaces = pgTable(
  'Spaces',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    description: text('description'),
    /**
     * Ministry channels only (type='public' + orgId): staff-declared publish cadence.
     * Values: daily | weekly | biweekly | monthly | quarterly | irregular | null.
     */
    publishCadence: text('publishCadence'),
    /**
     * When this space gathers — "Youth meets Wednesdays at 6:30".
     *
     * **Any room that gathers, not org spaces only.** Written when a Shared
     * Space is created and editable in its settings; a churchless book club
     * that meets on Tuesdays keeps its rhythm here exactly as a church Shared
     * Space does. Refused only for ministry channels, which publish on a
     * `publishCadence` rather than meeting — the same line `ChurchServices.kind`
     * draws for the plan's rows.
     *
     * (These columns were org-only in intent for their first month, and had no
     * writer at all in that time: every reference was a read, so the Planner's
     * week anchor and the Coming-up card's day/time label were null for every
     * space in existence.)
     *
     * The church's own times live in `ChurchServiceTimes`, which is a *list*
     * because a church holds several services on one morning; a space gathers
     * once, so a single day/time is the honest shape rather than a second slot
     * table.
     *
     * Display and defaults only — this seeds the space plan's date picker and
     * labels its card. Nothing here schedules, reminds, or recurs; whoever runs
     * the room still enters every gathering by hand. See
     * docs/future/CHURCH_SPACE_PLANS_AND_SERVICE_TIMES.md §1.
     */
    /** 0–6, 0 = Sunday — Date.getDay() and the WEEKDAYS array in church-services.ts. */
    meetingDay: integer('meetingDay'),
    /**
     * 'HH:MM' 24h wall clock. The zone is `Churches.timezone` when a church is
     * behind the room, and nothing at all when there is not — a churchless
     * Shared Space has no zone to name, so its time is shown bare. Inventing
     * one would be a promise the app cannot keep, and this is a label rather
     * than an appointment.
     */
    meetingTime: text('meetingTime'),
    /**
     * Whether the room meets in a place, on a call, or both.
     *
     * `'in_person' | 'online' | 'hybrid'`, NULL = has not said — which is every
     * space that existed before this column, and stays a legal answer. Refused
     * on ministry channels for the same reason `meetingDay` is: a channel
     * publishes rather than meets.
     *
     * Its real job is `meetingUrl` below. It also decides whether a timezone
     * will ever be needed: people join an online meeting from other zones,
     * which is the one case a bare wall clock cannot serve — see
     * docs/future/SPACE_MEETING_RHYTHM_AND_CALENDAR.md Phase 3.
     */
    meetingKind: text('meetingKind'),
    /**
     * The room's standing video link — Meet, Zoom, Teams.
     *
     * **Not an invite, and it must never travel like one.** A join link is
     * handed to people who are not members yet; this is the key to the room
     * itself. It is returned only to members, and deliberately absent from
     * `/api/spaces/invite-preview/:token` (unauthenticated) and from
     * `PublicJoinSpaceLetter`. Nothing auto-opens or embeds it.
     *
     * https only, and only meaningful when `meetingKind` is 'online' or
     * 'hybrid' — a link on a room that meets in a building is a contradiction,
     * so the write routes refuse it there rather than storing something no
     * surface would show.
     */
    meetingUrl: text('meetingUrl'),
    color: text('color'),
    backgroundGradient: text('backgroundGradient'),
    /** JSON `SpaceCoverBg` — join-page / invite hero for light appearance. */
    coverBgLight: text('coverBgLight'),
    /** JSON `SpaceCoverBg` — join-page / invite hero for dark appearance. */
    coverBgDark: text('coverBgDark'),
    createdAt: ts('createdAt').notNull(),
    updatedAt: ts('updatedAt'),
    lastVisited: ts('lastVisited'),
    userId: text('userId').notNull(),
    /**
     * 'personal' | 'shared' | 'public' — space kind discriminator.
     * 'shared' = collaborative space on the SpaceMemberships/SpaceInvites rails
     * (owning one requires the Shared Spaces add-on; joining is free).
     * 'public' = ministry broadcast channel when orgId is set (members follow +
     * copy; only owner/leader author). Not a Shared Space product surface.
     * Discrimination (no isMinistryBroadcast column):
     * - personal Shared Space: type='shared' + orgId null
     * - church Shared Space: type='shared' + orgId set
     * - ministry channel: type='public' + orgId set
     */
    type: text('type').notNull().default('personal'),
    /**
     * Clerk organization id (= Churches.orgId) — church-org ownership/sponsorship.
     * Null = personally owned. When set: Spaces.userId stays the creating staff
     * member (audit anchor), but billing/limits derive from the church (see
     * tier-limits.ts). Written by admin ministry-channel create and staff
     * church-scoped Shared Space create (see server/routes/churches.ts,
     * server/routes/spaces.ts).
     */
    orgId: text('orgId'),
    /** @deprecated v1 sharing — frozen with shareToken/shareTokenCreatedAt; new code keys off `type`. */
    isPublic: boolean('isPublic').notNull().default(false),
    isFeatured: boolean('isFeatured').notNull().default(false),
    isActive: boolean('isActive').notNull().default(true),
    order: integer('order').notNull().default(0),
    /** Soft-delete lifecycle for shared/public spaces; canonical notes remain untouched. */
    deletedAt: ts('deletedAt'),
    /** Owner recovery deadline (normally deletedAt + 30 days). */
    recoveryUntil: ts('recoveryUntil'),
    /** @deprecated v1 sharing — legacy join links are no longer honored; invites live in SpaceInvites. */
    shareToken: text('shareToken'),
    /** @deprecated v1 sharing. */
    shareTokenCreatedAt: ts('shareTokenCreatedAt'),
    /** JSON string[] — folder labels with zero notes (prototype empty-folder registry). */
    prototypeEmptyFolderLabels: text('prototypeEmptyFolderLabels'),
  },
  (table) => [
    index('Spaces_userIdIndex').on(table.userId),
    index('Spaces_userId_updatedAtIndex').on(table.userId, table.updatedAt),
    index('Spaces_userId_typeIndex').on(table.userId, table.type),
    index('Spaces_deletedAt_recoveryUntilIndex').on(table.deletedAt, table.recoveryUntil),
  ],
);

// ─── Threads ───────────────────────────────────────────────────────────────────

export const Threads = pgTable(
  'Threads',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    subtitle: text('subtitle'),
    spaceId: text('spaceId'),
    createdAt: ts('createdAt').notNull(),
    updatedAt: ts('updatedAt'),
    lastVisited: ts('lastVisited'),
    userId: text('userId').notNull(),
    isPublic: boolean('isPublic').notNull().default(false),
    isPinned: boolean('isPinned').notNull().default(false),
    color: text('color'),
    order: integer('order').notNull().default(0),
    shareToken: text('shareToken'),
    shareTokenCreatedAt: ts('shareTokenCreatedAt'),
    /**
     * 'collection' | 'sequence'. A collection is the Thread as it has always
     * been — a bag of notes sorted by recency. A sequence is an authored
     * study plan: an order someone chose, and a step the group is on.
     */
    mode: text('mode').notNull().default('collection'),
    /**
     * JSON `string[]` — the authored order, when mode='sequence'.
     *
     * Deliberately a column here rather than a `position` on NoteThreads.
     * `StudyThreadMemberOrders.orderedNoteIds` already established stored
     * ordering in this shape; one writer (owner/leader) makes whole-list
     * writes atomic instead of resequencing N junction rows in a
     * transaction; and a position column would oblige every existing
     * junction write path to maintain an order that collection Threads do
     * not have. Ids can go stale (a note leaves the space) — readers filter
     * against live membership and writers rewrite the list, so drift is
     * self-healing rather than something to migrate.
     */
    sequenceNoteIds: text('sequenceNoteIds'),
    /**
     * The step the cohort is on — a note id, NOT an index. A leader who
     * inserts or reorders steps ahead of the current one must not silently
     * move the group; "Step 3 of 8" is derived from this id's position.
     */
    sequenceCurrentNoteId: text('sequenceCurrentNoteId'),
    /**
     * When the room's leader closed this run — **the cohort's completion, not
     * anyone's personal one.**
     *
     * "We're done with this study." It says nothing about whether any given
     * member finished; that is `ThreadProgress.completedAt`, written only by
     * the member themselves. The two are deliberately different columns on
     * different tables precisely so neither can be mistaken for the other, and
     * so closing a run can never mark a straggler complete.
     *
     * A closed run is **labelled, not hidden**. The plan stays readable — people
     * finish late, and taking the material away at the moment the room moves on
     * is the opposite of what a study plan is for.
     */
    closedAt: ts('closedAt'),
    /** Who closed it. Staff-side provenance; never shown to members. */
    closedByUserId: text('closedByUserId'),
  },
  (table) => [
    index('Threads_userIdIndex').on(table.userId),
    index('Threads_userId_updatedAtIndex').on(table.userId, table.updatedAt),
    index('Threads_spaceIdIndex').on(table.spaceId),
    uniqueIndex('Threads_onePinnedPerSpace')
      .on(table.spaceId)
      .where(sql`${table.spaceId} IS NOT NULL AND ${table.isPinned} = true`),
  ],
);

/**
 * How far one person has got through a sequence Thread.
 *
 * Exists to answer one question for the person shepherding a room — "is the
 * group with me, or am I three weeks ahead of everybody" — and it is
 * deliberately the narrowest thing that can answer it.
 *
 * **The read is a count, never a roster.** `openedNoteIds` is per-user because
 * a count has to be computed from something, but no route may serialize whose
 * row it came from: the church surfaces say "how many, never who", and a study
 * plan is exactly where that promise matters most. The pulse read is also
 * gated to owner/leader — a member is never shown counts about their own room,
 * because "4 of 18 have opened this" reads as a scoreboard from below and as
 * shepherding from above.
 *
 * "Opened", not "completed". Nothing here claims someone read, understood, or
 * finished a step; the honest signal is that they turned the page, and naming
 * the column for what it actually observes stops a later reader promising more.
 *
 * Row ids: composite `(threadId, userId)`.
 */
export const ThreadProgress = pgTable(
  'ThreadProgress',
  {
    threadId: text('threadId').notNull(),
    userId: text('userId').notNull(),
    /** JSON `string[]` of step note ids this person has opened. */
    openedNoteIds: text('openedNoteIds'),
    startedAt: ts('startedAt').notNull(),
    updatedAt: ts('updatedAt'),
    /**
     * When this person said they finished — **their own claim, never derived.**
     *
     * `openedNoteIds` records that a step was *opened*, which is not the same as
     * having read or worked it, and inferring completion from "all steps opened"
     * would quietly undo that distinction. So this is only ever written by an
     * explicit act of the member it belongs to.
     *
     * It is also **not** what a leader closing the run writes — that is
     * `Threads.closedAt`, a different fact by a different person. Someone who
     * fell behind did not finish because the room moved on, and recording that
     * they did would tell them something untrue about their own study.
     */
    completedAt: ts('completedAt'),
  },
  (table) => [
    primaryKey({ columns: [table.threadId, table.userId] }),
    index('ThreadProgress_threadIdIndex').on(table.threadId),
  ],
);

// ─── Notes ─────────────────────────────────────────────────────────────────────

export const Notes = pgTable(
  'Notes',
  {
    id: text('id').primaryKey(),
    title: text('title'),
    content: text('content').notNull(),
    threadId: text('threadId').notNull(),
    spaceId: text('spaceId'),
    simpleNoteId: integer('simpleNoteId'),
    noteType: text('noteType').notNull().default('default'),
    addedBy: text('addedBy').notNull().default('user'),
    createdAt: ts('createdAt').notNull(),
    updatedAt: ts('updatedAt'),
    lastVisited: ts('lastVisited'),
    userId: text('userId').notNull(),
    isPublic: boolean('isPublic').notNull().default(false),
    isFeatured: boolean('isFeatured').notNull().default(false),
    isPinned: boolean('isPinned').notNull().default(false),
    order: integer('order').notNull().default(0),
    shareToken: text('shareToken'),
    shareTokenCreatedAt: ts('shareTokenCreatedAt'),
    contentEncrypted: boolean('contentEncrypted').notNull().default(false),
    /** Primary study collection label — native parity (`note.primaryCollection`). */
    primaryCollection: text('primaryCollection'),
    /** JSON array of additional collection labels (string[]), excluding primary. */
    secondaryCollections: text('secondaryCollections'),
    collectionPinned: boolean('collectionPinned').notNull().default(false),
    collectionUserOverride: boolean('collectionUserOverride').notNull().default(false),
    collectionLastAutoUpdatedAt: ts('collectionLastAutoUpdatedAt'),
    /** Note created from highlighted text in this source note (same user only). */
    linkedFromNoteId: text('linkedFromNoteId'),
    /** User-overridden name for the study thread this note anchors (as the cluster representative). */
    studyThreadTitle: text('studyThreadTitle'),
    /** When true, `studyThreadTitle` is manual; when false, display uses auto-suggested cluster name. */
    studyThreadUserOverride: boolean('studyThreadUserOverride').notNull().default(false),
    /** When true, thread name does not auto-update when the cluster changes (folder `collectionPinned` parity). */
    studyThreadPinned: boolean('studyThreadPinned').notNull().default(false),
    studyThreadLastAutoSuggestedAt: ts('studyThreadLastAutoSuggestedAt'),
    /** JSON array of normalized auto-tag names the user dismissed (string[]). */
    dismissedAutoTags: text('dismissedAutoTags'),
    /** Latest immutable NoteVersions checkpoint for the canonical note. */
    currentVersionId: text('currentVersionId'),
    /**
     * Derived mirror: true iff any live shared SpaceNotes association has
     * coEditEnabled. Source of truth is SpaceNotes.coEditEnabled (per space).
     * Kept for native / broadcast / clients that only read the note-level field.
     * Never true for encrypted notes; cleared when no association grants remain.
     */
    coEditEnabled: boolean('coEditEnabled').notNull().default(false),
    coEditEnabledAt: ts('coEditEnabledAt'),
    /** Source lineage for an independent copy of another author's note. */
    copiedFromNoteId: text('copiedFromNoteId'),
    copiedFromVersionId: text('copiedFromVersionId'),
    copiedFromAuthorId: text('copiedFromAuthorId'),
    /** Durable attribution if the source account later becomes unavailable. */
    copiedFromAuthorDisplayName: text('copiedFromAuthorDisplayName'),
    /** Template applied to start/fill this note (`soap`, `ntpl_…`, etc.). */
    startedFromTemplateId: text('startedFromTemplateId'),
    /** Display name snapshot so provenance survives template rename/delete. */
    startedFromTemplateName: text('startedFromTemplateName'),
    /**
     * Teaching-plan service (`ChurchServices.id`) this note was started from.
     * Distinct from startedFromTemplateId — a Sunday note is started from
     * *both* the church's template and that week's service.
     *
     * Privacy: this is the congregant's own row. No church-facing route ever
     * reads it, and no aggregate is derived from it. "Review is never shared."
     */
    startedFromServiceId: text('startedFromServiceId'),
    /** Title snapshot so provenance survives the church editing or deleting the entry. */
    startedFromServiceTitle: text('startedFromServiceTitle'),
    /**
     * Teaching-plan service (`ChurchServices.id`) this note is being written
     * **for** — the staff side of the sermon, where `startedFromServiceId` is
     * the congregant side.
     *
     * **Why a second column and not that one.** They point at the same table and
     * mean opposite directions: `startedFromServiceId` is *I took notes on this
     * sermon* (receiving), this is *I am writing this sermon* (authoring). One
     * column would force the planner to read rows congregants wrote, which is
     * exactly the read "Review is never shared" forbids — and the contract test
     * that enforces it would have had to be weakened to let the planner in.
     *
     * Privacy is the same rule, not a lesser one: **only ever read scoped to the
     * viewer's own `userId`.** A pastor sees that *they* started a draft for a
     * week; no route may tell one staff member that another has. The grep
     * contract test in church-services-routes.test.ts holds both columns to it.
     *
     * Per-author by construction — a teaching team may have two people drafting
     * the same Sunday, which is why this lives on the note rather than as a
     * pointer on ChurchServices. A pointer there would be a second
     * `channelSpaceId`; see docs/future/CHURCH_STUDY_MATERIAL_LINKING.md.
     *
     * No title snapshot twin. `startedFromServiceTitle` exists because a
     * congregant's provenance must survive the church deleting the entry; here
     * the note *is* the pastor's own work and a dangling id simply stops
     * offering to open a plan row that no longer exists.
     */
    plannedForServiceId: text('plannedForServiceId'),
  },
  (table) => [
    index('Notes_userIdIndex').on(table.userId),
    index('Notes_linkedFromNoteIdIndex').on(table.linkedFromNoteId),
    index('Notes_copiedFromNoteIdIndex').on(table.copiedFromNoteId),
    index('Notes_startedFromServiceIdIndex').on(table.startedFromServiceId),
    /**
     * Always queried with the viewer's own userId (see the column docblock), so
     * the index leads with it — a lone `plannedForServiceId` lookup is a query
     * this schema does not want to make cheap.
     */
    index('Notes_userId_plannedForServiceIdIndex').on(table.userId, table.plannedForServiceId),
    index('Notes_userId_updatedAtIndex').on(table.userId, table.updatedAt),
    index('Notes_spaceIdIndex').on(table.spaceId),
    index('Notes_threadIdIndex').on(table.threadId),
  ],
);

// ─── NoteVersions (immutable author-owned canonical note checkpoints) ──────────

export const NoteVersions = pgTable(
  'NoteVersions',
  {
    id: text('id').primaryKey(),
    noteId: text('noteId').notNull(),
    version: integer('version').notNull(),
    title: text('title'),
    content: text('content').notNull(),
    contentEncrypted: boolean('contentEncrypted').notNull().default(false),
    /** 'save' | 'restore' | 'copy' | 'migration-baseline' (open text for future sources). */
    source: text('source').notNull().default('save'),
    /** Permanent note author; only this user may list, inspect, create, or restore versions. */
    authorId: text('authorId').notNull(),
    /**
     * Who actually saved this checkpoint. Equals authorId for solo notes and is
     * null on rows written before co-editing — read it as `editedBy ?? authorId`.
     * authorId must stay the permanent author; this is the contributor signal.
     */
    editedBy: text('editedBy'),
    createdAt: ts('createdAt').notNull(),
  },
  (table) => [
    uniqueIndex('NoteVersions_note_version_unique').on(table.noteId, table.version),
    index('NoteVersions_noteId_createdAtIndex').on(table.noteId, table.createdAt),
    index('NoteVersions_authorId_createdAtIndex').on(table.authorId, table.createdAt),
  ],
);

// ─── SpaceNotes (reusable canonical-note associations) ────────────────────────

export const SpaceNotes = pgTable(
  'SpaceNotes',
  {
    id: text('id').primaryKey(),
    spaceId: text('spaceId').notNull(),
    noteId: text('noteId').notNull(),
    addedBy: text('addedBy').notNull(),
    addedAt: ts('addedAt').notNull(),
    updatedAt: ts('updatedAt'),
    removedBy: text('removedBy'),
    removedAt: ts('removedAt'),
    isPinned: boolean('isPinned').notNull().default(false),
    /** Per-space folder metadata; serialized string[] for secondary labels. */
    primaryCollection: text('primaryCollection'),
    secondaryCollections: text('secondaryCollections'),
    collectionPinned: boolean('collectionPinned').notNull().default(false),
    collectionUserOverride: boolean('collectionUserOverride').notNull().default(false),
    order: integer('order').notNull().default(0),
    /**
     * Author opt-in for this association: members of this shared space may edit
     * the note body ("pass the pen"). Off by default. Notes.coEditEnabled is the
     * OR-mirror across live associations.
     */
    coEditEnabled: boolean('coEditEnabled').notNull().default(false),
    coEditEnabledAt: ts('coEditEnabledAt'),
  },
  (table) => [
    uniqueIndex('SpaceNotes_space_note_unique').on(table.spaceId, table.noteId),
    index('SpaceNotes_spaceId_removedAt_orderIndex').on(table.spaceId, table.removedAt, table.order),
    index('SpaceNotes_noteId_removedAtIndex').on(table.noteId, table.removedAt),
  ],
);

// ─── NoteThreads (junction table) ──────────────────────────────────────────────

export const NoteThreads = pgTable('NoteThreads', {
  id: text('id').primaryKey(),
  noteId: text('noteId').notNull(),
  threadId: text('threadId').notNull(),
  createdAt: ts('createdAt').notNull(),
}, (table) => [
  uniqueIndex('NoteThreads_uniqueNoteThread').on(table.noteId, table.threadId),
  index('NoteThreads_threadIdIndex').on(table.threadId),
]);

// ─── StudyThreadEntries (native `StudyThread` — anchored study branches on a note) ─

export const StudyThreadEntries = pgTable(
  'StudyThreadEntries',
  {
    id: text('id').primaryKey(),
    userId: text('userId').notNull(),
    /**
     * Where this entry was made — NOT who can see it. NULL means "made while reading", i.e. a
     * highlight created in the Bible reader, which has no parent note.
     *
     * Scripture-anchored entries are scoped by `scriptureReference` + `userId` instead, so a
     * highlight on a verse is one highlight wherever that verse is shown. Scoping them by
     * parent note is what used to make the reader and a note's scripture dock two separate
     * layers over the same passage. See server/db/manual/unify-scripture-highlights.sql.
     */
    parentNoteId: text('parentNoteId'),
    spaceId: text('spaceId'),
    entryKindRaw: text('entryKindRaw').notNull().default('miniNote'),
    highlightAccentRaw: text('highlightAccentRaw').notNull().default('warmAmber'),
    sourceSnippet: text('sourceSnippet').notNull().default(''),
    focusTitle: text('focusTitle').notNull().default(''),
    notesBody: text('notesBody').notNull().default(''),
    miniNoteBody: text('miniNoteBody').notNull().default(''),
    linkedNoteId: text('linkedNoteId'),
    linkedNoteTitle: text('linkedNoteTitle'),
    anchorLocation: integer('anchorLocation'),
    anchorLength: integer('anchorLength'),
    anchorTextSnapshot: text('anchorTextSnapshot'),
    /** Durable source checkpoint and quote/context selector; legacy anchor fields remain above. */
    noteVersionId: text('noteVersionId'),
    /** Latest canonical version against which this selector was deterministically resolved. */
    resolvedVersionId: text('resolvedVersionId'),
    anchorQuote: text('anchorQuote'),
    anchorPrefixContext: text('anchorPrefixContext'),
    anchorSuffixContext: text('anchorSuffixContext'),
    /** 'unresolved' | 'resolved' | 'detached' | 'orphaned'. Migration resolves legacy rows explicitly. */
    anchorStatus: text('anchorStatus').notNull().default('unresolved'),
    resolvedAnchorStart: integer('resolvedAnchorStart'),
    resolvedAnchorEnd: integer('resolvedAnchorEnd'),
    anchorResolvedAt: ts('anchorResolvedAt'),
    anchorDetachedAt: ts('anchorDetachedAt'),
    /** Durable attribution after the actor leaves the space or account is unavailable. */
    actorDisplayNameSnapshot: text('actorDisplayNameSnapshot'),
    scriptureReference: text('scriptureReference'),
    scripturePassageTranslation: text('scripturePassageTranslation'),
    scripturePassageExcerpt: text('scripturePassageExcerpt'),
    /**
     * Which span inside the passage a highlight covers, or NULL for the whole passage.
     *
     * The reader highlight upsert keys on `(userId, parentNoteId IS NULL, entryKind, reference,
     * translation)` — verse-granular, so two phrases inside one verse would collide into one row.
     * This separates them.
     *
     * Deliberately NOT `scripturePassageExcerpt`, which is the obvious candidate and is wrong:
     * that column holds rendered Bible text, so keying on it would make the key depend on text
     * that can change, and one punctuation fix in a translation would turn a recolour into a
     * silent duplicate. This holds a hash of the normalised span instead — see
     * `src/utils/scripture-span-key.ts`.
     *
     * NULL for a whole-verse highlight, which is what every row written before this column
     * existed already is. That is what makes adding it a no-backfill change: existing rows are
     * correct as they stand, and their lookup gains `IS NULL`, which they all satisfy.
     */
    scriptureSpanKey: text('scriptureSpanKey'),
    isArchived: boolean('isArchived').notNull().default(false),
    highlightListEditedAt: ts('highlightListEditedAt'),
    createdAt: ts('createdAt').notNull(),
    updatedAt: ts('updatedAt'),
  },
  (table) => [
    index('StudyThreadEntries_parentNoteIdIndex').on(table.parentNoteId),
    index('StudyThreadEntries_userIdIndex').on(table.userId),
    index('StudyThreadEntries_noteVersionIdIndex').on(table.noteVersionId),
    index('StudyThreadEntries_resolvedVersionIdIndex').on(table.resolvedVersionId),
    index('StudyThreadEntries_spaceId_parentNoteIdIndex').on(table.spaceId, table.parentNoteId),
    index('StudyThreadEntries_anchorStatusIndex').on(table.anchorStatus),
  ],
);

// ─── SyncDeletedEntities (tombstone feed for incremental sync) ──────────────────

export const SyncDeletedEntities = pgTable(
  'SyncDeletedEntities',
  {
    id: text('id').primaryKey(),
    userId: text('userId').notNull(),
    entityType: text('entityType').notNull(), // note | studyThread | thread
    entityId: text('entityId').notNull(),
    deletedAt: ts('deletedAt').notNull(),
  },
  (table) => [
    index('SyncDeletedEntities_userDeletedAtIndex').on(table.userId, table.deletedAt),
    index('SyncDeletedEntities_userEntityDeletedAtIndex').on(table.userId, table.entityType, table.deletedAt),
  ],
);

// ─── Comments ──────────────────────────────────────────────────────────────────

export const Comments = pgTable('Comments', {
  id: text('id').primaryKey(),
  content: text('content').notNull(),
  noteId: text('noteId').notNull(),
  userId: text('userId').notNull(),
  createdAt: ts('createdAt').notNull(),
  updatedAt: ts('updatedAt'),
});

// ─── Members ───────────────────────────────────────────────────────────────────

/**
 * @deprecated v1 sharing (Classic era) — frozen July 2026, superseded by
 * SpaceMemberships. No reads or new writes; only hygiene deletes (account
 * deletion / merge / reset / space deletion) remain until the table is dropped.
 */
export const Members = pgTable('Members', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  spaceId: text('spaceId').notNull(),
  role: text('role').notNull().default('member'),
  createdAt: ts('createdAt').notNull(),
  joinedAt: ts('joinedAt'),
}, (table) => [
  index('Members_spaceIdIndex').on(table.spaceId),
  index('Members_userIdIndex').on(table.userId),
]);

// ─── SpaceInvitations ──────────────────────────────────────────────────────────

/**
 * @deprecated v1 sharing (Classic era) — frozen July 2026, superseded by
 * SpaceInvites. No reads or new writes; only hygiene deletes remain until drop.
 */
export const SpaceInvitations = pgTable('SpaceInvitations', {
  id: text('id').primaryKey(),
  spaceId: text('spaceId').notNull(),
  invitedBy: text('invitedBy').notNull(),
  invitedEmail: text('invitedEmail'),
  invitedUserId: text('invitedUserId'),
  inviteToken: text('inviteToken').notNull().unique(),
  role: text('role').notNull().default('member'),
  status: text('status').notNull(),
  message: text('message'),
  expiresAt: ts('expiresAt'),
  createdAt: ts('createdAt').notNull(),
  acceptedAt: ts('acceptedAt'),
}, (table) => [
  uniqueIndex('SpaceInvitations_tokenIndex').on(table.inviteToken),
  index('SpaceInvitations_spaceStatusIndex').on(table.spaceId, table.status),
  index('SpaceInvitations_emailIndex').on(table.invitedEmail),
]);

// ─── SpaceMemberships (shared/public space membership — supersedes Members) ─────

export const SpaceMemberships = pgTable('SpaceMemberships', {
  id: text('id').primaryKey(),
  spaceId: text('spaceId').notNull(),
  userId: text('userId').notNull(),
  /**
   * 'owner' | 'leader' | 'member'. The owner has a membership row too (the v1
   * model derived owner solely from Spaces.userId, which stays the
   * creator/billing anchor). 'leader' is schema-ready but dormant in the
   * foundation UI; it activates with Group Leader / church org.
   */
  role: text('role').notNull().default('member'),
  /** userId of the inviter; null on the owner row. */
  invitedBy: text('invitedBy'),
  /** SpaceInvites.id that was redeemed to create this membership; null on the owner row. */
  inviteId: text('inviteId'),
  /**
   * Where this row's role came from: `'staff_sync'` (or NULL, same meaning) vs
   * `'grant'` — an explicit act of giving one person leadership of one space.
   *
   * Load-bearing, and landed before the feature that needs it (P5 granted
   * leadership). `computeStaffSyncPlan` deletes any `leader` row whose user is
   * not in the Clerk roster, and sync runs on the organizationMembership
   * webhook plus every staff invite, removal, and role change — so a granted
   * volunteer would be reaped silently, probably within a day. The removal step
   * therefore skips `'grant'` rows. A no-op until the first grant exists, which
   * is the point: the rule cannot be forgotten later.
   *
   * No backfill needed — every `leader` row today is staff-projected, and NULL
   * already reads as that.
   */
  grantSource: text('grantSource'),
  joinedAt: ts('joinedAt').notNull(),
  /** Last time this member opened the shared space dashboard (new-since watermark). */
  lastVisitedAt: ts('lastVisitedAt'),
  createdAt: ts('createdAt').notNull(),
  updatedAt: ts('updatedAt'),
}, (table) => [
  uniqueIndex('SpaceMemberships_space_user_unique').on(table.spaceId, table.userId),
  index('SpaceMemberships_userIdIndex').on(table.userId),
  index('SpaceMemberships_spaceId_roleIndex').on(table.spaceId, table.role),
]);

// ─── SpaceInvites (expiring join links — supersedes SpaceInvitations) ───────────

export const SpaceInvites = pgTable('SpaceInvites', {
  id: text('id').primaryKey(),
  spaceId: text('spaceId').notNull(),
  token: text('token').notNull(),
  /** 'link' | 'email' — email invites are a fast-follow; only 'link' is created today. */
  kind: text('kind').notNull().default('link'),
  /** Role granted on redeem ('member' today; 'leader' later). */
  role: text('role').notNull().default('member'),
  invitedEmail: text('invitedEmail'),
  createdBy: text('createdBy').notNull(),
  /** Validated at preview AND redeem. Null = no expiry; default flow issues now+30d. */
  expiresAt: ts('expiresAt'),
  /** Null = unlimited uses. */
  maxUses: integer('maxUses'),
  useCount: integer('useCount').notNull().default(0),
  revokedAt: ts('revokedAt'),
  createdAt: ts('createdAt').notNull(),
}, (table) => [
  uniqueIndex('SpaceInvites_token_unique').on(table.token),
  index('SpaceInvites_spaceIdIndex').on(table.spaceId),
]);

// ─── Churches (church org registry — Clerk Organization ↔ Harvous record) ──────

/**
 * One row per church with a Clerk Organization on Harvous. The Clerk org holds
 * only staff/volunteers (≤20); congregants are NEVER Clerk org members — their
 * home linkage is UserMetadata.connectedChurchId/connectedOrgId (temporary
 * home-only until ChurchMemberships lands). Curriculum ships via org-owned
 * broadcast spaces (Spaces.orgId = Churches.orgId, type='public'). Rows are
 * written by requireHarvousAdmin routes in server/routes/churches.ts.
 * Row ids: `chur_${crypto.randomUUID()}`.
 */
export const Churches = pgTable('Churches', {
  id: text('id').primaryKey(),
  /** Clerk organization id (org_…). Required — a church record exists only once its org does. */
  orgId: text('orgId').notNull(),
  /**
   * Here’s My Church directory id (e.g. TX-123456). Source of truth for name/city/state
   * when set — those columns are a denormalized cache refreshed from HMC.
   */
  hmcChurchId: text('hmcChurchId'),
  name: text('name').notNull(),
  city: text('city'),
  state: text('state'),
  country: text('country'),

  /*
    ─── Self-serve church configuration ──────────────────────────────────────
    Written ONLY by POST /api/church/settings/update (server/routes/
    church-settings.ts), behind the admin-only `manage_church_settings`
    capability. Deliberately *below* the HMC denorm block above and never part
    of it: `hmcDenormFields` returns exactly {name, city, state, country} and
    every writer spreads those four field-by-field, so a directory refresh
    cannot reach these. Keep it that way — a church losing its own service time
    to a name sync would be silent and baffling.

    Display and defaults only. These pre-fill a date picker and label a card;
    nothing here schedules, reminds, notifies, or generates rows. "Scheduling"
    is a named anti-goal (MY_CHURCH_SIDEBAR.md, CHMS_INTEGRATION_RESEARCH.md).
    See docs/future/CHURCH_SPACE_PLANS_AND_SERVICE_TIMES.md §1.
  */
  /**
   * IANA zone (e.g. 'America/Chicago'). Its whole job is to make the 'HH:MM'
   * values in ChurchServiceTimes unambiguous — it records *whose* clock, and it
   * is what lets the congregant card know whether this morning's service has
   * started yet. Nothing converts to a viewer's timezone; congregants see the
   * church's wall time verbatim.
   */
  timezone: text('timezone'),

  /** Staff user who created the church record (audit anchor); admin roles live in Clerk org roles. */
  createdBy: text('createdBy').notNull(),
  /**
   * Church billing plan slug — nullable entitlement (draft: 'church' = paid base).
   * Pilot churches may run on isActive alone without a plan slug. Future add-ons
   * (curriculum, church Shared Spaces, analytics, unlimited staff) are separate
   * flags — see MONETIZATION_AND_PRICING.md §7. Written by billing webhook /
   * admin when paid plans ship.
   */
  billingPlan: text('billingPlan'),
  billingPlanUpdatedAt: ts('billingPlanUpdatedAt'),
  /** Polar subscription id backing `billingPlan` — needed to reconcile cancels. */
  billingSubscriptionId: text('billingSubscriptionId'),
  /** Last Polar subscription status seen ('active', 'canceled', …). Audit/debug only — gates read billingPlan. */
  billingStatus: text('billingStatus'),
  /**
   * Concierge-pilot window. A church is sponsored while `billingPlan` is set OR
   * `pilotUntil` is in the future — see server/utils/church-entitlement.ts.
   * Deliberately church-scoped rather than an expiring user Entitlement row:
   * `listActiveFeatureKeys` never checks `Entitlements.expiresAt`, so an
   * expiring user grant would never lapse.
   */
  pilotUntil: ts('pilotUntil'),
  /** Admin kill-switch (Spaces.isActive parity). */
  isActive: boolean('isActive').notNull().default(true),
  /** Soft-delete lifecycle — Spaces parity, for a future church-offboarding flow. */
  deletedAt: ts('deletedAt'),
  recoveryUntil: ts('recoveryUntil'),
  createdAt: ts('createdAt').notNull(),
  updatedAt: ts('updatedAt'),
}, (table) => [
  uniqueIndex('Churches_orgId_unique').on(table.orgId),
  uniqueIndex('Churches_hmcChurchId_unique').on(table.hmcChurchId),
  index('Churches_createdByIndex').on(table.createdBy),
]);

// ─── ChurchMemberships (many church links; home stays on UserMetadata.connected*) ─

/**
 * Conglomerate memberships for multi-church (locked: many memberships, one home).
 * Stub table for connect flow — no product writers yet. Until connect ships,
 * UserMetadata.connectedChurchId/connectedOrgId/connectedChurchAt remain the
 * temporary singular home pointer (get-profile exposes them).
 * Row ids: `chmem_${crypto.randomUUID()}`.
 */
export const ChurchMemberships = pgTable('ChurchMemberships', {
  id: text('id').primaryKey(),
  churchId: text('churchId').notNull(),
  userId: text('userId').notNull(),
  /** 'member' today; staff stay in Clerk org + SpaceMemberships, not here. */
  role: text('role').notNull().default('member'),
  joinedAt: ts('joinedAt').notNull(),
  createdAt: ts('createdAt').notNull(),
  updatedAt: ts('updatedAt'),
}, (table) => [
  uniqueIndex('ChurchMemberships_church_user_unique').on(table.churchId, table.userId),
  index('ChurchMemberships_userIdIndex').on(table.userId),
  index('ChurchMemberships_churchIdIndex').on(table.churchId),
]);

// ─── ChurchServiceTimes (when the church gathers — recurring, stable) ─────────

/**
 * A church's recurring service times: "Sundays at 9:00", "Sundays at 10:45",
 * "Wednesdays at 18:30".
 *
 * Separate from ChurchServices because they answer different questions and
 * change on different clocks. *When the church meets* is stable and recurring;
 * *what is preached* changes weekly. Conflating them made a two-service Sunday
 * inexpressible — a church preaching one sermon at 9:00 and 10:45 had to
 * pretend it had a single service.
 *
 * Display and defaults only: these label a card and seed a picker. Nothing here
 * schedules, reminds, or notifies — "scheduling" is a named anti-goal. See
 * docs/future/CHURCH_SPACE_PLANS_AND_SERVICE_TIMES.md §1.
 *
 * Row ids: `cstm_${crypto.randomUUID()}`.
 */
export const ChurchServiceTimes = pgTable('ChurchServiceTimes', {
  id: text('id').primaryKey(),
  churchId: text('churchId').notNull(),
  /** 0–6, 0 = Sunday — Date.getDay() and the WEEKDAYS array in church-services.ts. */
  dayOfWeek: integer('dayOfWeek').notNull(),
  /** 'HH:MM' 24h on the church's own wall clock; the zone is Churches.timezone. */
  startTime: text('startTime').notNull(),
  /** Optional human name — "First service", "Evening". Null renders as the time alone. */
  label: text('label'),
  sortOrder: integer('sortOrder').notNull().default(0),
  createdAt: ts('createdAt').notNull(),
  updatedAt: ts('updatedAt'),
}, (table) => [
  /** The same slot twice would give a sermon two identical checkboxes. */
  uniqueIndex('ChurchServiceTimes_church_day_time_unique').on(
    table.churchId,
    table.dayOfWeek,
    table.startTime,
  ),
  index('ChurchServiceTimes_churchIdIndex').on(table.churchId),
]);

// ─── ChurchServiceTimeAssignments (which services a sermon is preached at) ────

/**
 * Many-to-many between a teaching-plan entry and the church's service times.
 *
 * Many-to-many because both directions are real: one sermon is preached at both
 * Sunday morning services, and one Sunday holds a different sermon in the
 * evening. Either alone would have fitted a foreign key; together they do not.
 *
 * `serviceDate` is denormalized from the parent row on purpose, and it is the
 * only denormalization here. It buys the unique index below — a genuine DB
 * guarantee that one slot on one date has one sermon, which is what replaced
 * the old one-service-per-church-per-date index. Writers must update it in the
 * same transaction as the parent's date; nothing else may write it.
 *
 * Row ids: `csta_${crypto.randomUUID()}`.
 */
export const ChurchServiceTimeAssignments = pgTable('ChurchServiceTimeAssignments', {
  id: text('id').primaryKey(),
  /** ChurchServices.id — the sermon. */
  serviceId: text('serviceId').notNull(),
  /** ChurchServiceTimes.id — the slot it is preached at. */
  serviceTimeId: text('serviceTimeId').notNull(),
  /** Mirrors ChurchServices.serviceDate. See the note above before touching. */
  serviceDate: text('serviceDate').notNull(),
  createdAt: ts('createdAt').notNull(),
}, (table) => [
  /**
   * One sermon per slot per date — the replacement for
   * ChurchServices_church_date_unique. "This Sunday 9:00" still has exactly one
   * answer; "this Sunday" now has as many as the church actually holds.
   */
  uniqueIndex('ChurchServiceTimeAssignments_slot_date_unique').on(
    table.serviceTimeId,
    table.serviceDate,
  ),
  index('ChurchServiceTimeAssignments_serviceIdIndex').on(table.serviceId),
  index('ChurchServiceTimeAssignments_serviceDateIndex').on(table.serviceDate),
]);

// ─── ChurchSeries (the study a run of sermons belongs to) ────────────────────

/**
 * A named study spanning several sermons — "Life in the Spirit", eight weeks.
 *
 * Was `ChurchServices.seriesTitle`, free text grouped by equality. The string
 * was right while a series was only a label; it cannot carry what the church
 * wants next. Nothing can attach to a string that lives in eight rows, "show me
 * this study" is not a `LIKE`, and renaming week 5 silently forks the series in
 * two. The row fixes all three. See
 * `docs/future/CHURCH_SPACE_PLANS_AND_SERVICE_TIMES.md` §9.
 *
 * Not a `Threads` row, for the reason the original column gave and which still
 * holds: thread creation in a non-personal space requires the literal space
 * owner, and non-owners only ever see the pinned thread — so a series would be
 * invisible to the congregation and orphaned when its author left staff. What
 * was rejected there was the *substrate*, never series as an entity.
 *
 * **Scoped to a plan, not to a church.** `spaceId` mirrors `ChurchServices`
 * exactly (NULL = the church's own plan), and a sermon may only point at a
 * series in its own scope — otherwise a granted volunteer leader could rename a
 * row the main service's plan renders, which is the authority the space-plan
 * gate spent its effort bounding. Cross-plan reuse is a copy, which is what
 * "re-run last series" already is.
 *
 * Deleting a series never deletes sermons — it nulls their `seriesId`. A
 * destructive act on a label must not be a destructive act on the calendar.
 *
 * Row ids: `csrs_${crypto.randomUUID()}`.
 */
export const ChurchSeries = pgTable('ChurchSeries', {
  id: text('id').primaryKey(),
  /** NULL = a churchless Shared Space's own plan. Same rule as `ChurchServices.churchId`. */
  churchId: text('churchId'),
  /** NULL = the church plan; set = that space's plan. Immutable after create. */
  spaceId: text('spaceId'),
  title: text('title').notNull(),
  /**
   * A THREAD_COLORS token (`blue` | `purple` | `orange` | `green` | `pink`) — the
   * same palette threads, spaces, and avatars already draw from, stored as a
   * token rather than a hex so `getThreadColorCSS` resolves it to a CSS variable
   * and light/dark comes for free. A stored hex would be a second palette that
   * drifts from the first the next time the theme moves.
   *
   * **Nullable, and null is the common case.** `seriesAccent` derives a stable
   * colour from the row id when this is unset, so every series that existed
   * before this column is coloured the moment it ships and no backfill is owed.
   * A pastor only ever *overrides* — which is why there is no default here.
   */
  color: text('color'),
  /** One line on what this run is about. Staff-facing; never rendered to a congregant. */
  description: text('description'),
  /**
   * Which *run* of a recurring series this is — "2027", "Fall", or NULL.
   *
   * Churches run seasonal series under the same name every year: Advent, Lent,
   * Easter. The uniqueness below was built to stop a typo forking "Life In the
   * Spirit" from "Life in the Spirit", and it is right about that — but it
   * cannot tell a typo apart from a season coming round again, so "Advent"
   * could exist once per plan, ever.
   *
   * **NULL is the common case and behaves exactly as before.** Uniqueness folds
   * this in through `coalesce(lower(runLabel), '')`, so a plan with one
   * unlabelled "Advent" is constrained precisely as it was, and
   * `findOrCreateSeries` resolves the free-text combobox against
   * `runLabel IS NULL` — which is what keeps the typo guard intact and keeps
   * this invisible to a church that never re-runs anything.
   *
   * Shown only when it disambiguates: one "Advent" reads "Advent"; two read
   * "Advent · 2026" and "Advent · 2027". Re-running labels *both* runs, because
   * the moment a second run exists is the moment the ambiguity does.
   */
  runLabel: text('runLabel'),
  /**
   * The sequence Thread this series was published into, if it has been.
   *
   * A series is still not a Thread — this is the *artifact* of publishing one,
   * which is why the pointer sits here instead of the series becoming the
   * Thread. Republishing updates this Thread and appends only the weeks that
   * are new; it never mints a second, so the congregation's study plan keeps
   * its identity when a pastor adds week nine.
   *
   * Nulled when the Thread is deleted — see the thread delete/erase routes.
   */
  publishedThreadId: text('publishedThreadId'),
  createdBy: text('createdBy').notNull(),
  createdAt: ts('createdAt').notNull(),
  updatedAt: ts('updatedAt'),
}, (table) => [
  /**
   * One series per name **per run** per plan, case-insensitively — so
   * "Life In the Spirit" still cannot become a second series beside "Life in
   * the Spirit", while Advent 2026 and Advent 2027 can both exist.
   *
   * Two partial indexes because `spaceId IS NULL` is a distinct scope and
   * Postgres treats NULLs as distinct in a plain unique index, so the
   * church-plan half would not be constrained at all. Same shape and same
   * reason as `ChurchServices_space_date_unique`.
   *
   * `coalesce` rather than a plain column for the same reason: a NULL
   * `runLabel` must collide with another NULL `runLabel`, which a raw column in
   * a unique index would not. Both `coalesce` and `lower` are IMMUTABLE, so the
   * expression index is legal.
   */
  uniqueIndex('ChurchSeries_church_title_run_unique')
    .on(table.churchId, sql`lower(${table.title})`, sql`coalesce(lower(${table.runLabel}), '')`)
    .where(sql`${table.spaceId} IS NULL`),
  uniqueIndex('ChurchSeries_space_title_run_unique')
    .on(table.spaceId, sql`lower(${table.title})`, sql`coalesce(lower(${table.runLabel}), '')`)
    .where(sql`${table.spaceId} IS NOT NULL`),
  index('ChurchSeries_churchIdIndex').on(table.churchId),
]);

// ─── ChurchServices (the church's teaching plan — one row per sermon) ─────────

/**
 * A church's preaching/teaching plan: one row per sermon.
 *
 * This is the spine the congregant "This Sunday" card and the staff Teaching
 * plan both read. Keyed on `churchId` alone — every route that gates anything
 * already materializes the full `Churches` row (getConnectedChurch,
 * getActiveChurchByOrgId, resolveStaffContext), so denormalizing `orgId` here
 * would buy zero round trips and mint a second drift pair like
 * UserMetadata.connectedChurchId/connectedOrgId.
 *
 * **`spaceId` is a relationship, not a cached copy — which is why it is allowed
 * where `orgId` is refused.** It says *which plan* a row belongs to: NULL is the
 * church's own plan, set is a ministry channel's or church Shared Space's. What
 * it does introduce is a cross-row invariant — the space must belong to the same
 * church (`Spaces.orgId === Churches.orgId`) — enforced at both ends: the
 * space-plan gate refuses a mismatch on write, and every read re-joins `Spaces`
 * filtered by org + not-deleted + active, so a removed space makes its plan rows
 * invisible rather than dangling. `spaceId` is immutable after create; there is
 * no "move a sermon between plans", only delete and recreate.
 *
 * **No unique index on (churchId, serviceDate).** There used to be one, called
 * "what makes This Sunday have exactly one answer" — but a church with a
 * morning series and a different evening series has two sermons on one Sunday,
 * and that is ordinary rather than exotic. The guarantee moved to
 * ChurchServiceTimeAssignments, at the grain where it is actually true: one
 * sermon per service time per date.
 *
 * No soft delete: a plan entry is not study. Removing one destroys nothing —
 * congregants' notes are canonical and independent, and provenance survives on
 * `Notes.startedFromServiceTitle`.
 *
 * No `isPublished`: congregants only ever see the *next* service, so a
 * half-sketched entry weeks out is invisible without a draft state.
 *
 * Row ids: `svc_${crypto.randomUUID()}`.
 */
export const ChurchServices = pgTable('ChurchServices', {
  id: text('id').primaryKey(),
  /**
   * NULL = a churchless Shared Space's own plan.
   *
   * A group that meets without a church still meets on a rhythm, so a plan no
   * longer requires one. The invariant `churchId IS NULL ⇒ spaceId IS NOT NULL`
   * holds — a plan belongs to *some* room — and lives in the write routes
   * rather than an index, because no partial unique expresses "exactly one of
   * these is set" without also constraining which pairs are legal.
   */
  churchId: text('churchId'),
  /**
   * Which plan this sermon belongs to. NULL = the church's own plan; set = a
   * ministry channel, a church Shared Space, or a churchless Shared Space that
   * carries its own (Youth meets Wednesdays). See the docblock above for the
   * same-church invariant and why this column is allowed where a denormalized
   * `orgId` is not.
   */
  spaceId: text('spaceId'),
  /**
   * Church-local calendar day, 'YYYY-MM-DD'. Deliberately NOT a timestamp: a
   * service is a day on the church's wall calendar, and a TIMESTAMPTZ drifts a
   * Sunday into Saturday for a viewer three zones away. Same choice as
   * VotdPublishHistory.publishedDate.
   *
   * **NULL means unscheduled** — an idea sitting in the planner's backlog,
   * waiting for a Sunday. Planning starts before a date exists ("I want to
   * preach Habakkuk this fall"), and forcing a placeholder date to hold the
   * thought put fiction on the calendar. Two invariants ride along, enforced in
   * the write routes because no index can express them: an undated row has no
   * ChurchServiceTimeAssignments (that table mirrors a date it does not have)
   * and a NULL `serviceTime`.
   *
   * Congregant reads must exclude these — see `listServicesForChurch`. The
   * backlog is a staff surface; "This Sunday" never shows a maybe.
   */
  serviceDate: text('serviceDate'),
  /**
   * A one-off time for a sermon that does not sit at any of the church's usual
   * services — a Christmas Eve 17:00, a Good Friday evening.
   *
   * Normally NULL: the times come from ChurchServiceTimeAssignments, because
   * those recur and this does not. Adding a permanent "Thursday 17:00" slot for
   * one Christmas Eve would be a lie about the church's week, which is the
   * whole reason this column survives the move to assignments.
   *
   * 'HH:MM' 24h, church wall clock — text for the same reason `serviceDate` is.
   */
  serviceTime: text('serviceTime'),
  title: text('title').notNull(),
  /**
   * ChurchSeries.id, or NULL for a standalone sermon. Replaced the free-text
   * `seriesTitle` outright rather than sitting beside it — a denormalized copy
   * would reintroduce the exact bug the row exists to fix, two sources of truth
   * and a rename that lands in only one. Reads join; the join is one row per
   * sermon on payloads already bounded to a handful of weeks.
   *
   * Must share this sermon's plan scope (see the ChurchSeries docblock); the
   * write routes enforce it, because no index can.
   */
  seriesId: text('seriesId'),
  /** Canonical form written by canonicalizeServiceReference. Nullable — a
   *  topical Sunday is legal, and every downstream path tolerates null. */
  reference: text('reference'),
  /** NoteTemplates.id, org-scoped — the starter a congregant's note begins from. */
  starterTemplateId: text('starterTemplateId'),
  /**
   * What kind of thing this row plans: `'gathering'` | `'content'`.
   *
   * The church plan and church Shared Spaces plan **gatherings** — a service, a
   * Wednesday night, something people come to at a time. A ministry channel
   * does not gather; it *publishes*, on a `Spaces.publishCadence`. Planning a
   * channel as though it met weekly borrowed a shape that fit nothing about it:
   * one entry per date (a daily devotional channel breaks that on day one), a
   * meeting time, and the word "gathering" in every string.
   *
   * **Derived from the plan's space on write, never taken from the client** —
   * `isMinistryBroadcastSpaceRow` decides it. A client that could name its own
   * kind could escape the one-per-date rule by claiming to be content.
   *
   * Not a publish state. There is no pipeline from a planned entry to a
   * published note yet (see docs/future/CHURCH_STUDY_MATERIAL_LINKING.md for
   * why the pointer that tried was removed) — a content entry is still only a
   * plan, and nothing congregant-facing reads it.
   */
  kind: text('kind').notNull().default('gathering'),
  createdBy: text('createdBy').notNull(),
  updatedBy: text('updatedBy'),
  createdAt: ts('createdAt').notNull(),
  updatedAt: ts('updatedAt'),
}, (table) => [
  /**
   * Plain index, not unique — see the "no unique index" note in the docblock.
   * The church-plan one-answer guarantee lives on ChurchServiceTimeAssignments.
   */
  index('ChurchServices_church_dateIndex').on(table.churchId, table.serviceDate),
  index('ChurchServices_spaceIdIndex').on(table.spaceId),
  /**
   * One gathering per date, for space plans only.
   *
   * Spaces get a hard index where the church gets a route guard, because a
   * space has a single `meetingTime` and can never claim a church service slot
   * — so every space row is timeless and the DB can carry the whole invariant.
   * The church side cannot: its answer depends on which slots a sermon claims.
   *
   * Undated backlog rows fall out of this for free: Postgres treats NULLs as
   * distinct in a unique index, so a space can hold as many unscheduled ideas
   * as it likes while still having one gathering per actual date.
   *
   * **Gatherings only.** A ministry channel publishes rather than meets, and a
   * daily channel puts several entries on one date by design — "one per date"
   * is a fact about a room people walk into, not about a publishing queue.
   */
  uniqueIndex('ChurchServices_space_date_unique')
    .on(table.spaceId, table.serviceDate)
    .where(sql`${table.spaceId} IS NOT NULL AND ${table.kind} = 'gathering'`),
]);

// ─── NoteTemplates (personal / space / org-scoped note starters) ───────────────

/**
 * User-created and space/org-provisioned note templates. Built-ins stay in
 * src/data/note-templates.ts (not rows). Scope:
 * - userId only (spaceId/orgId null) = personal template
 * - spaceId set = shared with everyone composing in that space (owner/leader attach)
 * - orgId set = church/org-provisioned (live since v2.18.0 — see note-templates.ts)
 * Row ids: `ntpl_${crypto.randomUUID()}`.
 */
export const NoteTemplates = pgTable(
  'NoteTemplates',
  {
    id: text('id').primaryKey(),
    /** Creator — personal templates are userId-only (spaceId/orgId null). */
    userId: text('userId').notNull(),
    /** Set = space template visible to members composing in that space. */
    spaceId: text('spaceId'),
    /** Set = church/org-provisioned template (future role-gated); null in v1. */
    orgId: text('orgId'),
    name: text('name').notNull(),
    /** Short list blurb (≤ ~2 lines in browse sheet). */
    description: text('description'),
    /** Title prefill (titleTemplate equivalent). */
    title: text('title'),
    /** Tiptap HTML, same format as Notes.content. */
    content: text('content').notNull(),
    noteType: text('noteType'),
    /** Thread accent for the shared list icon tile (`blue`, `green`, …). */
    iconColor: text('iconColor'),
    createdAt: ts('createdAt').notNull(),
    updatedAt: ts('updatedAt'),
  },
  (table) => [
    index('NoteTemplates_userIdIndex').on(table.userId),
    index('NoteTemplates_spaceIdIndex').on(table.spaceId),
  ]
);

// ─── UserMetadata ──────────────────────────────────────────────────────────────

export const UserMetadata = pgTable('UserMetadata', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull().unique(),
  highestSimpleNoteId: integer('highestSimpleNoteId').notNull().default(0),
  userColor: text('userColor').notNull().default('blue'),
  firstName: text('firstName'),
  lastName: text('lastName'),
  email: text('email'),
  profileImageUrl: text('profileImageUrl'),
  clerkDataUpdatedAt: ts('clerkDataUpdatedAt'),
  /**
   * Here’s My Church directory id — SoT for the user’s picked church.
   * churchName/City/State/Country below are denormalized cache from HMC.
   */
  hmcChurchId: text('hmcChurchId'),
  churchName: text('churchName'),
  churchCity: text('churchCity'),
  churchState: text('churchState'),
  churchCountry: text('churchCountry'),
  currentSeason: text('currentSeason'),
  lastMonthlyVisit: ts('lastMonthlyVisit'),
  churchAddedAt: ts('churchAddedAt'),
  /**
   * Home church (Churches.id) — temporary singular home until ChurchMemberships
   * lands (locked: many memberships, one home). Denormalized churchName/City/
   * State/Country stay for discovery/matching — do not repurpose as linkage.
   * Null = no home church. Congregants are linked here only; never Clerk org.
   */
  connectedChurchId: text('connectedChurchId'),
  /** Denormalized Clerk org id (= Churches.orgId) for cheap org-scoped checks. */
  connectedOrgId: text('connectedOrgId'),
  connectedChurchAt: ts('connectedChurchAt'),
  referralBonusNotes: integer('referralBonusNotes').notNull().default(0),
  referralCode: text('referralCode').unique(),
  lockPinSalt: text('lockPinSalt'),
  lockPinHash: text('lockPinHash'),
  defaultTranslation: text('defaultTranslation').notNull().default('NET'),
  /**
   * Device-synced appearance preferences (prototype canvas). JSON string:
   * `{ colorScheme: 'system'|'light'|'dark', bgLight: ProtoBg, bgDark: ProtoBg }`.
   * `null` = never set (triggers a one-time seed from the device's localStorage).
   * Account is source of truth; localStorage is the per-device first-paint cache.
   */
  appearanceSettings: text('appearanceSettings'),
  /**
   * Where the reader was last, for continue-reading. JSON string:
   * `{ book, bookOrder, chapter, translation, verse?, readAt }`. See
   * src/utils/last-read-position.ts for why this is stored rather than derived
   * from ReadingEvents. `null` = has never read a chapter.
   */
  lastReadPosition: text('lastReadPosition'),
  /**
   * Per-user My Home space-switcher order for personal Shared Spaces (hosted + joined).
   * JSON `string[]` of space ids. Not `Spaces.order` — preference only.
   */
  sharedSpaceSwitcherOrder: text('sharedSpaceSwitcherOrder'),
  /** Last applied onboarding markdown pack version (see ONBOARDING_PACK_VERSION). */
  onboardingPackVersionApplied: integer('onboardingPackVersionApplied').notNull().default(0),
  /**
   * Getting-started checklist state. JSON string — see src/utils/onboarding-state.ts for
   * the shape and, more importantly, the merge rules.
   *
   * Unlike `appearanceSettings`, this is never overwritten on write: the endpoint merges
   * monotonically, because this records things that happened rather than a preference.
   * `null` = never stored; Home seeds it once from the account's own data.
   *
   * Unrelated to `onboardingPackVersionApplied` above, which belongs to the removed
   * seeded-content feature and is dead. Do not repurpose it for this.
   */
  onboardingState: text('onboardingState'),
  /**
   * Legacy notes-tier label (`free` | `unlimited`) — retired for gating; kept for
   * admin support/usage stats until those surfaces move off it. Paid features
   * live in `Entitlements`.
   */
  tier: text('tier').notNull().default('free'),
  /** Polar customer id for portal sessions and subscription sync. */
  polarCustomerId: text('polarCustomerId'),
  /**
   * When this user claimed the founding offer. `null` = never.
   *
   * Founding is a Polar `duration: once` discount on the annual plan, not a
   * product, so a founder's subscription looks like any other annual one and
   * this cannot be derived from `Entitlements.productId`. Stamped by the Polar
   * webhook when a discounted checkout completes, and never cleared — the
   * promise is "the first 99 people", so a founder who cancels keeps their
   * claim rather than freeing the slot, and the badge outlives the first
   * renewal onto the list price.
   *
   * Not an entitlement: founding grants no capability a normal Plus
   * subscription doesn't. It is identity, so it lives here.
   */
  foundingClaimedAt: ts('foundingClaimedAt'),
  createdAt: ts('createdAt').notNull(),
  updatedAt: ts('updatedAt'),
}, (table) => [
  // The "all congregants of church X" fan-out (connect notifications, follow
  // backfill into broadcast spaces). Cheap to add now; a lock under load later.
  index('UserMetadata_connectedChurchIdIndex').on(table.connectedChurchId),
  index('UserMetadata_hmcChurchIdIndex').on(table.hmcChurchId),
  index('UserMetadata_polarCustomerIdIndex').on(table.polarCustomerId),
]);

/**
 * Feature entitlements — DB source of truth for paid (and grant) access.
 * Multiple sources can coexist per feature (e.g. personal billing + church seat)
 * without clobbering each other. Unique on (userId, featureKey, source).
 */
export const Entitlements = pgTable(
  'Entitlements',
  {
    id: text('id').primaryKey(),
    userId: text('userId').notNull(),
    featureKey: text('featureKey').notNull(),
    status: text('status').notNull().default('active'), // active | canceled | expired
    source: text('source').notNull().default('billing'), // billing | admin_grant | church_seat | trial
    /** Provider subscription id (Polar subscription id) when source=billing. */
    providerRef: text('providerRef'),
    /** Polar product id that granted this row. */
    productId: text('productId'),
    grantedAt: ts('grantedAt').notNull(),
    expiresAt: ts('expiresAt'),
    updatedAt: ts('updatedAt'),
  },
  (table) => [
    index('Entitlements_userIdIndex').on(table.userId),
    index('Entitlements_userId_featureKeyIndex').on(table.userId, table.featureKey),
    uniqueIndex('Entitlements_userId_featureKey_sourceUnique').on(
      table.userId,
      table.featureKey,
      table.source,
    ),
  ],
);

// ─── ClerkUserMapping (pk_live → pk_test read-time resolution) ─────────────────

export const ClerkUserMapping = pgTable(
  'ClerkUserMapping',
  {
    devUserId: text('devUserId').primaryKey(),
    email: text('email').notNull(),
    liveUserId: text('liveUserId').unique(),
    /** When set, data has been merged to live; use liveUserId for DB from now on. */
    migratedToLiveAt: ts('migratedToLiveAt'),
  },
  (table) => [
    index('ClerkUserMapping_liveUserIdIndex').on(table.liveUserId),
    index('ClerkUserMapping_emailIndex').on(table.email),
  ]
);

// ─── UserXP ────────────────────────────────────────────────────────────────────

export const UserXP = pgTable('UserXP', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  activityType: text('activityType').notNull(),
  xpAmount: integer('xpAmount').notNull(),
  relatedId: text('relatedId'),
  season: text('season'),
  createdAt: ts('createdAt').notNull(),
  metadata: text('metadata'),
});

// ─── UserSeasonalXP ────────────────────────────────────────────────────────────

export const UserSeasonalXP = pgTable('UserSeasonalXP', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  season: text('season').notNull(),
  totalXP: integer('totalXP').notNull().default(0),
  sessionCount: integer('sessionCount').notNull().default(0),
  createdAt: ts('createdAt').notNull(),
  updatedAt: ts('updatedAt'),
});

// ─── UserLifetimeXP ────────────────────────────────────────────────────────────

export const UserLifetimeXP = pgTable('UserLifetimeXP', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull().unique(),
  totalXP: integer('totalXP').notNull().default(0),
  lastUpdated: ts('lastUpdated').notNull(),
});

// ─── WeeklyStreaks ─────────────────────────────────────────────────────────────

export const WeeklyStreaks = pgTable('WeeklyStreaks', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  weekStart: ts('weekStart').notNull(),
  daysWithSessions: integer('daysWithSessions').notNull().default(0),
  xpAwarded: integer('xpAwarded').notNull().default(0),
  createdAt: ts('createdAt').notNull(),
  updatedAt: ts('updatedAt'),
});

// ─── Tags ──────────────────────────────────────────────────────────────────────

export const Tags = pgTable('Tags', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  color: text('color'),
  category: text('category'),
  userId: text('userId').notNull(),
  isSystem: boolean('isSystem').notNull().default(false),
  createdAt: ts('createdAt').notNull(),
  updatedAt: ts('updatedAt'),
});

// ─── NoteTags (junction table) ─────────────────────────────────────────────────

export const NoteTags = pgTable('NoteTags', {
  id: text('id').primaryKey(),
  noteId: text('noteId').notNull(),
  tagId: text('tagId').notNull(),
  isAutoGenerated: boolean('isAutoGenerated').notNull().default(false),
  confidence: real('confidence'),
  createdAt: ts('createdAt').notNull(),
}, (table) => [
  uniqueIndex('NoteTags_uniqueNoteTag').on(table.noteId, table.tagId),
  index('NoteTags_tagIdIndex').on(table.tagId),
  index('NoteTags_noteIdIndex').on(table.noteId),
]);

// ─── ScriptureMetadata ─────────────────────────────────────────────────────────

export const ScriptureMetadata = pgTable('ScriptureMetadata', {
  id: text('id').primaryKey(),
  noteId: text('noteId').notNull(),
  reference: text('reference').notNull(),
  book: text('book').notNull(),
  chapter: integer('chapter').notNull(),
  verse: integer('verse').notNull(),
  verseEnd: integer('verseEnd'),
  // For cross-chapter ranges (e.g. "Exodus 6:28-7:7"): the chapter the range ends in.
  // When set, `verseEnd` is the end verse within `chapterEnd`, not `chapter`. Null otherwise.
  chapterEnd: integer('chapterEnd'),
  translation: text('translation').notNull(),
  originalText: text('originalText').notNull(),
  createdAt: ts('createdAt').notNull(),
}, (table) => [
  index('ScriptureMetadata_noteIdIndex').on(table.noteId),
]);

// ─── NoteScriptureReferences (junction table) ──────────────────────────────────

export const NoteScriptureReferences = pgTable('NoteScriptureReferences', {
  id: text('id').primaryKey(),
  noteId: text('noteId').notNull(),
  scriptureNoteId: text('scriptureNoteId').notNull(),
  createdAt: ts('createdAt').notNull(),
}, (table) => [
  uniqueIndex('NoteScriptureReferences_uniqueNoteScripture').on(table.noteId, table.scriptureNoteId),
]);

// ─── NoteFingerprints (per-note semantic profile — memory layer Workstream A) ──
// One server-derived "passage memory fingerprint" per user note: the assembled themes, people,
// places, and emotional tone of a note, plus a composite `meaningWeight`. Recomputed in the
// scripture-processing pipeline on each real save. Kept in a side table (not on Notes) so it
// never bloats the offline Notes sync payload and stays clearly server-owned. Consumed by
// forgetting-aware resurfacing (B) and study arcs (C). See docs/future/MEMORY_LAYER_ASSESSMENT.md.

export const NoteFingerprints = pgTable('NoteFingerprints', {
  noteId: text('noteId').primaryKey(),
  userId: text('userId').notNull(),
  /** JSON array of theme labels (string[]), prose tags + passage themes, deduped. */
  themes: text('themes'),
  /** JSON array of people names (string[]) from the note's cited passages. */
  people: text('people'),
  /** JSON array of place names (string[]) from the note's cited passages. */
  places: text('places'),
  /** Distinct passage count (own + linked scripture notes). */
  passageCount: integer('passageCount').notNull().default(0),
  /** Dominant emotional tone slug, or null when no clear signal. */
  emotionalTone: text('emotionalTone'),
  /** JSON object of tone slug -> match count (string), for transparency. */
  toneScores: text('toneScores'),
  /** Composite meaning score in [0,1] — body depth, passages, highlights, tags, deliberate org. */
  meaningWeight: real('meaningWeight').notNull().default(0),
  /** Workstream B: spaced-repetition stability (days) after recall re-engagement; null = default base. */
  recallStabilityDays: real('recallStabilityDays'),
  /** Workstream B: last time the user opened this note via a recall card (ms since epoch in app layer). */
  lastRecallEngagedAt: ts('lastRecallEngagedAt'),
  /** Dominant Protestant canon section id (gospels, paul, law, …) from cited passages. */
  canonSection: text('canonSection'),
  /** ot | nt by passage weight across cited books. */
  testament: text('testament'),
  /** JSON string[] of all canon section ids present on cited passages. */
  canonSections: text('canonSections'),
  computedAt: ts('computedAt').notNull(),
}, (table) => [
  index('NoteFingerprints_userIdIndex').on(table.userId),
  index('NoteFingerprints_userId_meaningWeightIndex').on(table.userId, table.meaningWeight),
]);

// ─── RecallEvents (Home recall carousel analytics — Workstream B Phase 2) ───────
// Append-only opens/snoozes by opportunity kind. See docs/RECALL_USAGE_METRICS_PHASE2.md.

export const RecallEvents = pgTable('RecallEvents', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  opportunityId: text('opportunityId').notNull(),
  kind: text('kind').notNull(),
  action: text('action').notNull(),
  noteId: text('noteId'),
  createdAt: ts('createdAt').notNull(),
}, (table) => [
  index('RecallEvents_userId_createdAtIndex').on(table.userId, table.createdAt),
  index('RecallEvents_kind_action_createdAtIndex').on(table.kind, table.action, table.createdAt),
]);

// ─── ReadingEvents (append-only log of chapters read) ──────────────────────────
// Every other record of what someone reads is inferred from what they wrote about it, so a
// chapter read and not noted leaves no trace. This is the direct record: one row per reading
// session, written fire-and-forget so it can never slow the reading surface down. Feeds
// `continueBook` recall opportunities, which until now could only see cited chapters.

export const ReadingEvents = pgTable('ReadingEvents', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  /** Canonical book name, e.g. "John". */
  book: text('book').notNull(),
  /** Canonical position (0-based, Genesis = 0) so ranking never re-resolves book names. */
  bookOrder: integer('bookOrder').notNull(),
  chapter: integer('chapter').notNull(),
  /** Translation the chapter was read in, e.g. "NLT". */
  translation: text('translation').notNull(),
  /** glance | read | study — see src/utils/reading-event-kinds.ts. */
  dwellBucket: text('dwellBucket').notNull(),
  createdAt: ts('createdAt').notNull(),
}, (table) => [
  index('ReadingEvents_userId_createdAtIndex').on(table.userId, table.createdAt),
  index('ReadingEvents_userId_bookOrder_chapterIndex').on(table.userId, table.bookOrder, table.chapter),
]);

// ─── NoteVisitEvents (append-only log of notes opened and read) ────────────────
// The note-side twin of ReadingEvents: that one records reading Scripture, this one records
// reading your own notes. Everything Home knew about a note came from having *written* it,
// so a note returned to every morning and never edited faded exactly like an abandoned one.
//
// Deliberately not Notes.lastVisited. server/routes/sync.ts uses gt(Notes.lastVisited,
// since) as a delta-pull trigger, so stamping the row on every open would push a sync delta
// per note open — the mirror image of the updatedAt double-duty problem. A row per visit
// also records frequency, which one mutable column cannot, and keeps two people reading a
// shared note from overwriting each other's timestamp. Same reasoning that keeps
// NoteFingerprints off the Notes row.

export const NoteVisitEvents = pgTable('NoteVisitEvents', {
  id: text('id').primaryKey(),
  /** The *visitor*, not the note's owner — a shared note read by two people is two rows. */
  userId: text('userId').notNull(),
  noteId: text('noteId').notNull(),
  /** glance | read | study — see src/utils/note-visit-kinds.ts. */
  dwellBucket: text('dwellBucket').notNull(),
  createdAt: ts('createdAt').notNull(),
}, (table) => [
  index('NoteVisitEvents_userId_createdAtIndex').on(table.userId, table.createdAt),
  // For the delete cascade, which filters on noteId alone. RecallEvents is deleted the same
  // way and has no such index; that is a gap, not a precedent.
  index('NoteVisitEvents_noteIdIndex').on(table.noteId),
]);

// ─── SearchEvents (append-only log of searches) ────────────────────────────────
// The third member of the same family as ReadingEvents and NoteVisitEvents, and the one that
// records something the others structurally cannot.
//
// Every existing signal is derived from something the reader *made or read*: a note written, a
// chapter read, a highlight left, a note returned to. A search is the only record of something
// they wanted and did not find — a stated intent with no artifact behind it. A question asked
// four times across three weeks that never produced a note is the clearest gap the app can see,
// and until now it left no trace at all.
//
// Two actions, no UPDATE, for the same reason the siblings are append-only: "asked repeatedly
// and never opened anything" is a grouped read over rows, not a mutable counter that has to be
// kept correct. `openedResult` is a second row rather than a column on the first, so the write
// path never has to go back and find what it wrote.
//
// The query text is the sensitive part of this table and is treated as such: normalized on the
// way in, aged out on read, deleted for real on clear-data and delete-account (SearchEvents has
// no noteId, so the note cascade cannot reach it), and never sent to analytics — see
// `trackSearchPerformed`, which deliberately reports query *length* only.

export const SearchEvents = pgTable('SearchEvents', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  /** Trimmed, whitespace-collapsed, lowercased — so repeats group without a second pass. */
  query: text('query').notNull(),
  /** query | resultOpen — see src/utils/search-event-kinds.ts. */
  action: text('action').notNull(),
  /** What the surface actually showed. 0 is the interesting value. */
  resultCount: integer('resultCount').notNull(),
  /** library | spotlight — which field it was typed into. */
  surface: text('surface').notNull(),
  createdAt: ts('createdAt').notNull(),
}, (table) => [
  index('SearchEvents_userId_createdAtIndex').on(table.userId, table.createdAt),
  index('SearchEvents_userId_queryIndex').on(table.userId, table.query),
]);

// ─── ReviewItems (Plus: a scheduled return to your own study) ─────────────────
// The sixth member of the memory-layer family above, and the first one the reader puts
// something *into* deliberately. NoteFingerprints, RecallEvents, ReadingEvents,
// NoteVisitEvents and SearchEvents all record what happened; this records what the reader
// asked to come back to, which is why it is a mutable row rather than an append-only log.
//
// The schedule is stored, not derived. `intervalDays` and `dueAt` are written by
// `nextReviewAfter` (src/utils/review-scheduling.ts) on every outcome, so the inbox is one
// indexed read rather than a scan-and-score over history — and so the reader can be told
// exactly when something is coming back. That is the whole point of a transparent schedule:
// a number that only exists inside a ranking function cannot be shown to anyone.
//
// `sourceKey` carries the uniqueness the columns cannot. A review of a note, of a highlight,
// of a connection between two notes and of a Thread are four different rows with four
// different id columns; one text key over `(userId, sourceKey)` stops the same thing being
// added twice without four partial indexes.

export const ReviewItems = pgTable('ReviewItems', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  /** note | highlight | connection | thread | verse — see src/utils/review-item-kinds.ts. */
  kind: text('kind').notNull(),
  /** `${kind}:${id}[:${secondaryId}]` — the dedupe key across all five shapes. */
  sourceKey: text('sourceKey').notNull(),
  /** The note under review; for `connection` the from-note, for `thread` the cluster rep. */
  noteId: text('noteId'),
  /** `connection` only — the to-note. */
  secondaryNoteId: text('secondaryNoteId'),
  /** `highlight` only — the StudyThreadEntries row. */
  studyThreadEntryId: text('studyThreadEntryId'),
  /** `highlight` | `verse` — normalized reference, e.g. "John 15:5". */
  scriptureReference: text('scriptureReference'),
  translation: text('translation'),
  /** active | paused | archived. Paused is the reader's "not this season". */
  status: text('status').notNull().default('active'),
  /** new | fragile | forming | durable — derived by deriveRecallState, stored for cheap reads. */
  recallState: text('recallState').notNull().default('new'),
  intervalDays: real('intervalDays').notNull().default(1),
  dueAt: ts('dueAt').notNull(),
  lastReviewedAt: ts('lastReviewedAt'),
  /** recalled | almost | revealed — the last answer, which decides the next interval. */
  lastOutcome: text('lastOutcome'),
  /** Consecutive `recalled` answers. Resets to 0 on almost/revealed. */
  successStreak: integer('successStreak').notNull().default(0),
  reviewCount: integer('reviewCount').notNull().default(0),
  /** Verse ladder position 0..4 (recognize → rebuild → recall → contextualize → connect). */
  ladderStep: integer('ladderStep').notNull().default(0),
  /** user | seed | challenge | engine — where the row came from, so the queue stays legible. */
  origin: text('origin').notNull().default('user'),
  /**
   * Why this is here, in the reader's words: "Highlighted while reading John 15".
   *
   * Copied from the UserNodeStates row at the moment the engine adds the item, not read
   * live, so a row's stated reason never changes under someone mid-sitting. Null on items
   * the reader added themselves — they know why it is there.
   */
  sourceLabel: text('sourceLabel'),
  /** When that source signal happened. Orders the queue by what is actually recent. */
  sourceAt: ts('sourceAt'),
  /** Set when a challenge created this item, so completing the challenge can advance it. */
  challengeId: text('challengeId'),
  createdAt: ts('createdAt').notNull(),
  updatedAt: ts('updatedAt'),
}, (table) => [
  uniqueIndex('ReviewItems_userId_sourceKeyIndex').on(table.userId, table.sourceKey),
  // The inbox read: due, active, oldest first.
  index('ReviewItems_userId_status_dueAtIndex').on(table.userId, table.status, table.dueAt),
  // The three cascade filters. NoteVisitEvents_noteIdIndex's docblock calls the missing
  // equivalent on RecallEvents a gap rather than a precedent; these are the ones that close it.
  index('ReviewItems_noteIdIndex').on(table.noteId),
  index('ReviewItems_secondaryNoteIdIndex').on(table.secondaryNoteId),
  index('ReviewItems_studyThreadEntryIdIndex').on(table.studyThreadEntryId),
]);

// ─── ReviewEvents (append-only log of what a review session was answered with) ─
// Separate from ReviewItems for the same reason RecallEvents is separate from
// NoteFingerprints: the item holds the current state, this holds how it got there. A
// reader who wants to know whether their recall is actually improving needs the sequence,
// which a row that only ever holds "last outcome" has already thrown away.
//
// `attempt` is what the reader typed before revealing, and it is the sensitive column here:
// it is their own words about their own study. Never sent to analytics, deleted by the note
// cascade and by clear-data along with everything else keyed to the note.

export const ReviewEvents = pgTable('ReviewEvents', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  reviewItemId: text('reviewItemId').notNull(),
  /** Denormalized so the note cascade can find these rows without joining ReviewItems. */
  noteId: text('noteId'),
  /** shown | recalled | almost | revealed | deferred | paused | resumed | archived. */
  action: text('action').notNull(),
  /** What the reader wrote before revealing, when they wrote anything. */
  attempt: text('attempt'),
  previousIntervalDays: real('previousIntervalDays'),
  nextIntervalDays: real('nextIntervalDays'),
  createdAt: ts('createdAt').notNull(),
}, (table) => [
  index('ReviewEvents_userId_createdAtIndex').on(table.userId, table.createdAt),
  index('ReviewEvents_reviewItemId_createdAtIndex').on(table.reviewItemId, table.createdAt),
  index('ReviewEvents_noteIdIndex').on(table.noteId),
]);

// ─── UserNodeStates (the reader's own Study Bible layer) ──────────────────────
// The personal counterpart to the curated scripture knowledge layer. That layer is the
// terrain — topics, cross-references, people, places, all of it shared and none of it
// keyed to a person. This table is one reader's path across it: which verses they have
// marked, which notes they keep coming back to, which themes their study actually runs
// through, and when each of those last happened.
//
// One row per (user, node). A node is anything study can be *about*, addressed by a
// `nodeKey` of the form `${kind}:${id}` — see src/utils/study-bible-nodes.ts, which owns
// every key shape and is the only place allowed to build them.
//
// Why persisted rather than derived on read: the Home arcs already tried the derived
// version and gave up in public. Every one of them bails with `if (hasMoreNotes) return
// undefined`, because counting honestly needs the whole note set in the browser and a
// paginated reader never has it. Counts that accumulate as activity happens do not have
// that problem, and they are also the only way "you keep returning to this" can mean
// anything after the first page.
//
// **Not a second source of truth.** ReviewItems still owns scheduling (dueAt, recallState,
// ladderStep, streak) and NoteFingerprints still owns the passive-resurfacing stability.
// The mirror columns here are written by applyReviewOutcome so the engine and Home can rank
// without joining ReviewItems, and nothing reads them back as authority.
//
// The six counters are deliberately orthogonal — a signal increments exactly one of them —
// so a scorer can weigh "returned to it" differently from "linked it to something", which
// is the whole difference between attention and intent.

export const UserNodeStates = pgTable('UserNodeStates', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  /** note | verse | chapter | theme | person | place | thread | connection. */
  nodeKind: text('nodeKind').notNull(),
  /** `${kind}:${id}` — unique per reader. Built only by src/utils/study-bible-nodes.ts. */
  nodeKey: text('nodeKey').notNull(),
  /** Display text: note title, "John 15:5", topic label, person name, Thread title. */
  label: text('label'),
  /** note / thread rep / connection from-note. Lets the note cascade find rows without parsing keys. */
  noteId: text('noteId'),
  /** `connection` only — the to-note. */
  secondaryNoteId: text('secondaryNoteId'),
  /** Saw it: opened, read, highlighted, cited. */
  exposureCount: integer('exposureCount').notNull().default(0),
  /** Came back to it deliberately, after a dwell long enough to mean something. */
  revisitCount: integer('revisitCount').notNull().default(0),
  /** Linked it to something themselves. The strongest signal a reader gives without typing. */
  explicitConnectionCount: integer('explicitConnectionCount').notNull().default(0),
  /** Wrote more about it: a later save, an annotation on a highlight. */
  expansionCount: integer('expansionCount').notNull().default(0),
  /** Named a Thread, summarized a cluster — said what the whole thing is. */
  synthesisCount: integer('synthesisCount').notNull().default(0),
  /** Answered a review about it. */
  reviewCount: integer('reviewCount').notNull().default(0),
  firstStudiedAt: ts('firstStudiedAt').notNull(),
  lastSeenAt: ts('lastSeenAt').notNull(),
  /** Mirror of the latest ReviewItems outcome for this node. ReviewItems stays canonical. */
  lastReviewedAt: ts('lastReviewedAt'),
  /** Mirror of the item's dueAt, so the engine can skip what is already scheduled. */
  nextReviewAt: ts('nextReviewAt'),
  /** Mirror of the item's recallState; 'new' until a review touches this node. */
  recallState: text('recallState').notNull().default('new'),
  /** exposure | revisit | connection | expansion | synthesis | review — the most recent. */
  lastSignal: text('lastSignal').notNull(),
  /** Reader-facing provenance: "Highlighted while reading John 15". Review rows show this. */
  lastSourceLabel: text('lastSourceLabel'),
  lastSourceAt: ts('lastSourceAt').notNull(),
  /** active | archived. The note cascade archives cross-note nodes it cannot delete outright. */
  status: text('status').notNull().default('active'),
  /** JSON: { translation?, topicId?, slug?, book?, chapter?, verse? }. Small and stable — it is replaced, not merged. */
  meta: text('meta'),
  createdAt: ts('createdAt').notNull(),
  updatedAt: ts('updatedAt').notNull(),
}, (table) => [
  // The upsert target. Every writer goes through touchNodes, which conflicts on this.
  uniqueIndex('UserNodeStates_userId_nodeKeyIndex').on(table.userId, table.nodeKey),
  // The engine's read (kinds it reviews, most recent first) and Home's (themes, people).
  index('UserNodeStates_userId_nodeKind_lastSeenAtIndex').on(table.userId, table.nodeKind, table.lastSeenAt),
  // The cascade filters, for the same reason ReviewItems carries both.
  index('UserNodeStates_noteIdIndex').on(table.noteId),
  index('UserNodeStates_secondaryNoteIdIndex').on(table.secondaryNoteId),
]);

// ─── Challenges (Plus: a bounded path through study you already have) ─────────
// Steps are a JSON column rather than a ChallengeSteps table, and the reason is that they
// are never queried across challenges. A template builds four or five of them at creation,
// they are always read and written as one unit with their parent, and nothing ever asks
// "every link step across all users". That is the same shape as ThreadProgress.openedNoteIds
// and StudyThreadMemberOrders.orderedNoteIds, and it buys a second table, a second index set
// and a second cascade branch for nothing.
//
// A challenge is retired, not deleted, when its source note goes: the notes it produced are
// ordinary notes the reader still owns, and a finished path that quietly vanishes because
// one of its inputs was tidied away reads as data loss. See delete-note-cascade.ts.

export const Challenges = pgTable('Challenges', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  /** strengthen_thread | keep_verse | return_to_question | trace_connection. */
  templateKey: text('templateKey').notNull(),
  /** Resolved at creation from the source's own title, so a renamed Thread keeps its path. */
  title: text('title').notNull(),
  /** active | paused | completed | archived | retired. */
  status: text('status').notNull().default('active'),
  /** `${templateKey}:${id}[:${secondaryId}]` — one active challenge per source. */
  sourceKey: text('sourceKey').notNull(),
  /** Thread rep note, question note, or the from-note of a connection. */
  sourceNoteId: text('sourceNoteId'),
  sourceSecondaryNoteId: text('sourceSecondaryNoteId'),
  sourceEntryId: text('sourceEntryId'),
  scriptureReference: text('scriptureReference'),
  translation: text('translation'),
  /** JSON ChallengeStep[] — shape in src/utils/challenge-templates.ts. */
  steps: text('steps').notNull(),
  currentStepIndex: integer('currentStepIndex').notNull().default(0),
  startedAt: ts('startedAt').notNull(),
  lastStepAt: ts('lastStepAt'),
  completedAt: ts('completedAt'),
  createdAt: ts('createdAt').notNull(),
  updatedAt: ts('updatedAt'),
}, (table) => [
  index('Challenges_userId_statusIndex').on(table.userId, table.status),
  index('Challenges_sourceNoteIdIndex').on(table.sourceNoteId),
  index('Challenges_sourceSecondaryNoteIdIndex').on(table.sourceSecondaryNoteId),
]);

// ─── SupportTickets (user feedback from settings support form) ─────────────────

export const SupportTickets = pgTable('SupportTickets', {
  id: text('id').primaryKey(),
  ticketNumber: integer('ticketNumber').unique(),
  userId: text('userId').notNull(),
  topic: text('topic'),
  message: text('message').notNull(),
  userEmail: text('userEmail'),
  userName: text('userName'),
  appVersion: text('appVersion'),
  pageUrl: text('pageUrl'),
  clientEnvironment: text('clientEnvironment'),
  status: text('status').notNull().default('open'),
  adminNote: text('adminNote'),
  adminReadAt: ts('adminReadAt'),
  repliedAt: ts('repliedAt'),
  notifiedAt: ts('notifiedAt'),
  createdAt: ts('createdAt').notNull(),
  closedAt: ts('closedAt'),
}, (table) => [
  index('SupportTickets_status_createdAtIndex').on(table.status, table.createdAt),
  index('SupportTickets_userId_createdAtIndex').on(table.userId, table.createdAt),
  index('SupportTickets_status_adminReadAtIndex').on(table.status, table.adminReadAt),
]);

// ─── SupportTicketNotes (running list of admin triage notes per ticket) ────────

export const SupportTicketNotes = pgTable('SupportTicketNotes', {
  id: text('id').primaryKey(),
  ticketId: text('ticketId').notNull(),
  note: text('note').notNull(),
  createdAt: ts('createdAt').notNull(),
}, (table) => [
  index('SupportTicketNotes_ticketId_createdAtIndex').on(table.ticketId, table.createdAt),
]);

// ─── DiagnosticEvents (anonymous client/server issue signals — no userId) ───────
// See docs/DIAGNOSTICS_ANONYMOUS.md

export const DiagnosticEvents = pgTable('DiagnosticEvents', {
  id: text('id').primaryKey(),
  issueSignature: text('issueSignature').notNull(),
  source: text('source').notNull(),
  severity: text('severity').notNull(),
  message: text('message').notNull(),
  stack: text('stack'),
  route: text('route'),
  platform: text('platform').notNull(),
  appVersion: text('appVersion'),
  anonymousSessionId: text('anonymousSessionId').notNull(),
  manualNote: text('manualNote'),
  metadata: text('metadata'),
  sourceEnv: text('sourceEnv'),
  createdAt: ts('createdAt').notNull(),
}, (table) => [
  index('DiagnosticEvents_issueSignature_createdAtIndex').on(table.issueSignature, table.createdAt),
  index('DiagnosticEvents_createdAtIndex').on(table.createdAt),
  index('DiagnosticEvents_anonymousSessionId_createdAtIndex').on(table.anonymousSessionId, table.createdAt),
]);

export const DiagnosticIssueTriage = pgTable('DiagnosticIssueTriage', {
  issueSignature: text('issueSignature').primaryKey(),
  status: text('status').notNull().default('open'),
  adminNotes: text('adminNotes'),
  updatedAt: ts('updatedAt').notNull(),
});

// ─── NoteConnections (many-to-many note connection graph) ──────────────────────
// Replaces the single-parent linkedFromNoteId tree with a proper join table.
// fromNoteId = "context/source" note; toNoteId = "connected" note.
// Both directions are traversed when building the study thread graph.

export const NoteConnections = pgTable('NoteConnections', {
  id: text('id').primaryKey(),
  fromNoteId: text('fromNoteId').notNull(),
  toNoteId: text('toNoteId').notNull(),
  userId: text('userId').notNull(),
  spaceId: text('spaceId'),
  createdAt: ts('createdAt').notNull(),
}, (table) => [
  uniqueIndex('NoteConnections_uniquePair').on(table.fromNoteId, table.toNoteId),
  index('NoteConnections_fromNoteIdIndex').on(table.fromNoteId),
  index('NoteConnections_toNoteIdIndex').on(table.toNoteId),
  index('NoteConnections_userIdIndex').on(table.userId),
]);

/** User-defined note order within a study-thread cluster (keyed by rep note id). */
export const StudyThreadMemberOrders = pgTable(
  'StudyThreadMemberOrders',
  {
    repNoteId: text('repNoteId').primaryKey(),
    userId: text('userId').notNull(),
    /** JSON string[] of note ids in display order. */
    orderedNoteIds: text('orderedNoteIds').notNull(),
    updatedAt: ts('updatedAt').notNull(),
  },
  (table) => [index('StudyThreadMemberOrders_userIdIndex').on(table.userId)],
);

// ─── VerseTextCache (verse text cache, keyed by normalized reference + translation) ─

export const VerseTextCache = pgTable('VerseTextCache', {
  reference: text('reference').notNull(),
  translation: text('translation').notNull().default('NET'),
  content: text('content').notNull(),
  createdAt: ts('createdAt').notNull(),
}, (table) => [
  primaryKey({ columns: [table.reference, table.translation] }),
]);

// ─── BibleTranslations (registry of supported Bible translations) ─────────────

export const BibleTranslations = pgTable('BibleTranslations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  abbreviation: text('abbreviation').notNull(),
  publisher: text('publisher').notNull(),
  copyrightNotice: text('copyrightNotice').notNull(),
  websiteUrl: text('websiteUrl'),
  isPublicDomain: boolean('isPublicDomain').notNull().default(false),
  sortOrder: integer('sortOrder').notNull().default(0),
  createdAt: ts('createdAt').notNull(),
});

// ─── BibleVerses (self-hosted verse text, keyed by translation + book + chapter + verse) ─

export const BibleVerses = pgTable('BibleVerses', {
  id: text('id').primaryKey(),
  translationId: text('translationId').notNull(),
  book: text('book').notNull(),
  chapter: integer('chapter').notNull(),
  verse: integer('verse').notNull(),
  text: text('text').notNull(),
}, (table) => [
  uniqueIndex('BibleVerses_unique_verse').on(table.translationId, table.book, table.chapter, table.verse),
  index('BibleVerses_lookup').on(table.translationId, table.book, table.chapter),
]);

// ─── Scripture Knowledge Layer (shared canonical reference data) ─────────────────
// Authored once from open datasets (TSK cross-references; OpenBible.info topics / people /
// places to follow) and shipped to every user. No `userId` — identical for all users, like
// BibleVerses. The join key into user data is (book, chapter, verse) against
// ScriptureMetadata. See docs/future/SCRIPTURE_KNOWLEDGE_LAYER.md.

export const ScriptureCrossReferences = pgTable('ScriptureCrossReferences', {
  id: text('id').primaryKey(),
  fromBook: text('fromBook').notNull(),
  fromChapter: integer('fromChapter').notNull(),
  fromVerse: integer('fromVerse').notNull(),
  toBook: text('toBook').notNull(),
  toChapterStart: integer('toChapterStart').notNull(),
  toChapterEnd: integer('toChapterEnd').notNull(),
  toVerseStart: integer('toVerseStart').notNull(),
  toVerseEnd: integer('toVerseEnd').notNull(),
  votes: integer('votes').notNull().default(0),
  source: text('source').notNull().default('TSK'),
}, (table) => [
  uniqueIndex('ScriptureCrossReferences_unique').on(
    table.fromBook, table.fromChapter, table.fromVerse,
    table.toBook, table.toChapterStart, table.toVerseStart,
  ),
  index('ScriptureCrossReferences_from').on(table.fromBook, table.fromChapter, table.fromVerse),
]);

export const ScriptureTopics = pgTable('ScriptureTopics', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  label: text('label').notNull(),
  category: text('category'),
  source: text('source'),
});

export const ScriptureTopicVerses = pgTable('ScriptureTopicVerses', {
  id: text('id').primaryKey(),
  topicId: text('topicId').notNull(),
  book: text('book').notNull(),
  chapter: integer('chapter').notNull(),
  verse: integer('verse').notNull(),
  relevance: integer('relevance').notNull().default(0),
}, (table) => [
  uniqueIndex('ScriptureTopicVerses_unique').on(table.topicId, table.book, table.chapter, table.verse),
  index('ScriptureTopicVerses_byVerse').on(table.book, table.chapter, table.verse),
  index('ScriptureTopicVerses_byTopic').on(table.topicId),
]);

export const BiblePeople = pgTable('BiblePeople', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  aliases: text('aliases'),
  source: text('source'),
});

export const BiblePlaces = pgTable('BiblePlaces', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  aliases: text('aliases'),
  latitude: real('latitude'),
  longitude: real('longitude'),
  source: text('source'),
});

export const ScriptureEntityRefs = pgTable('ScriptureEntityRefs', {
  id: text('id').primaryKey(),
  entityType: text('entityType').notNull(),
  entityId: text('entityId').notNull(),
  book: text('book').notNull(),
  chapter: integer('chapter').notNull(),
  verse: integer('verse').notNull(),
}, (table) => [
  uniqueIndex('ScriptureEntityRefs_unique').on(table.entityType, table.entityId, table.book, table.chapter, table.verse),
  index('ScriptureEntityRefs_byVerse').on(table.book, table.chapter, table.verse),
  index('ScriptureEntityRefs_byEntity').on(table.entityType, table.entityId),
]);

export const TopicRelations = pgTable('TopicRelations', {
  id: text('id').primaryKey(),
  fromTopicId: text('fromTopicId').notNull(),
  toTopicId: text('toTopicId').notNull(),
  kind: text('kind').notNull().default('related'),
}, (table) => [
  uniqueIndex('TopicRelations_unique').on(table.fromTopicId, table.toTopicId, table.kind),
]);

// ─── ResourceMetadata ──────────────────────────────────────────────────────────

export const ResourceMetadata = pgTable('ResourceMetadata', {
  id: text('id').primaryKey(),
  noteId: text('noteId').notNull(),
  sourceUrl: text('sourceUrl').notNull(),
  sourceDomain: text('sourceDomain'),
  sourceName: text('sourceName'),
  sourceTitle: text('sourceTitle'),
  sourceDescription: text('sourceDescription'),
  sourceImage: text('sourceImage'),
  createdAt: ts('createdAt').notNull(),
});

// ─── Resource Library ──────────────────────────────────────────────────────────

/**
 * A catalog of study resources belonging to one owner.
 *
 * `ownerKind` is the only thing that separates a personal library from a
 * church's — same table, same items, same surfaces; only the permission check
 * differs (see docs/future/RESOURCE_LIBRARY.md). Rows are created lazily on the
 * owner's first item, so accounts that never touch the feature carry none.
 *
 * NOTE: unrelated to `ResourceMetadata` above, which is the *bookmark note*
 * (`Notes.noteType = 'resource'`). That naming is load-bearing and stays; the
 * library product uses Library / LibraryItem vocabulary throughout.
 */
export const ResourceLibraries = pgTable(
  'ResourceLibraries',
  {
    id: text('id').primaryKey(),
    /**
     * 'user' | 'church' | 'space' — 'school' later.
     *
     * 'space' is a room that owns its shelf outright, which is every Shared
     * Space with no church behind it. A church room deliberately does not get
     * one: its shelf is the church's items scoped to it, so "where does this
     * item live" keeps exactly one answer per room.
     */
    ownerKind: text('ownerKind').notNull(),
    /**
     * Clerk userId when ownerKind='user'; Churches.id when 'church';
     * Spaces.id when 'space'.
     */
    ownerId: text('ownerId').notNull(),
    title: text('title').notNull(),
    createdAt: ts('createdAt').notNull(),
    updatedAt: ts('updatedAt'),
  },
  (table) => [
    // One library per owner. Also the race guard for lazy creation: concurrent
    // first-saves collide here, and the loser re-reads instead of forking a
    // second library.
    uniqueIndex('ResourceLibraries_owner_unique').on(table.ownerKind, table.ownerId),
  ],
);

/**
 * One entry in a library. `kind='link'` and `kind='file'` are written today —
 * links by `/api/library/items/create`, files by `/api/library/items/upload`.
 * note_ref, thread_ref, template_ref, and pack are phased
 * (RESOURCE_LIBRARY.md §6).
 */
export const LibraryItems = pgTable(
  'LibraryItems',
  {
    id: text('id').primaryKey(),
    libraryId: text('libraryId').notNull(),
    /** 'link' | 'file' | 'note_ref' | 'thread_ref' | 'template_ref' | 'pack'. */
    kind: text('kind').notNull().default('link'),
    title: text('title').notNull(),
    description: text('description'),
    /** kind='link': the destination. Normalized by validateResourceUrl on write. */
    sourceUrl: text('sourceUrl'),
    sourceDomain: text('sourceDomain'),
    sourceSiteName: text('sourceSiteName'),
    sourceImage: text('sourceImage'),
    /**
     * kind='file': Supabase storage object in the private `library-files`
     * bucket (NOT the public note-attachments bucket — RESOURCE_LIBRARY.md §8).
     * Opened via short-lived signed URLs, never a public link.
     */
    fileStorageKey: text('fileStorageKey'),
    fileName: text('fileName'),
    fileMime: text('fileMime'),
    fileBytes: integer('fileBytes'),
    /**
     * 'leaders' | 'members' — dormant until church libraries land. Written with
     * the default from day one so the church lane needs no backfill on a table
     * that already holds user data.
     */
    access: text('access').notNull().default('members'),
    createdByUserId: text('createdByUserId').notNull(),
    createdAt: ts('createdAt').notNull(),
    updatedAt: ts('updatedAt'),
    /** Soft archive — items stay resolvable for pills that already cite them. */
    archivedAt: ts('archivedAt'),
  },
  (table) => [
    index('LibraryItems_libraryId_archivedAtIndex').on(table.libraryId, table.archivedAt),
    index('LibraryItems_libraryId_updatedAtIndex').on(table.libraryId, table.updatedAt),
  ],
);

// ─── Church library scoping (RESOURCE_LIBRARY.md v0.1) ────────────────────────

/**
 * Who an item is for, inside a church.
 *
 * Rows rather than a column on `LibraryItems`, because one item is legitimately
 * in several places at once — a commentary that belongs to the whole church
 * *and* is surfaced in Youth. A column would have forced a copy per placement,
 * and a copied item is two things to archive, two things to re-title, and two
 * answers to "is this still current".
 *
 * `scopeKind`:
 *   - `'org'`      — the whole church. `spaceId` and `ministryKey` null.
 *   - `'space'`    — one Shared Space or channel. `spaceId` set.
 *   - `'ministry'` — reserved. The column exists so the table never needs a
 *     migration, but **the write routes refuse it**: there is no ministry
 *     entity or key vocabulary anywhere in the app yet, so a free-text
 *     `ministryKey` written today would be data no read path could group by.
 *
 * Row ids: `libsc_${crypto.randomUUID()}`.
 */
export const LibraryItemScopes = pgTable(
  'LibraryItemScopes',
  {
    id: text('id').primaryKey(),
    libraryItemId: text('libraryItemId').notNull(),
    scopeKind: text('scopeKind').notNull(),
    spaceId: text('spaceId'),
    ministryKey: text('ministryKey'),
    createdAt: ts('createdAt').notNull(),
  },
  (table) => [
    /*
      One partial unique per kind. A single index over all three columns would
      not work: NULLs are distinct in a plain unique, so an item could be scoped
      to the whole org twice. Same shape as ChurchSeries' per-scope uniques.
    */
    uniqueIndex('LibraryItemScopes_org_unique')
      .on(table.libraryItemId)
      .where(sql`${table.scopeKind} = 'org'`),
    uniqueIndex('LibraryItemScopes_space_unique')
      .on(table.libraryItemId, table.spaceId)
      .where(sql`${table.scopeKind} = 'space'`),
    uniqueIndex('LibraryItemScopes_ministry_unique')
      .on(table.libraryItemId, table.ministryKey)
      .where(sql`${table.scopeKind} = 'ministry'`),
    index('LibraryItemScopes_libraryItemIdIndex').on(table.libraryItemId),
    index('LibraryItemScopes_spaceIdIndex').on(table.spaceId),
  ],
);

/**
 * What a space surfaces, and in what order.
 *
 * `pinned = false` is not a deleted row and must not be cleaned up as one: it
 * is a leader saying "not this one, not here", which has to outrank an
 * org-wide default *without* editing the org's item — a space leader cannot be
 * allowed to change what the rest of the church sees.
 *
 * Row ids: `libp_${crypto.randomUUID()}`.
 */
export const LibraryItemSpacePins = pgTable(
  'LibraryItemSpacePins',
  {
    id: text('id').primaryKey(),
    spaceId: text('spaceId').notNull(),
    libraryItemId: text('libraryItemId').notNull(),
    pinned: boolean('pinned').notNull().default(true),
    sortOrder: integer('sortOrder').notNull().default(0),
    pinnedByUserId: text('pinnedByUserId').notNull(),
    pinnedAt: ts('pinnedAt').notNull(),
  },
  (table) => [
    uniqueIndex('LibraryItemSpacePins_space_item_unique').on(table.spaceId, table.libraryItemId),
    index('LibraryItemSpacePins_spaceIdIndex').on(table.spaceId),
  ],
);

/**
 * A congregant proposing a resource for their church's library.
 *
 * Shaped after `SupportTickets` — submit, queue, triage — because that is the
 * one review flow this codebase already has, and its shape was earned.
 *
 * **`suggestedByUserId` is a deliberate exception to "review is never shared".**
 * That rule protects *observed* behaviour: what someone read, wrote, or studied.
 * A suggestion is the opposite — an affirmative submission addressed to the
 * church, which a reviewer cannot act on or reply to anonymously. The exception
 * is confined here: no other church-facing table names a congregant, and the
 * attribution is serialized only into the `manage_library`-gated review queue.
 *
 * Links only in v0.1. A congregant file upload is an abuse surface with no
 * reviewer story attached to it.
 *
 * Row ids: `libsg_${crypto.randomUUID()}`.
 */
export const LibraryItemSuggestions = pgTable(
  'LibraryItemSuggestions',
  {
    id: text('id').primaryKey(),
    churchId: text('churchId').notNull(),
    suggestedByUserId: text('suggestedByUserId').notNull(),
    url: text('url').notNull(),
    title: text('title'),
    /** The congregant's "why" — what a reviewer reads before deciding. */
    note: text('note'),
    /** 'open' | 'approved' | 'declined'. */
    status: text('status').notNull().default('open'),
    reviewedByUserId: text('reviewedByUserId'),
    reviewedAt: ts('reviewedAt'),
    /** Set on approval — the LibraryItems row this became. */
    createdItemId: text('createdItemId'),
    /** Drives the unread badge, the way SupportTickets.adminReadAt does. */
    staffReadAt: ts('staffReadAt'),
    createdAt: ts('createdAt').notNull(),
  },
  (table) => [
    index('LibraryItemSuggestions_church_status_createdAtIndex').on(
      table.churchId,
      table.status,
      table.createdAt,
    ),
    index('LibraryItemSuggestions_suggestedBy_createdAtIndex').on(
      table.suggestedByUserId,
      table.createdAt,
    ),
  ],
);

/**
 * Which library items a planned sermon or entry draws on.
 *
 * A join table, not a column, and deliberately so:
 * `docs/future/CHURCH_STUDY_MATERIAL_LINKING.md` is the post-mortem of the
 * single pointer (`ChurchServices.channelSpaceId`) that was built and removed,
 * and it says in as many words not to add a cheaper one.
 *
 * This is **staff-side prep** — "the resources I am pulling from this week" —
 * and is distinct from that doc's congregant-facing inversion, where published
 * material claims the service it accompanies. That remains unbuilt; when it
 * lands it attaches published items, not catalog entries, and gets its own row.
 *
 * Row ids: `svcli_${crypto.randomUUID()}`.
 */
/**
 * Published study material claiming the plan row it accompanies.
 *
 * This is the inversion `docs/future/CHURCH_STUDY_MATERIAL_LINKING.md` decided
 * on and `ChurchServiceLibraryItems` explicitly deferred to: **material claims
 * the service; the service does not point at a room.**
 *
 * **Two writers, and they must stay off each other's rows.** The series →
 * study-plan publish writes one row per published step, and
 * `publishedWeekIdsInThread` reads exactly those to decide which weeks a
 * republish skips. The attach control (`church-published-material.ts`) writes
 * the same table for material staff attach by hand, and therefore refuses any
 * note that is already a published step — a replace-set over one would delete a
 * claim it does not own and let the next republish duplicate that step.
 *
 * It is NOT `Notes.startedFromServiceId`. That column is the *congregant's own*
 * note started from a service, and its read path is scoped to a single user by
 * a rule stated twice in church-teaching-plan.ts — "never widen it to other
 * users". A published step is the opposite: church-authored, addressed to
 * everyone in the room. Same lineage shape, different fact, so a different row
 * rather than an overloaded column that no read path could then tell apart.
 *
 * Unique on `(serviceId, noteId)` rather than on `serviceId` alone, because the
 * doc's whole argument against the removed pointer was that one service can
 * legitimately carry several ministries' material. "One step per plan row per
 * Thread" is narrower than this table and is enforced where it belongs — in the
 * publish query, which asks what this Thread already holds.
 *
 * Row ids: `svcpub_${crypto.randomUUID()}`.
 */
export const ChurchServicePublishedNotes = pgTable(
  'ChurchServicePublishedNotes',
  {
    id: text('id').primaryKey(),
    serviceId: text('serviceId').notNull(),
    noteId: text('noteId').notNull(),
    publishedByUserId: text('publishedByUserId').notNull(),
    createdAt: ts('createdAt').notNull(),
  },
  (table) => [
    uniqueIndex('ChurchServicePublishedNotes_service_note_unique').on(
      table.serviceId,
      table.noteId,
    ),
    index('ChurchServicePublishedNotes_serviceIdIndex').on(table.serviceId),
    /* "Which week is this note the study for?" — the congregant-facing read the
       linking doc asks for, indexed now rather than after someone table-scans. */
    index('ChurchServicePublishedNotes_noteIdIndex').on(table.noteId),
  ],
);

/**
 * The same claim as `ChurchServicePublishedNotes`, one grain up: material that
 * accompanies a whole **series** rather than a single week.
 *
 * `CHURCH_STUDY_MATERIAL_LINKING.md` asks for "grain: both" — this week's
 * discussion guide attaches to the service, the eight-week study attaches to the
 * run. The pastor planning eight weeks of Romans attaches once, which was the
 * third of that doc's four complaints about the pointer it replaced.
 *
 * **Why a second table rather than a nullable `seriesId` on the first.** That
 * table's uniqueness is `(serviceId, noteId)`, and in Postgres NULLs compare
 * distinct — so making `serviceId` nullable would let the same note claim the
 * same series without limit, silently, and the constraint that stops it today
 * would go on reading as though it still held. Two tables keep both grains
 * constrained. `ChurchServiceLibraryItems` sits beside its own sibling for the
 * same reason.
 *
 * **Scope rides the series row, not this one.** `ChurchSeries` is already
 * plan-scoped (`churchId` + nullable `spaceId`), so a church-plan series and a
 * space-plan series are different rows and an attachment inherits whichever it
 * points at. Copying a scope column down here would be a second source of truth
 * for the same fact.
 *
 * Row ids: `serpub_${crypto.randomUUID()}`.
 */
export const ChurchSeriesPublishedNotes = pgTable(
  'ChurchSeriesPublishedNotes',
  {
    id: text('id').primaryKey(),
    seriesId: text('seriesId').notNull(),
    noteId: text('noteId').notNull(),
    publishedByUserId: text('publishedByUserId').notNull(),
    createdAt: ts('createdAt').notNull(),
  },
  (table) => [
    uniqueIndex('ChurchSeriesPublishedNotes_series_note_unique').on(
      table.seriesId,
      table.noteId,
    ),
    index('ChurchSeriesPublishedNotes_seriesIdIndex').on(table.seriesId),
    /* The reverse read — "what is this note attached to?" — which the attach
       control needs to render its own current state. */
    index('ChurchSeriesPublishedNotes_noteIdIndex').on(table.noteId),
  ],
);

export const ChurchServiceLibraryItems = pgTable(
  'ChurchServiceLibraryItems',
  {
    id: text('id').primaryKey(),
    serviceId: text('serviceId').notNull(),
    libraryItemId: text('libraryItemId').notNull(),
    attachedByUserId: text('attachedByUserId').notNull(),
    sortOrder: integer('sortOrder').notNull().default(0),
    createdAt: ts('createdAt').notNull(),
  },
  (table) => [
    uniqueIndex('ChurchServiceLibraryItems_service_item_unique').on(
      table.serviceId,
      table.libraryItemId,
    ),
    index('ChurchServiceLibraryItems_serviceIdIndex').on(table.serviceId),
    /* The reverse question — "which weeks used this?" — indexed now rather
       than after someone writes it as a table scan. */
    index('ChurchServiceLibraryItems_libraryItemIdIndex').on(table.libraryItemId),
  ],
);

/**
 * A ministry's two rooms, paired: the Shared Space where a group meets and the
 * ministry channel it broadcasts through.
 *
 * Read `CHURCH_STUDY_MATERIAL_LINKING.md` before touching this. The pointer that
 * doc buries — `ChurchServices.channelSpaceId` — failed for four reasons, and
 * this row is a different relationship on every one of them: it is **room to
 * room** rather than service-to-room, so it never promises material *about* a
 * sermon and delivers a container instead; it sits at the grain the
 * relationship actually changes at (a ministry gets a channel once, not once
 * per week); and church staff author it, which is right because room topology
 * is theirs. That doc's inversion — material claiming a service — is a
 * different question and stays unaffected.
 *
 * **The row is not the relation.** Both halves are re-verified on every read
 * (`resolveCompanionChannel`): still present, still active, still the same org,
 * still the right `Spaces.type`. Deleting either room silently un-pairs them
 * rather than leaving a tombstone to surface, which is the read-side semantics
 * `channelSpaceId` never defined and the reason it could dangle.
 *
 * Unique on `spaceId`: a room broadcasts through one channel or none. A channel
 * may be the companion of only one space for the same reason, enforced on the
 * write path rather than by a second index, since "which space is this channel
 * for" is a question with one answer only while the pairing exists.
 *
 * Row ids: `scl_${crypto.randomUUID()}`.
 */
export const ChurchSpaceChannelLinks = pgTable(
  'ChurchSpaceChannelLinks',
  {
    id: text('id').primaryKey(),
    orgId: text('orgId').notNull(),
    /** The Shared Space (`Spaces.type='shared'`) that meets. */
    spaceId: text('spaceId').notNull(),
    /** The ministry channel (`Spaces.type='public'`) it broadcasts through. */
    channelSpaceId: text('channelSpaceId').notNull(),
    createdByUserId: text('createdByUserId').notNull(),
    createdAt: ts('createdAt').notNull(),
  },
  (table) => [
    uniqueIndex('ChurchSpaceChannelLinks_space_unique').on(table.spaceId),
    index('ChurchSpaceChannelLinks_channelSpaceIdIndex').on(table.channelSpaceId),
    index('ChurchSpaceChannelLinks_orgIdIndex').on(table.orgId),
  ],
);

// ─── InboxItems ────────────────────────────────────────────────────────────────

export const InboxItems = pgTable('InboxItems', {
  id: text('id').primaryKey(),
  webflowItemId: text('webflowItemId').notNull().unique(),
  contentType: text('contentType').notNull(),
  title: text('title').notNull(),
  subtitle: text('subtitle'),
  content: text('content'),
  imageUrl: text('imageUrl'),
  color: text('color'),
  threadType: text('threadType'),
  targetAudience: text('targetAudience').notNull(),
  isActive: boolean('isActive').notNull().default(true),
  createdAt: ts('createdAt').notNull(),
  updatedAt: ts('updatedAt'),
});

// ─── InboxItemNotes ────────────────────────────────────────────────────────────

export const InboxItemNotes = pgTable('InboxItemNotes', {
  id: text('id').primaryKey(),
  inboxItemId: text('inboxItemId').notNull(),
  title: text('title'),
  content: text('content').notNull(),
  order: integer('order').notNull().default(0),
  createdAt: ts('createdAt').notNull(),
});

// ─── UserInboxItems ────────────────────────────────────────────────────────────

export const UserInboxItems = pgTable('UserInboxItems', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  inboxItemId: text('inboxItemId').notNull(),
  status: text('status').notNull(),
  addedAt: ts('addedAt'),
  archivedAt: ts('archivedAt'),
  createdAt: ts('createdAt').notNull(),
});

// ─── FeaturedItems (generic featured notifications) ─────────────────────────────

export const FeaturedItems = pgTable(
  'FeaturedItems',
  {
    id: text('id').primaryKey(),
    contentType: text('contentType').notNull(), // 'space' | 'thread' | 'recall' | 'challenge' | 'church' | 'votd'
    title: text('title').notNull(),
    description: text('description'),
    refId: text('refId'),
    shareToken: text('shareToken'),
    color: text('color'),
    isActive: boolean('isActive').notNull().default(true),
    startsAt: ts('startsAt'),
    endsAt: ts('endsAt'),
    metadata: text('metadata'), // JSON string for type-specific data (e.g. VOTD: { reference, translation, verseText, book, chapter, verse, verseEnd })
    createdAt: ts('createdAt').notNull(),
    updatedAt: ts('updatedAt'),
  },
  (table) => [
    index('FeaturedItems_isActiveIndex').on(table.isActive),
    index('FeaturedItems_createdAtIndex').on(table.createdAt),
  ],
);

// ─── VotdSchedule (curated verse pool for Verse of the Day) ─────────────────────

export const VotdSchedule = pgTable(
  'VotdSchedule',
  {
    id: text('id').primaryKey(),
    reference: text('reference').notNull(), // e.g. "Romans 8:28"
    translation: text('translation').notNull().default('NET'),
    verseText: text('verseText'), // pre-fetched verse text HTML
    book: text('book'),
    chapter: integer('chapter'),
    verse: integer('verse'),
    verseEnd: integer('verseEnd'),
    scheduledDate: text('scheduledDate'), // ISO date string 'YYYY-MM-DD', null = unscheduled pool entry
    isPublished: boolean('isPublished').notNull().default(false),
    featuredItemId: text('featuredItemId'), // set once published to FeaturedItems
    createdAt: ts('createdAt').notNull(),
    updatedAt: ts('updatedAt'),
  },
  (table) => [
    index('VotdSchedule_scheduledDateIndex').on(table.scheduledDate),
    index('VotdSchedule_isPublishedIndex').on(table.isPublished),
  ],
);

// ─── VotdPublishHistory (one automated/manual VOTD publish per UTC calendar day) ─

export const VotdPublishHistory = pgTable(
  'VotdPublishHistory',
  {
    id: text('id').primaryKey(),
    reference: text('reference').notNull(),
    translation: text('translation').notNull().default('NET'),
    featuredItemId: text('featuredItemId').notNull(),
    source: text('source').notNull(), // 'calendar' | 'pool' | 'override'
    label: text('label'),
    publishedDate: text('publishedDate').notNull(), // 'YYYY-MM-DD' UTC
    year: integer('year').notNull(),
    createdAt: ts('createdAt').notNull(),
  },
  (table) => [
    uniqueIndex('VotdPublishHistory_publishedDate_unique').on(table.publishedDate),
    index('VotdPublishHistory_year_ref').on(table.year, table.reference),
  ],
);

// ─── UserFeaturedItems (per-user status for featured items) ─────────────────────

export const UserFeaturedItems = pgTable(
  'UserFeaturedItems',
  {
    id: text('id').primaryKey(),
    userId: text('userId').notNull(),
    featuredItemId: text('featuredItemId').notNull(),
    status: text('status').notNull(), // 'active' | 'dismissed' | 'completed'
    dismissedAt: ts('dismissedAt'),
    completedAt: ts('completedAt'),
    createdAt: ts('createdAt').notNull(),
  },
  (table) => [
    index('UserFeaturedItems_userIdIndex').on(table.userId),
    index('UserFeaturedItems_featuredItemIdIndex').on(table.featuredItemId),
    uniqueIndex('UserFeaturedItems_userFeaturedItem_unique').on(table.userId, table.featuredItemId),
  ],
);

// ─── MonthlyAnalytics ──────────────────────────────────────────────────────────

export const MonthlyAnalytics = pgTable('MonthlyAnalytics', {
  id: text('id').primaryKey(),
  month: text('month').notNull(),
  bookName: text('bookName'),
  tagName: text('tagName'),
  category: text('category').notNull(),
  count: integer('count').notNull().default(0),
  createdAt: ts('createdAt').notNull(),
  updatedAt: ts('updatedAt'),
});

// ─── AdminMonthlyReports ───────────────────────────────────────────────────────

export const AdminMonthlyReports = pgTable(
  'AdminMonthlyReports',
  {
    id: text('id').primaryKey(),
    month: text('month').notNull(),
    seasonId: text('seasonId').notNull(),
    generatedAt: ts('generatedAt').notNull(),
    payload: text('payload').notNull(),
  },
  (table) => [uniqueIndex('AdminMonthlyReports_month_unique').on(table.month)],
);

// ─── ImportSessions / ImportSessionItems (multi-request import runs) ───────────

/**
 * One row per import run started from the import surface. The session exists
 * because import is no longer a single request: files are uploaded and parsed
 * one at a time, committed in small batches, then enriched and finalized. Serverless
 * functions are stateless and multi-instance, so the cross-request state that used
 * to live in local variables (parsed rows, the sourceId → new note id map, running
 * counters) has to be durable.
 *
 * Row ids: `impsess_${crypto.randomUUID()}`. Sessions expire after 24h and are
 * reaped opportunistically when the same user starts a new one.
 */
export const ImportSessions = pgTable(
  'ImportSessions',
  {
    id: text('id').primaryKey(),
    userId: text('userId').notNull(),
    /** 'open' | 'done' | 'abandoned'. */
    status: text('status').notNull().default('open'),
    /**
     * Backup-zip `manifest.json` connection pairs, by *portable* note id, as JSON
     * `[{fromNoteId,toNoteId}]`. Remapped to real note ids at finalize. Capped so a
     * hostile manifest can't balloon the row.
     */
    manifestConnections: text('manifestConnections'),
    notesImported: integer('notesImported').notNull().default(0),
    threadsCreated: integer('threadsCreated').notNull().default(0),
    tagsCreated: integer('tagsCreated').notNull().default(0),
    duplicatesSkipped: integer('duplicatesSkipped').notNull().default(0),
    highlightsImported: integer('highlightsImported').notNull().default(0),
    connectionsImported: integer('connectionsImported').notNull().default(0),
    scriptureProcessed: integer('scriptureProcessed').notNull().default(0),
    autoTagsApplied: integer('autoTagsApplied').notNull().default(0),
    createdAt: ts('createdAt').notNull(),
    updatedAt: ts('updatedAt'),
    expiresAt: ts('expiresAt').notNull(),
  },
  (table) => [
    index('ImportSessions_userIdIndex').on(table.userId),
    index('ImportSessions_expiresAtIndex').on(table.expiresAt),
  ],
);

/**
 * One row per note that an uploaded file parsed into — a `.csv`, `.enex`, or
 * combined markdown export yields many items for a single file, which is why the
 * client's file rows and these items are not 1:1.
 *
 * `resultNoteId` is set both when an item commits and when it matches an existing
 * note (duplicate). That is what lets finalize rebuild the sourceId → note id map
 * with a single query, so a backup's connection graph still restores across
 * request boundaries.
 *
 * Row ids: `impitem_${crypto.randomUUID()}`.
 */
export const ImportSessionItems = pgTable(
  'ImportSessionItems',
  {
    id: text('id').primaryKey(),
    sessionId: text('sessionId').notNull(),
    userId: text('userId').notNull(),
    /** Client row id, so per-file progress can be attributed back without extra bookkeeping. */
    clientFileId: text('clientFileId'),
    fileName: text('fileName').notNull(),
    folderPath: text('folderPath'),
    sourceType: text('sourceType').notNull(),
    fileSize: integer('fileSize').notNull().default(0),
    ord: integer('ord').notNull().default(0),
    title: text('title').notNull(),
    highlightCount: integer('highlightCount').notNull().default(0),
    tagCount: integer('tagCount').notNull().default(0),
    primaryCollection: text('primaryCollection'),
    /** JSON `ParsedImportRow` minus the fields promoted to columns above. */
    payload: text('payload').notNull(),
    /** Portable `meta.id` from a Harvous backup, when present. */
    sourceId: text('sourceId'),
    /** 'parsed' | 'excluded' | 'committed' | 'duplicate' | 'failed'. */
    status: text('status').notNull().default('parsed'),
    /** Advisory at parse time ('id' | 'content' | null); re-checked authoritatively at commit. */
    duplicateHint: text('duplicateHint'),
    resultNoteId: text('resultNoteId'),
    enrichedAt: ts('enrichedAt'),
    error: text('error'),
    createdAt: ts('createdAt').notNull(),
    updatedAt: ts('updatedAt'),
  },
  (table) => [
    index('ImportSessionItems_sessionIdIndex').on(table.sessionId),
    index('ImportSessionItems_userIdIndex').on(table.userId),
    index('ImportSessionItems_sessionId_statusIndex').on(table.sessionId, table.status),
  ],
);

// ─── AppSyncCursors (durable cron watermarks) ─────────────────────────────────

/**
 * Key/value watermarks for scheduled partner sync jobs (e.g. HMC change feed).
 * Prefer this over Netlify Blobs — the bundled api.cjs function often lacks Blobs context.
 */
export const AppSyncCursors = pgTable('AppSyncCursors', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: ts('updatedAt').notNull(),
});
