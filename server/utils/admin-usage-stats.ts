/**
 * Admin usage stats — platform-wide aggregates for the Harvous admin dashboard.
 * Recall carousel metrics read RecallEvents; stability avg from NoteFingerprints. See docs/RECALL_USAGE_METRICS_PHASE2.md
 */

import { createClerkClient } from '@clerk/backend';
import {
  db,
  Notes,
  Threads,
  Spaces,
  UserMetadata,
  NoteConnections,
  ScriptureMetadata,
  NoteTags,
  Tags,
  NoteFingerprints,
  RecallEvents,
  eq,
  and,
  or,
  gte,
  lt,
  isNotNull,
  isNull,
  ne,
  sql,
} from '../db';
import { COUNTABLE_USER_NOTES_N_SQL, COUNTABLE_USER_NOTES_SQL, countableUserNotesWhere } from './purge-onboarding-content';
import { parsePrototypeEmptyFolderLabels } from './prototype-empty-folder-labels';
import { noteFolderMembershipLabels, normalizeFolderKey } from '@/utils/note-folder-display';
import { filterPulseDiscoveryThemes } from '@/utils/universal-bible-entities';
import { formatPulseThemeLabels } from '@/utils/divine-name-display';
import { isMyPileDisplayTitle } from '@/utils/my-pile-thread';
import {
  isNoteFingerprintsTableMissing,
  isRecallEventsTableMissing,
  isStudyThreadEntriesTableMissing,
  isNoteConnectionsTableMissing,
  isStudyThreadNamingColumnMissing,
  isPrototypeFolderStatsColumnMissing,
  isPgUndefinedColumn,
  isPgUndefinedRelation,
} from './pg-undefined-relation';
import { fetchVotdPassageEngagementMetrics, type VotdPassageEngagementMetrics } from './admin-votd-passage-metrics';
import { getAdminPulseXp, type PulseXpSummary } from './admin-pulse-xp-stats';
import { adminWindowSince, adminWindowPreviousRange, clampAdminDays } from './admin-time-window';
import { recallKindDisplayLabel } from '@/utils/recall-opportunity-kinds';
import type { AdminMonthlyReportUsage } from './admin-report-types';

export type DiscoveryRankItem = { name: string; count: number };

export type UsageOverview = {
  days: number;
  users: {
    /** Harvous accounts in Postgres (UserMetadata rows). */
    total: number;
    /** Clerk user count for the API's CLERK_SECRET_KEY env (may differ locally). */
    clerkAccounts: number | null;
    withContent: number;
    freeTier: number;
    unlimitedTier: number;
    /** All-time: users with notes ÷ total accounts. */
    activationRate: number;
    /** Selected window. */
    signups: number;
    /** Selected window: active users ÷ total accounts. */
    activeRatePct: number;
  };
  content: {
    notes: number;
    folders: number;
    threads: number;
    /** Notes created in the selected window. */
    notesCreated: number;
    notesByType: {
      default: number;
      scripture: number;
      resource: number;
    };
  };
  engagement: {
    /** Distinct users with note activity in the selected window. */
    activeUsers: number;
    notesEdited: number;
  };
  study: {
    avgNotesPerUserWithContent: number;
    notesLinkedInThreads: number;
    linkRatePct: number;
    highlightsSpawned: number;
    highlightRatePct: number;
    notesWithPassages: number;
    passageRatePct: number;
    pinnedNotes: number;
    studyThreadEntries: number;
  };
  passage: {
    usersWhoAddedPassage: number;
    dismissCloseEvents: number;
    createNoteEvents: number;
  };
  scripture: {
    totalPills: number;
    scriptureNoteShare: number;
    topTranslations: DiscoveryRankItem[];
  };
  recall: {
    opens: number;
    snoozes: number;
    snoozeRatePct: number;
    usersActive: number;
    opensByKind: DiscoveryRankItem[];
    avgStabilityDays: number;
  };
  xp: PulseXpSummary;
};

export type DailyCount = { date: string; count: number };

export type UsageTrends = {
  days: number;
  signups: DailyCount[];
  notesCreated: DailyCount[];
  activeUsers: DailyCount[];
  scripturePillsCreated: DailyCount[];
  recallOpens: DailyCount[];
};

export type UsageDiscovery = {
  days: number;
  passages: DiscoveryRankItem[];
  books: DiscoveryRankItem[];
  dictionaryWords: DiscoveryRankItem[];
  tags: DiscoveryRankItem[];
  folders: DiscoveryRankItem[];
  themes: DiscoveryRankItem[];
  tones: DiscoveryRankItem[];
};

async function getClerkTotalUserCount(): Promise<number | null> {
  const clerkSecretKey = process.env.CLERK_SECRET_KEY;
  if (!clerkSecretKey) return null;
  const clerkClient = createClerkClient({ secretKey: clerkSecretKey });
  const { totalCount } = await clerkClient.users.getUserList({ limit: 1, offset: 0 });
  return totalCount ?? 0;
}

function utcDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function noteActivityAt() {
  return sql`COALESCE(${Notes.updatedAt}, ${Notes.createdAt})`;
}

function noteActivityDayExpr() {
  return sql<string>`TO_CHAR(${noteActivityAt()}::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD')`.as('date');
}

function scriptureCreatedDayExpr() {
  return sql<string>`TO_CHAR(${ScriptureMetadata.createdAt}::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD')`.as('date');
}

function fillDailyBuckets(days: number, rows: { date: string; count: number }[]): DailyCount[] {
  const map = new Map(rows.map((r) => [r.date, Number(r.count)]));
  const result: DailyCount[] = [];
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const key = utcDateString(d);
    result.push({ date: key, count: map.get(key) ?? 0 });
  }
  return result;
}

function parseSecondaries(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    /* ignore malformed JSON */
  }
  return [];
}

function folderKeyForLabel(label: string | null | undefined): string | null {
  const trimmed = (label ?? '').trim();
  if (!trimmed || isMyPileDisplayTitle(trimmed)) return null;
  const key = normalizeFolderKey(trimmed);
  return key || null;
}

function addFolderKeyForUser(foldersByUser: Map<string, Set<string>>, userId: string, label: string | null | undefined) {
  const key = folderKeyForLabel(label);
  if (!key) return;
  const set = foldersByUser.get(userId) ?? new Set<string>();
  set.add(key);
  foldersByUser.set(userId, set);
}

