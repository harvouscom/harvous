/**
 * Drizzle ORM schema for the Harvous database (Turso/SQLite).
 *
 * This is a 1:1 translation of the Astro DB schema in db/config.ts.
 * Column names match the actual SQLite column names used by Astro DB.
 *
 * Date columns: Astro DB stores dates as TEXT (ISO 8601 strings, e.g. "2025-09-14T18:36:57.285Z").
 * We use plain `text()` for date columns. Use the helpers in dates.ts to convert to/from JS Date.
 */

import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

// ─── Spaces ────────────────────────────────────────────────────────────────────

export const Spaces = sqliteTable('Spaces', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  color: text('color'),
  backgroundGradient: text('backgroundGradient'),
  createdAt: text('createdAt').notNull(),
  updatedAt: text('updatedAt'),
  lastVisited: text('lastVisited'),
  userId: text('userId').notNull(),
  isPublic: integer('isPublic', { mode: 'boolean' }).notNull().default(false),
  isActive: integer('isActive', { mode: 'boolean' }).notNull().default(true),
  order: integer('order').notNull().default(0),
  shareToken: text('shareToken'),
  shareTokenCreatedAt: text('shareTokenCreatedAt'),
});

// ─── Threads ───────────────────────────────────────────────────────────────────

export const Threads = sqliteTable('Threads', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  subtitle: text('subtitle'),
  spaceId: text('spaceId'),
  createdAt: text('createdAt').notNull(),
  updatedAt: text('updatedAt'),
  lastVisited: text('lastVisited'),
  userId: text('userId').notNull(),
  isPublic: integer('isPublic', { mode: 'boolean' }).notNull().default(false),
  isPinned: integer('isPinned', { mode: 'boolean' }).notNull().default(false),
  color: text('color'),
  order: integer('order').notNull().default(0),
  shareToken: text('shareToken'),
  shareTokenCreatedAt: text('shareTokenCreatedAt'),
});

// ─── Notes ─────────────────────────────────────────────────────────────────────

export const Notes = sqliteTable('Notes', {
  id: text('id').primaryKey(),
  title: text('title'),
  content: text('content').notNull(),
  threadId: text('threadId').notNull(),
  spaceId: text('spaceId'),
  simpleNoteId: integer('simpleNoteId'),
  noteType: text('noteType').notNull().default('default'),
  addedBy: text('addedBy').notNull().default('user'),
  createdAt: text('createdAt').notNull(),
  updatedAt: text('updatedAt'),
  lastVisited: text('lastVisited'),
  userId: text('userId').notNull(),
  isPublic: integer('isPublic', { mode: 'boolean' }).notNull().default(false),
  isFeatured: integer('isFeatured', { mode: 'boolean' }).notNull().default(false),
  order: integer('order').notNull().default(0),
  shareToken: text('shareToken'),
  shareTokenCreatedAt: text('shareTokenCreatedAt'),
  contentEncrypted: integer('contentEncrypted', { mode: 'boolean' }).notNull().default(false),
});

// ─── NoteThreads (junction table) ──────────────────────────────────────────────

export const NoteThreads = sqliteTable('NoteThreads', {
  id: text('id').primaryKey(),
  noteId: text('noteId').notNull(),
  threadId: text('threadId').notNull(),
  createdAt: text('createdAt').notNull(),
}, (table) => [
  uniqueIndex('NoteThreads_uniqueNoteThread').on(table.noteId, table.threadId),
]);

// ─── Comments ──────────────────────────────────────────────────────────────────

export const Comments = sqliteTable('Comments', {
  id: text('id').primaryKey(),
  content: text('content').notNull(),
  noteId: text('noteId').notNull(),
  userId: text('userId').notNull(),
  createdAt: text('createdAt').notNull(),
  updatedAt: text('updatedAt'),
});

// ─── Members ───────────────────────────────────────────────────────────────────

