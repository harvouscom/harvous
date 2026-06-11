/**
 * Drizzle ORM schema for the Harvous database (Supabase Postgres).
 *
 * Date columns use `timestamp({ withTimezone: true, mode: 'date' })` which
 * returns native JS Date objects. JSON.stringify auto-converts them to ISO strings.
 */

import { pgTable, text, integer, real, boolean, timestamp, uniqueIndex, index, primaryKey } from 'drizzle-orm/pg-core';

// Helper for date columns — Postgres TIMESTAMPTZ, returned as JS Date objects
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

// ─── Spaces ────────────────────────────────────────────────────────────────────

export const Spaces = pgTable(
  'Spaces',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    description: text('description'),
    color: text('color'),
    backgroundGradient: text('backgroundGradient'),
    createdAt: ts('createdAt').notNull(),
    updatedAt: ts('updatedAt'),
    lastVisited: ts('lastVisited'),
    userId: text('userId').notNull(),
    isPublic: boolean('isPublic').notNull().default(false),
    isFeatured: boolean('isFeatured').notNull().default(false),
    isActive: boolean('isActive').notNull().default(true),
    order: integer('order').notNull().default(0),
    shareToken: text('shareToken'),
    shareTokenCreatedAt: ts('shareTokenCreatedAt'),
  },
  (table) => [
    index('Spaces_userIdIndex').on(table.userId),
    index('Spaces_userId_updatedAtIndex').on(table.userId, table.updatedAt),
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
  },
  (table) => [
    index('Notes_userIdIndex').on(table.userId),
    index('Notes_linkedFromNoteIdIndex').on(table.linkedFromNoteId),
    index('Notes_userId_updatedAtIndex').on(table.userId, table.updatedAt),
    index('Notes_spaceIdIndex').on(table.spaceId),
    index('Notes_threadIdIndex').on(table.threadId),
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
  churchName: text('churchName'),
  churchCity: text('churchCity'),
  churchState: text('churchState'),
  churchCountry: text('churchCountry'),
  currentSeason: text('currentSeason'),
  lastMonthlyVisit: ts('lastMonthlyVisit'),
  churchAddedAt: ts('churchAddedAt'),
  referralBonusNotes: integer('referralBonusNotes').notNull().default(0),
  referralCode: text('referralCode').unique(),
  lockPinSalt: text('lockPinSalt'),
  lockPinHash: text('lockPinHash'),
  defaultTranslation: text('defaultTranslation').notNull().default('NET'),
  /** Last applied onboarding markdown pack version (see ONBOARDING_PACK_VERSION). */
  onboardingPackVersionApplied: integer('onboardingPackVersionApplied').notNull().default(0),
  /**
   * Billing tier — DB source of truth (`free` | `unlimited`). Phase 1 of the
   * Clerk→Stripe migration: tier reads come from here, not the Clerk JWT/Billing
   * API. Written by the Stripe webhook (future) / admin grant / backfill script.
   * See docs/native-prototype/PHASE_0_DATA_MODEL_ADR.md and tier-limits.ts.
   */
  tier: text('tier').notNull().default('free'),
  createdAt: ts('createdAt').notNull(),
  updatedAt: ts('updatedAt'),
});

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