/** Legacy thread titles + prototype collection folders (primary/secondary + empty registry), deduped per user. */
async function countPlatformFolders(): Promise<number> {
  const threadRows = await db
    .select({ userId: Threads.userId, title: Threads.title })
    .from(Threads)
    .where(and(ne(Threads.id, 'thread_unorganized'), sql`NOT starts_with(${Threads.id}::text, 'thread_onboarding_')`));

  let noteRows: Array<{
    userId: string;
    primaryCollection: string | null;
    secondaryCollections: string | null;
  }> = [];
  try {
    noteRows = await db
      .select({
        userId: Notes.userId,
        primaryCollection: Notes.primaryCollection,
        secondaryCollections: Notes.secondaryCollections,
      })
      .from(Notes)
      .where(countableUserNotesWhere());
  } catch (error) {
    if (!isPrototypeFolderStatsColumnMissing(error)) throw error;
  }

  let spaceRows: Array<{ userId: string; prototypeEmptyFolderLabels: string | null }> = [];
  try {
    spaceRows = await db
      .select({ userId: Spaces.userId, prototypeEmptyFolderLabels: Spaces.prototypeEmptyFolderLabels })
      .from(Spaces);
  } catch (error) {
    if (!isPrototypeFolderStatsColumnMissing(error)) throw error;
  }

  const foldersByUser = new Map<string, Set<string>>();

  for (const row of threadRows) {
    addFolderKeyForUser(foldersByUser, row.userId, row.title);
  }

  for (const row of noteRows) {
    for (const label of noteFolderMembershipLabels({
      primaryCollection: row.primaryCollection,
      secondaryCollections: parseSecondaries(row.secondaryCollections),
    })) {
      addFolderKeyForUser(foldersByUser, row.userId, label);
    }
  }

  for (const row of spaceRows) {
    for (const label of parsePrototypeEmptyFolderLabels(row.prototypeEmptyFolderLabels)) {
      addFolderKeyForUser(foldersByUser, row.userId, label);
    }
  }

  let total = 0;
  for (const set of foldersByUser.values()) total += set.size;
  return total;
}

function noteActivityMs(updatedAt: Date | string | null, createdAt: Date | string): number {
  const raw = updatedAt ?? createdAt;
  if (raw instanceof Date) return raw.getTime();
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : 0;
}

function rankTrendingFolders(
  noteRows: Array<{
    primaryCollection: string | null;
    secondaryCollections?: string | null;
    updatedAt: Date | string | null;
    createdAt: Date | string;
    collectionUserOverride?: boolean;
    threadTitle?: string | null;
  }>,
  since: Date,
  limit: number,
  autoOnly = false,
): DiscoveryRankItem[] {
  const sinceMs = since.getTime();
  const countsByKey = new Map<string, number>();
  const labelsByKey = new Map<string, Map<string, number>>();

  for (const row of noteRows) {
    if (autoOnly && row.collectionUserOverride) continue;
    if (noteActivityMs(row.updatedAt, row.createdAt) < sinceMs) continue;

    if (autoOnly) {
      const primary = (row.primaryCollection ?? '').trim();
      if (!primary) continue;
      const threadTitle = (row.threadTitle ?? '').trim();
      if (threadTitle && folderKeyForLabel(primary) === folderKeyForLabel(threadTitle)) continue;
      const key = folderKeyForLabel(primary);
      if (!key) continue;
      countsByKey.set(key, (countsByKey.get(key) ?? 0) + 1);
      const labelCounts = labelsByKey.get(key) ?? new Map<string, number>();
      labelCounts.set(primary, (labelCounts.get(primary) ?? 0) + 1);
      labelsByKey.set(key, labelCounts);
      continue;
    }

    for (const label of noteFolderMembershipLabels({
      primaryCollection: row.primaryCollection,
      secondaryCollections: parseSecondaries(row.secondaryCollections ?? null),
    })) {
      const key = folderKeyForLabel(label);
      if (!key) continue;
      countsByKey.set(key, (countsByKey.get(key) ?? 0) + 1);
      const labelCounts = labelsByKey.get(key) ?? new Map<string, number>();
      labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
      labelsByKey.set(key, labelCounts);
    }
  }

  const pickDisplayLabel = (key: string): string => {
    const labelCounts = labelsByKey.get(key);
    if (!labelCounts || labelCounts.size === 0) return key;
    return [...labelCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
  };

  return [...countsByKey.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, count]) => ({ name: pickDisplayLabel(key), count }));
}

async function fetchStudyBehaviorMetrics(since: Date): Promise<{
  notesLinkedInThreads: number;
  highlightsSpawned: number;
  pinnedNotes: number;
  notesWithPassages: number;
}> {
  const sinceIso = since.toISOString();
  try {
    const rows = await db.execute<{
      notes_linked_in_threads: number;
      highlights_spawned: number;
      pinned_notes: number;
      notes_with_passages: number;
    }>(sql`
      SELECT
        (SELECT COUNT(DISTINCT note_id) FROM (
          SELECT nc."fromNoteId" AS note_id FROM "NoteConnections" nc
          INNER JOIN "Notes" n ON n."id" = nc."fromNoteId"
          WHERE nc."createdAt" >= ${sinceIso} AND ${COUNTABLE_USER_NOTES_N_SQL}
          UNION
          SELECT nc."toNoteId" AS note_id FROM "NoteConnections" nc
          INNER JOIN "Notes" n ON n."id" = nc."toNoteId"
          WHERE nc."createdAt" >= ${sinceIso} AND ${COUNTABLE_USER_NOTES_N_SQL}
        ) linked) AS notes_linked_in_threads,
        (SELECT COUNT(*) FROM "Notes" WHERE "linkedFromNoteId" IS NOT NULL AND "createdAt" >= ${sinceIso} AND ${COUNTABLE_USER_NOTES_SQL}) AS highlights_spawned,
        (SELECT COUNT(*) FROM "Notes" WHERE "isPinned" = true AND ${COUNTABLE_USER_NOTES_SQL}) AS pinned_notes,
        (SELECT COUNT(DISTINCT sm."noteId") FROM "ScriptureMetadata" sm
          INNER JOIN "Notes" n ON n."id" = sm."noteId"
          WHERE sm."createdAt" >= ${sinceIso} AND ${COUNTABLE_USER_NOTES_N_SQL}) AS notes_with_passages
    `);
    const row = rows[0];
    return {
      notesLinkedInThreads: Number(row?.notes_linked_in_threads ?? 0),
      highlightsSpawned: Number(row?.highlights_spawned ?? 0),
      pinnedNotes: Number(row?.pinned_notes ?? 0),
      notesWithPassages: Number(row?.notes_with_passages ?? 0),
    };
  } catch (error) {
    if (isNoteConnectionsTableMissing(error)) {
      const rows = await db.execute<{
        highlights_spawned: number;
        pinned_notes: number;
        notes_with_passages: number;
      }>(sql`
        SELECT
          (SELECT COUNT(*) FROM "Notes" WHERE "linkedFromNoteId" IS NOT NULL AND "createdAt" >= ${sinceIso} AND ${COUNTABLE_USER_NOTES_SQL}) AS highlights_spawned,
          (SELECT COUNT(*) FROM "Notes" WHERE "isPinned" = true AND ${COUNTABLE_USER_NOTES_SQL}) AS pinned_notes,
          (SELECT COUNT(DISTINCT sm."noteId") FROM "ScriptureMetadata" sm
            INNER JOIN "Notes" n ON n."id" = sm."noteId"
            WHERE sm."createdAt" >= ${sinceIso} AND ${COUNTABLE_USER_NOTES_N_SQL}) AS notes_with_passages
      `);
      const row = rows[0];
      return {
        notesLinkedInThreads: 0,
        highlightsSpawned: Number(row?.highlights_spawned ?? 0),
        pinnedNotes: Number(row?.pinned_notes ?? 0),
        notesWithPassages: Number(row?.notes_with_passages ?? 0),
      };
    }
    throw error;
  }
}