export const Members = sqliteTable('Members', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  spaceId: text('spaceId').notNull(),
  role: text('role').notNull().default('member'),
  createdAt: text('createdAt').notNull(),
  joinedAt: text('joinedAt'),
}, (table) => [
  index('Members_spaceIdIndex').on(table.spaceId),
  index('Members_userIdIndex').on(table.userId),
]);

// ─── SpaceInvitations ──────────────────────────────────────────────────────────

export const SpaceInvitations = sqliteTable('SpaceInvitations', {
  id: text('id').primaryKey(),
  spaceId: text('spaceId').notNull(),
  invitedBy: text('invitedBy').notNull(),
  invitedEmail: text('invitedEmail'),
  invitedUserId: text('invitedUserId'),
  inviteToken: text('inviteToken').notNull().unique(),
  role: text('role').notNull().default('member'),
  status: text('status').notNull(),
  message: text('message'),
  expiresAt: text('expiresAt'),
  createdAt: text('createdAt').notNull(),
  acceptedAt: text('acceptedAt'),
}, (table) => [
  uniqueIndex('SpaceInvitations_tokenIndex').on(table.inviteToken),
  index('SpaceInvitations_spaceStatusIndex').on(table.spaceId, table.status),
  index('SpaceInvitations_emailIndex').on(table.invitedEmail),
]);

// ─── UserMetadata ──────────────────────────────────────────────────────────────

export const UserMetadata = sqliteTable('UserMetadata', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull().unique(),
  highestSimpleNoteId: integer('highestSimpleNoteId').notNull().default(0),
  userColor: text('userColor').notNull().default('paper'),
  firstName: text('firstName'),
  lastName: text('lastName'),
  email: text('email'),
  profileImageUrl: text('profileImageUrl'),
  clerkDataUpdatedAt: text('clerkDataUpdatedAt'),
  churchName: text('churchName'),
  churchCity: text('churchCity'),
  churchState: text('churchState'),
  churchCountry: text('churchCountry'),
  currentSeason: text('currentSeason'),
  lastMonthlyVisit: text('lastMonthlyVisit'),
  churchAddedAt: text('churchAddedAt'),
  referralBonusNotes: integer('referralBonusNotes').notNull().default(0),
  referralCode: text('referralCode').unique(),
  lockPinSalt: text('lockPinSalt'),
  lockPinHash: text('lockPinHash'),
  createdAt: text('createdAt').notNull(),
  updatedAt: text('updatedAt'),
});

// ─── UserXP ────────────────────────────────────────────────────────────────────

export const UserXP = sqliteTable('UserXP', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  activityType: text('activityType').notNull(),
  xpAmount: integer('xpAmount').notNull(),
  relatedId: text('relatedId'),
  season: text('season'),
  createdAt: text('createdAt').notNull(),
  metadata: text('metadata'),
});

// ─── UserSeasonalXP ────────────────────────────────────────────────────────────

export const UserSeasonalXP = sqliteTable('UserSeasonalXP', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  season: text('season').notNull(),
  totalXP: integer('totalXP').notNull().default(0),
  sessionCount: integer('sessionCount').notNull().default(0),
  createdAt: text('createdAt').notNull(),
  updatedAt: text('updatedAt'),
});

// ─── UserLifetimeXP ────────────────────────────────────────────────────────────

export const UserLifetimeXP = sqliteTable('UserLifetimeXP', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull().unique(),
  totalXP: integer('totalXP').notNull().default(0),
  lastUpdated: text('lastUpdated').notNull(),
});

// ─── WeeklyStreaks ─────────────────────────────────────────────────────────────

export const WeeklyStreaks = sqliteTable('WeeklyStreaks', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  weekStart: text('weekStart').notNull(),
  daysWithSessions: integer('daysWithSessions').notNull().default(0),
  xpAwarded: integer('xpAwarded').notNull().default(0),
  createdAt: text('createdAt').notNull(),
  updatedAt: text('updatedAt'),
});

