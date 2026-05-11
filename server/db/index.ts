/**
 * Barrel re-exports for the database layer.
 *
 * Usage:
 *   import { db, Threads, Notes, eq, and, desc } from '../db';
 */

// Database client
export { db, getDb, warmPostgresConnection } from './client';

// All schema tables
export {
  Spaces,
  Threads,
  Notes,
  NoteThreads,
  StudyThreadEntries,
  Comments,
  Members,
  SpaceInvitations,
  UserMetadata,
  ClerkUserMapping,
  UserXP,
  UserSeasonalXP,
  UserLifetimeXP,
  WeeklyStreaks,
  Tags,
  NoteTags,
  ScriptureMetadata,
  NoteScriptureReferences,
  VerseTextCache,
  BibleTranslations,
  BibleVerses,
  ResourceMetadata,
  InboxItems,
  InboxItemNotes,
  UserInboxItems,
  FeaturedItems,
  UserFeaturedItems,
  VotdSchedule,
  VotdPublishHistory,
  MonthlyAnalytics,
} from './schema';

// Common Drizzle operators (mirrors what astro:db re-exports)
export {
  eq,
  ne,
  and,
  or,
  not,
  gt,
  gte,
  lt,
  lte,
  like,
  asc,
  desc,
  count,
  sum,
  avg,
  min,
  max,
  sql,
  inArray,
  notInArray,
  isNull,
  isNotNull,
  between,
  exists,
  notExists,
} from 'drizzle-orm';

// Query helpers
export { first } from './helpers';

// Date helpers
export { now, toDate, fromDate, nowISO } from './dates';