async function countActiveStudyThreadEntries(since: Date): Promise<number> {
  try {
    const rows = await db.execute<{ count: number }>(sql`
      SELECT COUNT(*) AS count FROM "StudyThreadEntries"
      WHERE "isArchived" = false
        AND COALESCE("updatedAt", "createdAt") >= ${since.toISOString()}
    `);
    return Number(rows[0]?.count ?? 0);
  } catch (error) {
    if (isStudyThreadEntriesTableMissing(error)) return 0;
    throw error;
  }
}

async function countNoteConnectionsSince(since: Date): Promise<number> {
  try {
    const rows = await db.execute<{ count: number }>(sql`
      SELECT COUNT(*)::int AS count FROM "NoteConnections"
      WHERE "createdAt" >= ${since.toISOString()}
    `);
    return Number(rows[0]?.count ?? 0);
  } catch (error) {
    if (isNoteConnectionsTableMissing(error)) return 0;
    throw error;
  }
}

async function countFoldersActiveSince(since: Date): Promise<number> {
  const noteRows = await fetchNotesForTrendingAutoFolders(since);
  const keys = new Set<string>();
  for (const row of noteRows) {
    for (const label of noteFolderMembershipLabels({
      primaryCollection: row.primaryCollection,
      secondaryCollections: parseSecondaries(row.secondaryCollections ?? null),
    })) {
      const key = folderKeyForLabel(label);
      if (key) keys.add(key);
    }
  }
  return keys.size;
}

async function countScripturePillsSince(since: Date): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`COUNT(*)`.as('count') })
    .from(ScriptureMetadata)
    .where(gte(ScriptureMetadata.createdAt, since));
  return Number(rows[0]?.count ?? 0);
}

async function fetchNotesForTrendingAutoFolders(since: Date, until?: Date): Promise<
  Array<{
    primaryCollection: string | null;
    secondaryCollections: string | null;
    updatedAt: Date | string | null;
    createdAt: Date | string;
    collectionUserOverride: boolean;
    threadTitle: string | null;
  }>
> {
  const activityFilter = until
    ? and(
        sql`${noteActivityAt()} >= ${since.toISOString()}`,
        sql`${noteActivityAt()} < ${until.toISOString()}`,
      )
    : sql`${noteActivityAt()} >= ${since.toISOString()}`;
  try {
    return await db
      .select({
        primaryCollection: Notes.primaryCollection,
        secondaryCollections: Notes.secondaryCollections,
        updatedAt: Notes.updatedAt,
        createdAt: Notes.createdAt,
        collectionUserOverride: Notes.collectionUserOverride,
        threadTitle: Threads.title,
      })
      .from(Notes)
      .leftJoin(Threads, eq(Notes.threadId, Threads.id))
      .where(
        and(
          activityFilter,
          countableUserNotesWhere(),
          eq(Notes.collectionUserOverride, false),
          or(
            and(isNotNull(Notes.primaryCollection), sql`trim(${Notes.primaryCollection}) <> ''`),
            and(
              isNotNull(Notes.secondaryCollections),
              sql`trim(${Notes.secondaryCollections}) <> ''`,
              sql`trim(${Notes.secondaryCollections}) <> '[]'`,
            ),
          ),
          // Classic thread backfill copies pile title → primary with collectionPinned=true.
          // Prototype auto-assign uses unpinned labels that differ from the legacy thread title.
          or(eq(Notes.collectionPinned, false), isNotNull(Notes.collectionLastAutoUpdatedAt)),
          or(
            eq(Notes.threadId, 'thread_unorganized'),
            isNull(Threads.title),
            sql`trim(${Threads.title}) = ''`,
            isNull(Notes.primaryCollection),
            sql`trim(${Notes.primaryCollection}) = ''`,
            sql`trim(${Notes.primaryCollection}) <> trim(${Threads.title})`,
          ),
        ),
      );
  } catch (error) {
    if (
      isPrototypeFolderStatsColumnMissing(error) ||
      isPgUndefinedColumn(error, 'collectionUserOverride') ||
      isPgUndefinedColumn(error, 'collectionLastAutoUpdatedAt') ||
      isPgUndefinedColumn(error, 'collectionPinned') ||
      isPgUndefinedColumn(error, 'secondaryCollections')
    ) {
      return [];
    }
    throw error;
  }
}

/** Trending auto-assigned folder labels (primary + secondary) for admin insight surfaces. */
export async function getTrendingAutoFolders(
  since: Date,
  limit = 10,
  until?: Date,
): Promise<DiscoveryRankItem[]> {
  const noteRows = await fetchNotesForTrendingAutoFolders(since, until);
  return rankTrendingFolders(noteRows, since, limit, false);
}

async function fetchDictionaryLookups(since: Date): Promise<DiscoveryRankItem[]> {
  try {
    const rows = await db.execute<{ name: string; count: number }>(sql`
      SELECT
        TRIM(COALESCE(
          NULLIF(TRIM("sourceSnippet"), ''),
          NULLIF(TRIM("anchorTextSnapshot"), ''),
          NULLIF(TRIM("focusTitle"), '')
        )) AS name,
        COUNT(DISTINCT "parentNoteId")::int AS count
      FROM "StudyThreadEntries"
      WHERE "entryKindRaw" = 'reference'
        AND "isArchived" = false
        AND COALESCE("updatedAt", "createdAt") >= ${since.toISOString()}
        AND TRIM(COALESCE(
          NULLIF(TRIM("sourceSnippet"), ''),
          NULLIF(TRIM("anchorTextSnapshot"), ''),
          NULLIF(TRIM("focusTitle"), '')
        )) <> ''
      GROUP BY 1
      ORDER BY count DESC, name ASC
      LIMIT 10
    `);
    return rows.map((row) => ({ name: row.name, count: Number(row.count) }));
  } catch (error) {
    if (isStudyThreadEntriesTableMissing(error)) return [];
    throw error;
  }
}

/** Pure rate math for recall overview (unit-tested). */
export function recallSnoozeRatePct(opens: number, snoozes: number): number {
  return opens > 0 ? Math.round((snoozes / opens) * 100) : 0;
}

