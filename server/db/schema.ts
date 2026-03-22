/**
 * Drizzle ORM schema for the Harvous database (Supabase Postgres).
 *
 * Date columns use `timestamp({ withTimezone: true, mode: 'date' })` which
 * returns native JS Date objects. JSON.stringify auto-converts them to ISO strings,
 * so API responses remain identical to the previous SQLite text-based dates.
 */

import { pgTable, text, integer, real, boolean, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';

// Helper for date columns — Postgres TIMESTAMPTZ, returned as JS Date objects
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

// ─── Spaces ────────────────────────────────────────────────────────────────────

export const Spaces = pgTable('Spaces', {
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
  isActive: boolean('isActive').notNull().default(true),
  order: integer('order').notNull().default(0),
  shareToken: text('shareToken'),
  shareTokenCreatedAt: ts('shareTokenCreatedAt'),
});

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
  (table) => [index('Threads_userIdIndex').on(table.userId)],
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
    order: integer('order').notNull().default(0),
    shareToken: text('shareToken'),
    shareTokenCreatedAt: ts('shareTokenCreatedAt'),
    contentEncrypted: boolean('contentEncrypted').notNull().default(false),
  },
  (table) => [index('Notes_userIdIndex').on(table.userId)],
);

// ─── NoteThreads (junction table) ──────────────────────────────────────────────

export const NoteThreads = pgTable('NoteThreads', {
  id: text('id').primaryKey(),
  noteId: text('noteId').notNull(),
  threadId: text('threadId').notNull(),
  createdAt: ts('createdAt').notNull(),
}, (table) => [
  uniqueIndex('NoteThreads_uniqueNoteThread').on(table.noteId, table.threadId),
]);

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
});

// ─── NoteScriptureReferences (junction table) ──────────────────────────────────

export const NoteScriptureReferences = pgTable('NoteScriptureReferences', {
  id: text('id').primaryKey(),
  noteId: text('noteId').notNull(),
  scriptureNoteId: text('scriptureNoteId').notNull(),
  createdAt: ts('createdAt').notNull(),
}, (table) => [
  uniqueIndex('NoteScriptureReferences_uniqueNoteScripture').on(table.noteId, table.scriptureNoteId),
]);

// ─── VerseTextCache (Bible.org verse text cache, keyed by normalized reference) ─

export const VerseTextCache = pgTable('VerseTextCache', {
  reference: text('reference').primaryKey(),
  content: text('content').notNull(),
  createdAt: ts('createdAt').notNull(),
});

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
