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
     * 'public' = reserved for Harvous-hosted broadcast spaces (members follow +
     * copy, only owner/leader author). Org-owned spaces come later via orgId.
     */
    type: text('type').notNull().default('personal'),
    /**
     * Clerk organization id (= Churches.orgId) — church-org ownership/sponsorship.
     * Null = personally owned. When set: Spaces.userId stays the creating staff
     * member (audit anchor), but billing/limits derive from the church (see
     * tier-limits.ts), and type='public' + orgId = a church broadcast space
     * (congregants follow + copy). Null today; no create path sets it yet.
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
    /** Source lineage for an independent copy of another author's note. */
    copiedFromNoteId: text('copiedFromNoteId'),
    copiedFromVersionId: text('copiedFromVersionId'),
    copiedFromAuthorId: text('copiedFromAuthorId'),
    /** Durable attribution if the source account later becomes unavailable. */
    copiedFromAuthorDisplayName: text('copiedFromAuthorDisplayName'),
  },
  (table) => [
    index('Notes_userIdIndex').on(table.userId),
    index('Notes_linkedFromNoteIdIndex').on(table.linkedFromNoteId),
    index('Notes_copiedFromNoteIdIndex').on(table.copiedFromNoteId),
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
 * linkage is UserMetadata.connectedChurchId/connectedOrgId. Curriculum ships
 * via org-owned broadcast spaces (Spaces.orgId = Churches.orgId, type='public'),
 * not the legacy InboxItems pipe. Schema groundwork only — no code writes rows
 * yet. Row ids: `chur_${crypto.randomUUID()}` (smem_/sinv_ convention).
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
  /** Staff user who created the church record (audit anchor); admin roles live in Clerk org roles. */
  createdBy: text('createdBy').notNull(),
  /**
   * Church billing plan slug — free text synced from billing, DB source of
   * truth (draft: 'connect' | 'study' | 'study_plus' | 'network'). Null = no
   * paid plan. Follows the sharedSpacesAddOn add-on pattern (nullable
   * entitlement + UpdatedAt written by webhook/admin/backfill), not the
   * retired tier enum.
   */
  billingPlan: text('billingPlan'),
  billingPlanUpdatedAt: ts('billingPlanUpdatedAt'),
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

// ─── NoteTemplates (personal / space / org-scoped note starters) ───────────────

/**
 * User-created and space/org-provisioned note templates. Built-ins stay in
 * src/data/note-templates.ts (not rows). Scope:
 * - userId only (spaceId/orgId null) = personal template
 * - spaceId set = shared with everyone composing in that space (owner/leader attach)
 * - orgId set = church/org-provisioned (future; always null in v1)
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
    /** Title prefill (titleTemplate equivalent). */
    title: text('title'),
    /** Tiptap HTML, same format as Notes.content. */
    content: text('content').notNull(),
    noteType: text('noteType'),
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
   * Churches.id once the user has linked to a church org (connect flow, future).
   * Denormalized churchName/City/State/Country stay for discovery/matching —
   * do not repurpose them as linkage. Null = not connected. Congregants
   * are linked here only; they are never added to the Clerk org.
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
  /** Last applied onboarding markdown pack version (see ONBOARDING_PACK_VERSION). */
  onboardingPackVersionApplied: integer('onboardingPackVersionApplied').notNull().default(0),
  /**
   * Billing tier — DB source of truth (`free` | `unlimited`). Phase 1 of the
   * Clerk→Stripe migration: tier reads come from here, not the Clerk JWT/Billing
   * API. Written by the Stripe webhook (future) / admin grant / backfill script.
   * See docs/native-prototype/PHASE_0_DATA_MODEL_ADR.md and tier-limits.ts.
   */
  tier: text('tier').notNull().default('free'),
  /**
   * Shared Spaces paid add-on (owner-pays). DB source of truth; the Clerk JWT
   * `shared_spaces` feature is a fallback for freshly-purchased sessions until
   * the billing webhook lands. The retired 'unlimited' tier grants nothing.
   */
  sharedSpacesAddOn: boolean('sharedSpacesAddOn').notNull().default(false),
  sharedSpacesAddOnUpdatedAt: ts('sharedSpacesAddOnUpdatedAt'),
  createdAt: ts('createdAt').notNull(),
  updatedAt: ts('updatedAt'),
}, (table) => [
  // The "all congregants of church X" fan-out (connect notifications, follow
  // backfill into broadcast spaces). Cheap to add now; a lock under load later.
  index('UserMetadata_connectedChurchIdIndex').on(table.connectedChurchId),
  index('UserMetadata_hmcChurchIdIndex').on(table.hmcChurchId),
]);

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
});

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