export function recallAvgStabilityDays(avgStabilityRaw: number | null): number {
  return avgStabilityRaw != null && Number.isFinite(avgStabilityRaw)
    ? Math.round(avgStabilityRaw * 10) / 10
    : 0;
}

/** Prefer RecallEvents daily opens; fall back to fingerprint lastRecallEngagedAt when events are empty. */
export function pickRecallOpenTrendSource(
  eventRows: { date: string; count: number }[],
  legacyRows: { date: string; count: number }[],
): { date: string; count: number }[] {
  const eventTotal = eventRows.reduce((sum, row) => sum + Number(row.count), 0);
  return eventTotal > 0 ? eventRows : legacyRows;
}

function recallEngagedDayExpr() {
  return sql<string>`TO_CHAR(${NoteFingerprints.lastRecallEngagedAt}::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD')`.as(
    'date',
  );
}

function clampOverviewDays(daysParam: number): number {
  return clampAdminDays(daysParam);
}

const EMPTY_RECALL_METRICS = {
  opens: 0,
  snoozes: 0,
  snoozeRatePct: 0,
  usersActive: 0,
  opensByKind: [] as DiscoveryRankItem[],
  avgStabilityDays: 0,
};

async function fetchRecallStabilityMetrics(since: Date): Promise<number> {
  try {
    const rows = await db.execute<{ avg_stability: number | null }>(sql`
      SELECT AVG(nf."recallStabilityDays")::float AS avg_stability
      FROM "NoteFingerprints" nf
      INNER JOIN "Notes" n ON n."id" = nf."noteId"
      WHERE ${COUNTABLE_USER_NOTES_N_SQL}
        AND nf."lastRecallEngagedAt" IS NOT NULL
        AND nf."lastRecallEngagedAt" >= ${since.toISOString()}
    `);
    return recallAvgStabilityDays(rows[0]?.avg_stability ?? null);
  } catch (error) {
    if (isNoteFingerprintsTableMissing(error) || isPgUndefinedColumn(error, 'lastRecallEngagedAt')) {
      return 0;
    }
    throw error;
  }
}

async function fetchRecallEventMetrics(
  since: Date,
): Promise<Omit<typeof EMPTY_RECALL_METRICS, 'avgStabilityDays'>> {
  try {
    const sinceIso = since.toISOString();
    const [summaryRows, kindRows] = await Promise.all([
      db.execute<{
        opens: number;
        snoozes: number;
        users_active: number;
      }>(sql`
        SELECT
          (SELECT COUNT(*)::int FROM "RecallEvents"
            WHERE "action" = 'open' AND "createdAt" >= ${sinceIso}) AS opens,
          (SELECT COUNT(*)::int FROM "RecallEvents"
            WHERE "action" = 'snooze' AND "createdAt" >= ${sinceIso}) AS snoozes,
          (SELECT COUNT(DISTINCT "userId")::int FROM "RecallEvents"
            WHERE "createdAt" >= ${sinceIso}) AS users_active
      `),
      db.execute<{ kind: string; count: number }>(sql`
        SELECT "kind", COUNT(*)::int AS count
        FROM "RecallEvents"
        WHERE "action" = 'open' AND "createdAt" >= ${sinceIso}
        GROUP BY "kind"
        ORDER BY count DESC, "kind" ASC
        LIMIT 8
      `),
    ]);
    const row = summaryRows[0];
    const opens = Number(row?.opens ?? 0);
    const snoozes = Number(row?.snoozes ?? 0);
    const eventMetrics = {
      opens,
      snoozes,
      snoozeRatePct: recallSnoozeRatePct(opens, snoozes),
      usersActive: Number(row?.users_active ?? 0),
      opensByKind: kindRows.map((r) => ({
        name: recallKindDisplayLabel(r.kind),
        count: Number(r.count),
      })),
    };
    if (eventMetrics.opens > 0) return eventMetrics;
    return { ...(await fetchRecallLegacyEngagementCounts(since)), opensByKind: [] };
  } catch (error) {
    if (isRecallEventsTableMissing(error)) {
      return { ...(await fetchRecallLegacyEngagementCounts(since)), opensByKind: [] };
    }
    throw error;
  }
}

async function fetchRecallLegacyEngagementCounts(
  since: Date,
): Promise<Omit<typeof EMPTY_RECALL_METRICS, 'avgStabilityDays' | 'opensByKind'>> {
  try {
    const sinceIso = since.toISOString();
    const rows = await db.execute<{
      opens: number;
      users_active: number;
    }>(sql`
      SELECT
        (SELECT COUNT(*)::int FROM "NoteFingerprints" nf
          INNER JOIN "Notes" n ON n."id" = nf."noteId"
          WHERE ${COUNTABLE_USER_NOTES_N_SQL}
            AND nf."lastRecallEngagedAt" IS NOT NULL
            AND nf."lastRecallEngagedAt" >= ${sinceIso}) AS opens,
        (SELECT COUNT(DISTINCT n."userId")::int FROM "NoteFingerprints" nf
          INNER JOIN "Notes" n ON n."id" = nf."noteId"
          WHERE ${COUNTABLE_USER_NOTES_N_SQL}
            AND nf."lastRecallEngagedAt" IS NOT NULL
            AND nf."lastRecallEngagedAt" >= ${sinceIso}) AS users_active
    `);
    const row = rows[0];
    return {
      opens: Number(row?.opens ?? 0),
      snoozes: 0,
      snoozeRatePct: 0,
      usersActive: Number(row?.users_active ?? 0),
    };
  } catch (error) {
    if (isNoteFingerprintsTableMissing(error) || isPgUndefinedColumn(error, 'lastRecallEngagedAt')) {
      return {
        opens: 0,
        snoozes: 0,
        snoozeRatePct: 0,
        usersActive: 0,
      };
    }
    throw error;
  }
}

async function fetchRecallMetrics(since: Date): Promise<typeof EMPTY_RECALL_METRICS> {
  const [eventMetrics, avgStabilityDays] = await Promise.all([
    fetchRecallEventMetrics(since),
    fetchRecallStabilityMetrics(since),
  ]);
  return { ...eventMetrics, avgStabilityDays };
}

function recallOpenDayExpr() {
  return sql<string>`TO_CHAR(${RecallEvents.createdAt}::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD')`.as('date');
}

async function fetchRecallEngagedAtTrend(since: Date): Promise<{ date: string; count: number }[]> {
  try {
    return await db
      .select({ date: recallEngagedDayExpr(), count: sql<number>`COUNT(*)`.as('count') })
      .from(NoteFingerprints)
      .innerJoin(Notes, eq(NoteFingerprints.noteId, Notes.id))
      .where(
        and(
          isNotNull(NoteFingerprints.lastRecallEngagedAt),
          gte(NoteFingerprints.lastRecallEngagedAt, since),
          countableUserNotesWhere(),
        ),
      )
      .groupBy(
        sql`TO_CHAR(${NoteFingerprints.lastRecallEngagedAt}::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD')`,
      );
  } catch (error) {
    if (isNoteFingerprintsTableMissing(error) || isPgUndefinedColumn(error, 'lastRecallEngagedAt')) {
      return [];
    }
    throw error;
  }
}

