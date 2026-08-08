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
  ThreadProgress,
  Notes,
  NoteVersions,
  SpaceNotes,
  NoteThreads,
  StudyThreadEntries,
  SyncDeletedEntities,
  Comments,
  Members,
  SpaceInvitations,
  SpaceMemberships,
  SpaceInvites,
  Churches,
  ChurchMemberships,
  ChurchServices,
  ChurchSeries,
  ChurchServiceTimes,
  ChurchServiceTimeAssignments,
  ChurchServicePublishedNotes,
  NoteTemplates,
  UserMetadata,
  Entitlements,
  ClerkUserMapping,
  UserXP,
  UserSeasonalXP,
  UserLifetimeXP,
  WeeklyStreaks,
  Tags,
  NoteTags,
  ScriptureMetadata,
  NoteScriptureReferences,
  NoteFingerprints,
  RecallEvents,
  SupportTickets,
  SupportTicketNotes,
  DiagnosticEvents,
  DiagnosticIssueTriage,
  NoteConnections,
  StudyThreadMemberOrders,
  VerseTextCache,
  BibleTranslations,
  BibleVerses,
  ScriptureCrossReferences,
  ScriptureTopics,
  ScriptureTopicVerses,
  BiblePeople,
  BiblePlaces,
  ScriptureEntityRefs,
  TopicRelations,
  ResourceMetadata,
  ResourceLibraries,
  LibraryItems,
  LibraryItemScopes,
  LibraryItemSpacePins,
  LibraryItemSuggestions,
  ChurchServiceLibraryItems,
  InboxItems,
  InboxItemNotes,
  UserInboxItems,
  FeaturedItems,
  UserFeaturedItems,
  VotdSchedule,
  VotdPublishHistory,
  MonthlyAnalytics,
  AdminMonthlyReports,
  ImportSessions,
  ImportSessionItems,
  AppSyncCursors,
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
  countDistinct,
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

// Re-exported so callers building Drizzle condition arrays get `SQL[]` instead of
// `any[]` — prototype-user-migration alone has 7 such sites.
export type { SQL } from 'drizzle-orm';