// ─── Tags ──────────────────────────────────────────────────────────────────────

export const Tags = sqliteTable('Tags', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  color: text('color'),
  category: text('category'),
  userId: text('userId').notNull(),
  isSystem: integer('isSystem', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('createdAt').notNull(),
  updatedAt: text('updatedAt'),
});

// ─── NoteTags (junction table) ─────────────────────────────────────────────────

export const NoteTags = sqliteTable('NoteTags', {
  id: text('id').primaryKey(),
  noteId: text('noteId').notNull(),
  tagId: text('tagId').notNull(),
  isAutoGenerated: integer('isAutoGenerated', { mode: 'boolean' }).notNull().default(false),
  confidence: integer('confidence'),
  createdAt: text('createdAt').notNull(),
});

// ─── ScriptureMetadata ─────────────────────────────────────────────────────────

export const ScriptureMetadata = sqliteTable('ScriptureMetadata', {
  id: text('id').primaryKey(),
  noteId: text('noteId').notNull(),
  reference: text('reference').notNull(),
  book: text('book').notNull(),
  chapter: integer('chapter').notNull(),
  verse: integer('verse').notNull(),
  verseEnd: integer('verseEnd'),
  translation: text('translation').notNull(),
  originalText: text('originalText').notNull(),
  createdAt: text('createdAt').notNull(),
});

// ─── NoteScriptureReferences (junction table) ──────────────────────────────────

export const NoteScriptureReferences = sqliteTable('NoteScriptureReferences', {
  id: text('id').primaryKey(),
  noteId: text('noteId').notNull(),
  scriptureNoteId: text('scriptureNoteId').notNull(),
  createdAt: text('createdAt').notNull(),
}, (table) => [
  uniqueIndex('NoteScriptureReferences_uniqueNoteScripture').on(table.noteId, table.scriptureNoteId),
]);

// ─── ResourceMetadata ──────────────────────────────────────────────────────────

export const ResourceMetadata = sqliteTable('ResourceMetadata', {
  id: text('id').primaryKey(),
  noteId: text('noteId').notNull(),
  sourceUrl: text('sourceUrl').notNull(),
  sourceDomain: text('sourceDomain'),
  sourceName: text('sourceName'),
  sourceTitle: text('sourceTitle'),
  sourceDescription: text('sourceDescription'),
  sourceImage: text('sourceImage'),
  createdAt: text('createdAt').notNull(),
});

// ─── InboxItems ────────────────────────────────────────────────────────────────

export const InboxItems = sqliteTable('InboxItems', {
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
  isActive: integer('isActive', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('createdAt').notNull(),
  updatedAt: text('updatedAt'),
});

// ─── InboxItemNotes ────────────────────────────────────────────────────────────

export const InboxItemNotes = sqliteTable('InboxItemNotes', {
  id: text('id').primaryKey(),
  inboxItemId: text('inboxItemId').notNull(),
  title: text('title'),
  content: text('content').notNull(),
  order: integer('order').notNull().default(0),
  createdAt: text('createdAt').notNull(),
});

// ─── UserInboxItems ────────────────────────────────────────────────────────────

export const UserInboxItems = sqliteTable('UserInboxItems', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  inboxItemId: text('inboxItemId').notNull(),
  status: text('status').notNull(),
  addedAt: text('addedAt'),
  archivedAt: text('archivedAt'),
  createdAt: text('createdAt').notNull(),
});

// ─── MonthlyAnalytics ──────────────────────────────────────────────────────────

export const MonthlyAnalytics = sqliteTable('MonthlyAnalytics', {
  id: text('id').primaryKey(),
  month: text('month').notNull(),
  bookName: text('bookName'),
  tagName: text('tagName'),
  category: text('category').notNull(),
  count: integer('count').notNull().default(0),
  createdAt: text('createdAt').notNull(),
  updatedAt: text('updatedAt'),
});