async function fetchRecallOpenTrend(since: Date): Promise<{ date: string; count: number }[]> {
  let eventRows: { date: string; count: number }[] = [];
  try {
    eventRows = await db
      .select({ date: recallOpenDayExpr(), count: sql<number>`COUNT(*)`.as('count') })
      .from(RecallEvents)
      .where(and(eq(RecallEvents.action, 'open'), gte(RecallEvents.createdAt, since)))
      .groupBy(sql`TO_CHAR(${RecallEvents.createdAt}::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD')`);
  } catch (error) {
    if (!isRecallEventsTableMissing(error)) throw error;
  }

  const legacyRows = await fetchRecallEngagedAtTrend(since);
  return pickRecallOpenTrendSource(eventRows, legacyRows);
}

async function fetchFingerprintDiscovery(
  since: Date,
): Promise<{ themes: DiscoveryRankItem[]; tones: DiscoveryRankItem[] }> {
  try {
    const [themeRows, toneRows] = await Promise.all([
      db.execute<{ name: string; count: number }>(sql`
        SELECT theme AS name, COUNT(*)::int AS count
        FROM (
          SELECT jsonb_array_elements_text("themes"::jsonb) AS theme
          FROM "NoteFingerprints"
          WHERE "themes" IS NOT NULL
            AND "themes" <> '[]'
            AND "computedAt" >= ${since.toISOString()}
        ) t
        WHERE theme <> ''
        GROUP BY theme
        ORDER BY count DESC, theme ASC
        LIMIT 50
      `),
      db.execute<{ name: string; count: number }>(sql`
        SELECT "emotionalTone" AS name, COUNT(*)::int AS count
        FROM "NoteFingerprints"
        WHERE "emotionalTone" IS NOT NULL
          AND TRIM("emotionalTone") <> ''
          AND "computedAt" >= ${since.toISOString()}
        GROUP BY "emotionalTone"
        ORDER BY count DESC, name ASC
        LIMIT 10
      `),
    ]);
    return {
      themes: formatPulseThemeLabels(
        filterPulseDiscoveryThemes(
          themeRows.map((r) => ({ name: r.name, count: Number(r.count) })),
          10,
        ),
      ),
      tones: toneRows.map((r) => ({ name: r.name, count: Number(r.count) })),
    };
  } catch (error) {
    if (isNoteFingerprintsTableMissing(error)) return { themes: [], tones: [] };
    throw error;
  }
}

export async function getUsageOverview(daysParam: number): Promise<UsageOverview> {
  const days = clampOverviewDays(daysParam);
  const since = adminWindowSince(days);
  const sinceIso = since.toISOString();
  const { since: previousSince, until: previousUntil } = adminWindowPreviousRange(days);

  const [
    clerkTotal,
    contentRows,
    tierRows,
    noteTypeRows,
    threadLinksCreated,
    foldersActive,
    studyDepthRows,
    passageMetrics,
    scripturePillsCreated,
    translationRows,
    studyThreadEntries,
    recallMetrics,
  ] = await Promise.all([
    getClerkTotalUserCount(),
    db.execute<{
      total_accounts: number;
      users_with_content: number;
      notes: number;
      notes_created: number;
      signups: number;
      active_users: number;
      notes_edited: number;
    }>(sql`
    SELECT
      (SELECT COUNT(*) FROM "UserMetadata") AS total_accounts,
      (SELECT COUNT(DISTINCT "userId") FROM "Notes" WHERE ${COUNTABLE_USER_NOTES_SQL}) AS users_with_content,
      (SELECT COUNT(*) FROM "Notes" WHERE ${COUNTABLE_USER_NOTES_SQL}) AS notes,
      (SELECT COUNT(*) FROM "Notes" WHERE "createdAt" >= ${sinceIso} AND ${COUNTABLE_USER_NOTES_SQL}) AS notes_created,
      (SELECT COUNT(*) FROM "UserMetadata" WHERE "createdAt" >= ${sinceIso}) AS signups,
      (SELECT COUNT(DISTINCT "userId") FROM "Notes" WHERE COALESCE("updatedAt", "createdAt") >= ${sinceIso} AND ${COUNTABLE_USER_NOTES_SQL}) AS active_users,
      (SELECT COUNT(*) FROM "Notes" WHERE "updatedAt" >= ${sinceIso} AND "updatedAt" > "createdAt" AND ${COUNTABLE_USER_NOTES_SQL}) AS notes_edited
  `),
    db
      .select({ tier: UserMetadata.tier, count: sql<number>`COUNT(*)`.as('count') })
      .from(UserMetadata)
      .groupBy(UserMetadata.tier),
    db
      .select({ noteType: Notes.noteType, count: sql<number>`COUNT(*)`.as('count') })
      .from(Notes)
      .where(and(gte(Notes.createdAt, since), countableUserNotesWhere()))
      .groupBy(Notes.noteType),
    countNoteConnectionsSince(since),
    countFoldersActiveSince(since),
    fetchStudyBehaviorMetrics(since),
    fetchVotdPassageEngagementMetrics(since),
    countScripturePillsSince(since),
    db
      .select({ translation: UserMetadata.defaultTranslation, count: sql<number>`COUNT(*)`.as('count') })
      .from(UserMetadata)
      .groupBy(UserMetadata.defaultTranslation)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(5),
    countActiveStudyThreadEntries(since),
    fetchRecallMetrics(since),
  ]);

  const xp = await getAdminPulseXp(days, since, previousSince, previousUntil);

  const row = contentRows[0];
  const studyBehavior = studyDepthRows;
  const passage = passageMetrics;

  const notesByType = { default: 0, scripture: 0, resource: 0 };
  for (const typeRow of noteTypeRows) {
    const t = typeRow.noteType as keyof typeof notesByType;
    if (t in notesByType) notesByType[t] = Number(typeRow.count);
  }

  let freeTier = 0;
  let unlimitedTier = 0;
  for (const tierRow of tierRows) {
    if (tierRow.tier === 'unlimited') unlimitedTier = Number(tierRow.count);
    else freeTier += Number(tierRow.count);
  }

  const totalAccounts = Number(row?.total_accounts ?? 0);
  const usersWithContent = Number(row?.users_with_content ?? 0);
  const totalNotes = Number(row?.notes ?? 0);
  const notesCreatedInWindow = Number(row?.notes_created ?? 0);
  const activeUsers = Number(row?.active_users ?? 0);
  const signups = Number(row?.signups ?? 0);

  const activationRate =
    totalAccounts > 0 ? Math.round((usersWithContent / totalAccounts) * 100) : 0;
  const activeRatePct = totalAccounts > 0 ? Math.round((activeUsers / totalAccounts) * 100) : 0;
  const avgNotesPerUserWithContent =
    activeUsers > 0 ? Math.round((notesCreatedInWindow / activeUsers) * 10) / 10 : 0;
  const scriptureNoteShare =
    notesCreatedInWindow > 0 ? Math.round((notesByType.scripture / notesCreatedInWindow) * 100) : 0;
  const notesLinkedInThreads = studyBehavior.notesLinkedInThreads;
  const highlightsSpawned = studyBehavior.highlightsSpawned;
  const notesWithPassages = studyBehavior.notesWithPassages;
  const linkRatePct =
    notesCreatedInWindow > 0 ? Math.round((notesLinkedInThreads / notesCreatedInWindow) * 100) : 0;
  const highlightRatePct =
    notesCreatedInWindow > 0 ? Math.round((highlightsSpawned / notesCreatedInWindow) * 100) : 0;
  const passageRatePct =
    notesCreatedInWindow > 0 ? Math.round((notesWithPassages / notesCreatedInWindow) * 100) : 0;

  return {
    days,
    users: {
      total: totalAccounts,
      clerkAccounts: clerkTotal,
      withContent: usersWithContent,
      freeTier,
      unlimitedTier,
      activationRate,
      signups,
      activeRatePct,
    },
    content: {
      notes: totalNotes,
      folders: foldersActive,
      threads: threadLinksCreated,
      notesCreated: notesCreatedInWindow,
      notesByType,
    },
    engagement: {
      activeUsers,
      notesEdited: Number(row?.notes_edited ?? 0),
    },
    study: {
      avgNotesPerUserWithContent,
      notesLinkedInThreads,
      linkRatePct,
      highlightsSpawned,
      highlightRatePct,
      notesWithPassages,
      passageRatePct,
      pinnedNotes: studyBehavior.pinnedNotes,
      studyThreadEntries,
    },
    passage: {
      usersWhoAddedPassage: passage.usersWhoAddedPassage,
      dismissCloseEvents: passage.dismissCloseEvents,
      createNoteEvents: passage.passageNotesAdded,
    },
    scripture: {
      totalPills: scripturePillsCreated,
      scriptureNoteShare,
      topTranslations: translationRows.map((r) => ({
        name: r.translation ?? 'NET',
        count: Number(r.count),
      })),
    },
    recall: recallMetrics,
    xp,
  };
}

