/**
 * Barrel re-exports for the database layer.
 *
 * Usage:
 *   import { db, Threads, Notes, eq, and, desc } from '../db';
 */

// Database client
export { db, getDb } from './client';

// All schema tables
export {
  Spaces,
  Threads,
  Notes,
  NoteThreads,
  Comments,
  Members,
  SpaceInvitations,
  UserMetadata,
  Churches,
  ClerkUserMapping,
  UserXP,
  UserSeasonalXP,
  UserLifetimeXP,
  WeeklyStreaks,
  Tags,
  NoteTags,
  ScriptureMetadata,
  NoteScriptureReferences,
  ResourceMetadata,
  InboxItems,
  InboxItemNotes,
  UserInboxItems,
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

// Date helpers
export { toDate, fromDate } from './dates';
