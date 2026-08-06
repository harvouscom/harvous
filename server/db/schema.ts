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
     * When this org space gathers — "Youth meets Wednesdays at 6:30".
     *
     * Org spaces only (ministry channel or church Shared Space). The church's
     * own times live in `ChurchServiceTimes`, which is a *list* because a church
     * holds several services on one morning; a space gathers once, so a single
     * day/time is the honest shape rather than a second slot table.
     *
     * Display and defaults only — this seeds the space plan's date picker and
     * labels its card. Nothing here schedules, reminds, or recurs; staff still
     * enter every gathering by hand. See
     * docs/future/CHURCH_SPACE_PLANS_AND_SERVICE_TIMES.md §1.
     */
    /** 0–6, 0 = Sunday — Date.getDay() and the WEEKDAYS array in church-services.ts. */
    meetingDay: integer('meetingDay'),
    /** 'HH:MM' 24h on the church's wall clock; the zone is Churches.timezone. */
    meetingTime: text('meetingTime'),
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
  },
  (table) => [
    index('Notes_userIdIndex').on(table.userId),
    index('Notes_linkedFromNoteIdIndex').on(table.linkedFromNoteId),
    index('Notes_copiedFromNoteIdIndex').on(table.copiedFromNoteId),
    index('Notes_startedFromServiceIdIndex').on(table.startedFromServiceId),
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
    parentNoteId: text('parentNoteId').notNull(),
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
  churchId: text('churchId').notNull(),
  /** NULL = the church plan; set = that space's plan. Immutable after create. */
  spaceId: text('spaceId'),
  title: text('title').notNull(),
  createdBy: text('createdBy').notNull(),
  createdAt: ts('createdAt').notNull(),
  updatedAt: ts('updatedAt'),
}, (table) => [
  /**
   * One series per name per plan, case-insensitively — the whole point is that
   * "Life In the Spirit" cannot become a second series beside "Life in the
   * Spirit". Two partial indexes because `spaceId IS NULL` is a distinct scope
   * and Postgres treats NULLs as distinct in a plain unique index, so the
   * church-plan half would not be constrained at all. Same shape and same
   * reason as `ChurchServices_space_date_unique`.
   */
  uniqueIndex('ChurchSeries_church_title_unique')
    .on(table.churchId, sql`lower(${table.title})`)
    .where(sql`${table.spaceId} IS NULL`),
  uniqueIndex('ChurchSeries_space_title_unique')
    .on(table.spaceId, sql`lower(${table.title})`)
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
  churchId: text('churchId').notNull(),
  /**
   * Which plan this sermon belongs to. NULL = the church's own plan; set = a
   * ministry channel or church Shared Space that carries its own (Youth meets
   * Wednesdays). See the docblock above for the same-church invariant and why
   * this column is allowed where a denormalized `orgId` is not.
   */
  spaceId: text('spaceId'),
  /**
   * Church-local calendar day, 'YYYY-MM-DD'. Deliberately NOT a timestamp: a
   * service is a day on the church's wall calendar, and a TIMESTAMPTZ drifts a
   * Sunday into Saturday for a viewer three zones away. Same choice as
   * VotdPublishHistory.publishedDate.
   */
  serviceDate: text('serviceDate').notNull(),
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
   */
  uniqueIndex('ChurchServices_space_date_unique')
    .on(table.spaceId, table.serviceDate)
    .where(sql`${table.spaceId} IS NOT NULL`),
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
   * Per-user My Home space-switcher order for personal Shared Spaces (hosted + joined).
   * JSON `string[]` of space ids. Not `Spaces.order` — preference only.
   */
  sharedSpaceSwitcherOrder: text('sharedSpaceSwitcherOrder'),
  /** Last applied onboarding markdown pack version (see ONBOARDING_PACK_VERSION). */
  onboardingPackVersionApplied: integer('onboardingPackVersionApplied').notNull().default(0),
  /**
   * Legacy notes-tier label (`free` | `unlimited`) — retired for gating; kept for
   * admin support/usage stats until those surfaces move off it. Paid features
   * live in `Entitlements`.
   */
  tier: text('tier').notNull().default('free'),
  /** Polar customer id for portal sessions and subscription sync. */
  polarCustomerId: text('polarCustomerId'),
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