export async function getUsageTrends(daysParam: number): Promise<UsageTrends> {
  const days = clampAdminDays(daysParam);
  const since = adminWindowSince(days);

  const dayExpr = (col: typeof UserMetadata.createdAt) =>
    sql<string>`TO_CHAR(${col}::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD')`.as('date');

  const [signupRows, noteRows, activeRows, scriptureRows, recallRows] = await Promise.all([
    db
      .select({ date: dayExpr(UserMetadata.createdAt), count: sql<number>`COUNT(*)`.as('count') })
      .from(UserMetadata)
      .where(gte(UserMetadata.createdAt, since))
      .groupBy(sql`TO_CHAR(${UserMetadata.createdAt}::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD')`),
    db
      .select({ date: dayExpr(Notes.createdAt), count: sql<number>`COUNT(*)`.as('count') })
      .from(Notes)
      .where(and(gte(Notes.createdAt, since), countableUserNotesWhere()))
      .groupBy(sql`TO_CHAR(${Notes.createdAt}::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD')`),
    db
      .select({
        date: noteActivityDayExpr(),
        count: sql<number>`COUNT(DISTINCT ${Notes.userId})`.as('count'),
      })
      .from(Notes)
      .where(and(sql`${noteActivityAt()} >= ${since.toISOString()}`, countableUserNotesWhere()))
      .groupBy(
        sql`TO_CHAR(COALESCE(${Notes.updatedAt}, ${Notes.createdAt})::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD')`,
      ),
    db
      .select({ date: scriptureCreatedDayExpr(), count: sql<number>`COUNT(*)`.as('count') })
      .from(ScriptureMetadata)
      .where(gte(ScriptureMetadata.createdAt, since))
      .groupBy(sql`TO_CHAR(${ScriptureMetadata.createdAt}::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD')`),
    fetchRecallOpenTrend(since),
  ]);

  return {
    days,
    signups: fillDailyBuckets(days, signupRows),
    notesCreated: fillDailyBuckets(days, noteRows),
    activeUsers: fillDailyBuckets(days, activeRows),
    scripturePillsCreated: fillDailyBuckets(days, scriptureRows),
    recallOpens: fillDailyBuckets(days, recallRows),
  };
}

export async function getUsageDiscovery(daysParam: number): Promise<UsageDiscovery> {
  const days = clampAdminDays(daysParam);
  const since = adminWindowSince(days);

  const activityFilter = sql`${noteActivityAt()} >= ${since.toISOString()}`;

  const [passageRows, bookRows, tagRows, dictionaryWords, fingerprintDiscovery] = await Promise.all([
    db
      .select({
        reference: ScriptureMetadata.reference,
        count: sql<number>`COUNT(DISTINCT ${ScriptureMetadata.noteId})`.as('count'),
      })
      .from(ScriptureMetadata)
      .innerJoin(Notes, eq(ScriptureMetadata.noteId, Notes.id))
      .where(and(activityFilter, countableUserNotesWhere()))
      .groupBy(ScriptureMetadata.reference)
      .orderBy(sql`COUNT(DISTINCT ${ScriptureMetadata.noteId}) DESC`, ScriptureMetadata.reference)
      .limit(10),
    db
      .select({
        book: ScriptureMetadata.book,
        count: sql<number>`COUNT(DISTINCT ${ScriptureMetadata.noteId})`.as('count'),
      })
      .from(ScriptureMetadata)
      .innerJoin(Notes, eq(ScriptureMetadata.noteId, Notes.id))
      .where(and(activityFilter, isNotNull(ScriptureMetadata.book), countableUserNotesWhere()))
      .groupBy(ScriptureMetadata.book)
      .orderBy(sql`COUNT(DISTINCT ${ScriptureMetadata.noteId}) DESC`, ScriptureMetadata.book)
      .limit(10),
    db
      .select({
        tagName: Tags.name,
        count: sql<number>`COUNT(DISTINCT ${NoteTags.noteId})`.as('count'),
      })
      .from(NoteTags)
      .innerJoin(Tags, eq(NoteTags.tagId, Tags.id))
      .innerJoin(Notes, eq(NoteTags.noteId, Notes.id))
      .where(and(activityFilter, or(eq(NoteTags.isAutoGenerated, true), eq(Tags.isSystem, true)), countableUserNotesWhere()))
      .groupBy(Tags.name)
      .orderBy(sql`COUNT(DISTINCT ${NoteTags.noteId}) DESC`, Tags.name)
      .limit(10),
    fetchDictionaryLookups(since),
    fetchFingerprintDiscovery(since),
  ]);

  const folders = await getTrendingAutoFolders(since, 10);

  return {
    days,
    passages: passageRows.map((r) => ({ name: r.reference, count: Number(r.count) })),
    books: bookRows.filter((r) => r.book).map((r) => ({ name: r.book!, count: Number(r.count) })),
    dictionaryWords,
    tags: tagRows.filter((r) => r.tagName).map((r) => ({ name: r.tagName!, count: Number(r.count) })),
    folders,
    themes: fingerprintDiscovery.themes,
    tones: fingerprintDiscovery.tones,
  };
}

/** Fixed calendar month usage metrics for admin monthly reports. */
export async function getUsageOverviewForRange(since: Date, until: Date): Promise<AdminMonthlyReportUsage> {
  const sinceIso = since.toISOString();
  const untilIso = until.toISOString();

  const [contentRows, noteTypeRows, studyBehavior, passageMetrics, scripturePills, studyThreadEntries, recallMetrics] =
    await Promise.all([
      db.execute<{
        notes_created: number;
        signups: number;
        active_users: number;
        notes_edited: number;
      }>(sql`
        SELECT
          (SELECT COUNT(*) FROM "Notes" WHERE "createdAt" >= ${sinceIso} AND "createdAt" < ${untilIso} AND ${COUNTABLE_USER_NOTES_SQL}) AS notes_created,
          (SELECT COUNT(*) FROM "UserMetadata" WHERE "createdAt" >= ${sinceIso} AND "createdAt" < ${untilIso}) AS signups,
          (SELECT COUNT(DISTINCT "userId") FROM "Notes" WHERE COALESCE("updatedAt", "createdAt") >= ${sinceIso} AND COALESCE("updatedAt", "createdAt") < ${untilIso} AND ${COUNTABLE_USER_NOTES_SQL}) AS active_users,
          (SELECT COUNT(*) FROM "Notes" WHERE "updatedAt" >= ${sinceIso} AND "updatedAt" < ${untilIso} AND "updatedAt" > "createdAt" AND ${COUNTABLE_USER_NOTES_SQL}) AS notes_edited
      `),
      db
        .select({ noteType: Notes.noteType, count: sql<number>`COUNT(*)`.as('count') })
        .from(Notes)
        .where(and(gte(Notes.createdAt, since), lt(Notes.createdAt, until), countableUserNotesWhere()))
        .groupBy(Notes.noteType),
      fetchStudyBehaviorMetricsForRange(since, until),
      fetchVotdPassageEngagementMetricsForRange(since, until),
      db
        .select({ count: sql<number>`COUNT(*)`.as('count') })
        .from(ScriptureMetadata)
        .where(and(gte(ScriptureMetadata.createdAt, since), lt(ScriptureMetadata.createdAt, until))),
      countActiveStudyThreadEntriesForRange(since, until),
      fetchRecallMetricsForRange(since, until),
    ]);

  const row = contentRows[0];
  const notesCreated = Number(row?.notes_created ?? 0);
  const activeUsers = Number(row?.active_users ?? 0);

  const notesByType = { default: 0, scripture: 0, resource: 0 };
  for (const typeRow of noteTypeRows) {
    const t = typeRow.noteType as keyof typeof notesByType;
    if (t in notesByType) notesByType[t] = Number(typeRow.count);
  }

  const notesLinkedInThreads = studyBehavior.notesLinkedInThreads;
  const highlightsSpawned = studyBehavior.highlightsSpawned;
  const notesWithPassages = studyBehavior.notesWithPassages;
  const linkRatePct = notesCreated > 0 ? Math.round((notesLinkedInThreads / notesCreated) * 100) : 0;
  const highlightRatePct = notesCreated > 0 ? Math.round((highlightsSpawned / notesCreated) * 100) : 0;
  const passageRatePct = notesCreated > 0 ? Math.round((notesWithPassages / notesCreated) * 100) : 0;

  return {
    signups: Number(row?.signups ?? 0),
    activeUsers,
    notesCreated,
    notesEdited: Number(row?.notes_edited ?? 0),
    notesByType,
    scripturePills: Number(scripturePills[0]?.count ?? 0),
    study: {
      notesLinkedInThreads,
      linkRatePct,
      notesWithPassages,
      passageRatePct,
      highlightsSpawned,
      highlightRatePct,
      studyThreadEntries,
      pinnedNotes: studyBehavior.pinnedNotes,
    },
    recall: {
      opens: recallMetrics.opens,
      snoozes: recallMetrics.snoozes,
      snoozeRatePct: recallMetrics.snoozeRatePct,
      usersActive: recallMetrics.usersActive,
    },
    passage: {
      usersWhoAddedPassage: passageMetrics.usersWhoAddedPassage,
      dismissCloseEvents: passageMetrics.dismissCloseEvents,
      createNoteEvents: passageMetrics.passageNotesAdded,
    },
  };
}

async function fetchStudyBehaviorMetricsForRange(
  since: Date,
  until: Date,
): Promise<{
  notesLinkedInThreads: number;
  highlightsSpawned: number;
  pinnedNotes: number;
  notesWithPassages: number;
}> {
  const sinceIso = since.toISOString();
  const untilIso = until.toISOString();
  try {
    const rows = await db.execute<{
      notes_linked_in_threads: number;
      highlights_spawned: number;
      pinned_notes: number;
      notes_with_passages: number;
    }>(sql`
      SELECT
        (SELECT COUNT(DISTINCT note_id) FROM (
          SELECT nc."fromNoteId" AS note_id FROM "NoteConnections" nc
          INNER JOIN "Notes" n ON n."id" = nc."fromNoteId"
          WHERE nc."createdAt" >= ${sinceIso} AND nc."createdAt" < ${untilIso} AND ${COUNTABLE_USER_NOTES_N_SQL}
          UNION
          SELECT nc."toNoteId" AS note_id FROM "NoteConnections" nc
          INNER JOIN "Notes" n ON n."id" = nc."toNoteId"
          WHERE nc."createdAt" >= ${sinceIso} AND nc."createdAt" < ${untilIso} AND ${COUNTABLE_USER_NOTES_N_SQL}
        ) linked) AS notes_linked_in_threads,
        (SELECT COUNT(*) FROM "Notes" WHERE "linkedFromNoteId" IS NOT NULL AND "createdAt" >= ${sinceIso} AND "createdAt" < ${untilIso} AND ${COUNTABLE_USER_NOTES_SQL}) AS highlights_spawned,
        (SELECT COUNT(*) FROM "Notes" WHERE "isPinned" = true AND "createdAt" >= ${sinceIso} AND "createdAt" < ${untilIso} AND ${COUNTABLE_USER_NOTES_SQL}) AS pinned_notes,
        (SELECT COUNT(DISTINCT sm."noteId") FROM "ScriptureMetadata" sm
          INNER JOIN "Notes" n ON n."id" = sm."noteId"
          WHERE sm."createdAt" >= ${sinceIso} AND sm."createdAt" < ${untilIso} AND ${COUNTABLE_USER_NOTES_N_SQL}) AS notes_with_passages
    `);
    const row = rows[0];
    return {
      notesLinkedInThreads: Number(row?.notes_linked_in_threads ?? 0),
      highlightsSpawned: Number(row?.highlights_spawned ?? 0),
      pinnedNotes: Number(row?.pinned_notes ?? 0),
      notesWithPassages: Number(row?.notes_with_passages ?? 0),
    };
  } catch (error) {
    if (isNoteConnectionsTableMissing(error)) {
      return { notesLinkedInThreads: 0, highlightsSpawned: 0, pinnedNotes: 0, notesWithPassages: 0 };
    }
    throw error;
  }
}

async function countActiveStudyThreadEntriesForRange(since: Date, until: Date): Promise<number> {
  try {
    const rows = await db.execute<{ count: number }>(sql`
      SELECT COUNT(*) AS count FROM "StudyThreadEntries"
      WHERE "isArchived" = false
        AND COALESCE("updatedAt", "createdAt") >= ${since.toISOString()}
        AND COALESCE("updatedAt", "createdAt") < ${until.toISOString()}
    `);
    return Number(rows[0]?.count ?? 0);
  } catch (error) {
    if (isStudyThreadEntriesTableMissing(error)) return 0;
    throw error;
  }
}

async function fetchRecallMetricsForRange(
  since: Date,
  until: Date,
): Promise<{ opens: number; snoozes: number; snoozeRatePct: number; usersActive: number }> {
  try {
    const sinceIso = since.toISOString();
    const untilIso = until.toISOString();
    const rows = await db.execute<{ opens: number; snoozes: number; users_active: number }>(sql`
      SELECT
        (SELECT COUNT(*)::int FROM "RecallEvents"
          WHERE "action" = 'open' AND "createdAt" >= ${sinceIso} AND "createdAt" < ${untilIso}) AS opens,
        (SELECT COUNT(*)::int FROM "RecallEvents"
          WHERE "action" = 'snooze' AND "createdAt" >= ${sinceIso} AND "createdAt" < ${untilIso}) AS snoozes,
        (SELECT COUNT(DISTINCT "userId")::int FROM "RecallEvents"
          WHERE "createdAt" >= ${sinceIso} AND "createdAt" < ${untilIso}) AS users_active
    `);
    const row = rows[0];
    const opens = Number(row?.opens ?? 0);
    const snoozes = Number(row?.snoozes ?? 0);
    return {
      opens,
      snoozes,
      snoozeRatePct: recallSnoozeRatePct(opens, snoozes),
      usersActive: Number(row?.users_active ?? 0),
    };
  } catch (error) {
    if (isRecallEventsTableMissing(error)) {
      return { opens: 0, snoozes: 0, snoozeRatePct: 0, usersActive: 0 };
    }
    throw error;
  }
}

async function fetchVotdPassageEngagementMetricsForRange(
  since: Date,
  until: Date,
): Promise<VotdPassageEngagementMetrics> {
  const empty: VotdPassageEngagementMetrics = {
    usersWhoAddedPassage: 0,
    passageNotesAdded: 0,
    dismissCloseEvents: 0,
  };
  try {
    const sinceIso = since.toISOString();
    const untilIso = until.toISOString();
    const publishDateMin = since.toISOString().slice(0, 10);
    const publishDateMax = until.toISOString().slice(0, 10);

    const rows = await db.execute<{
      users_who_added_passage: number;
      passage_notes_added: number;
      dismiss_close_events: number;
    }>(sql`
    WITH published AS (
      SELECT
        p."reference",
        p."publishedDate",
        TRIM(LOWER(REGEXP_REPLACE(p."reference", '\\s+', ' ', 'g'))) AS ref_norm
      FROM "VotdPublishHistory" p
      WHERE p."publishedDate" >= ${publishDateMin} AND p."publishedDate" < ${publishDateMax}
    ),
    note_hits AS (
      SELECT DISTINCT n."id" AS note_id, n."userId" AS user_id
      FROM "Notes" n
      INNER JOIN published p ON (
        n."createdAt" >= (p."publishedDate" || 'T00:00:00.000Z')::timestamptz
        AND n."createdAt" < ${untilIso}
        AND (
          TRIM(LOWER(REGEXP_REPLACE(COALESCE(n."title", ''), '\\s+', ' ', 'g'))) = p.ref_norm
          OR POSITION('data-scripture-reference="' || p."reference" || '"' IN COALESCE(n."content", '')) > 0
          OR EXISTS (
            SELECT 1 FROM "ScriptureMetadata" sm
            WHERE sm."noteId" = n."id"
            AND TRIM(LOWER(REGEXP_REPLACE(sm."reference", '\\s+', ' ', 'g'))) = p.ref_norm
          )
        )
      )
      WHERE n."createdAt" >= ${sinceIso} AND n."createdAt" < ${untilIso}
      AND ${COUNTABLE_USER_NOTES_N_SQL}
    )
    SELECT
      (SELECT COUNT(DISTINCT user_id) FROM (
        SELECT user_id FROM note_hits
        UNION
        SELECT "userId" AS user_id FROM "UserXP"
        WHERE "activityType" = 'votd_engaged' AND "createdAt" >= ${sinceIso} AND "createdAt" < ${untilIso}
      ) combined_users) AS users_who_added_passage,
      (SELECT COUNT(*)::int FROM note_hits) AS passage_notes_added,
      (SELECT COUNT(*)::int FROM "UserFeaturedItems" ufi
        INNER JOIN "FeaturedItems" fi ON fi."id" = ufi."featuredItemId"
        WHERE fi."contentType" = 'votd' AND ufi."status" = 'completed'
        AND ufi."completedAt" >= ${sinceIso} AND ufi."completedAt" < ${untilIso}) AS dismiss_close_events
    `);

    const row = rows[0];
    return {
      usersWhoAddedPassage: Number(row?.users_who_added_passage ?? 0),
      passageNotesAdded: Number(row?.passage_notes_added ?? 0),
      dismissCloseEvents: Number(row?.dismiss_close_events ?? 0),
    };
  } catch (error) {
    if (
      isPgUndefinedRelation(error, 'VotdPublishHistory') ||
      isPgUndefinedRelation(error, 'UserFeaturedItems') ||
      isPgUndefinedRelation(error, 'FeaturedItems')
    ) {
      return empty;
    }
    throw error;
  }
}
