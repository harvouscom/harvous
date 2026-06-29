/**
 * Admin usage stats — platform-wide aggregates for the Harvous admin dashboard.
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
  eq,
  and,
  or,
  gte,
  isNotNull,
  isNull,
  ne,
  sql,
} from '../db';
import { COUNTABLE_USER_NOTES_N_SQL, COUNTABLE_USER_NOTES_SQL, countableUserNotesWhere } from './purge-onboarding-content';
import { parsePrototypeEmptyFolderLabels } from './prototype-empty-folder-labels';
import { noteFolderMembershipLabels, normalizeFolderKey } from '@/utils/note-folder-display';
import { isMyPileDisplayTitle } from '@/utils/my-pile-thread';
import {
  isNoteFingerprintsTableMissing,
  isStudyThreadEntriesTableMissing,
  isNoteConnectionsTableMissing,
  isStudyThreadNamingColumnMissing,
  isPrototypeFolderStatsColumnMissing,
  isPgUndefinedColumn,
} from './pg-undefined-relation';
import { fetchVotdPassageEngagementMetrics } from './admin-votd-passage-metrics';

export type DiscoveryRankItem = { name: string; count: number };

export type UsageOverview = {
  users: {
    /** Harvous accounts in Postgres (UserMetadata rows). */
    total: number;
    /** Clerk user count for the API's CLERK_SECRET_KEY env (may differ locally). */
    clerkAccounts: number | null;
    withContent: number;
    freeTier: number;
    unlimitedTier: number;
    signupsLast7Days: number;
    signupsLast30Days: number;
    activationRate: number;
    /** Share of all Harvous accounts with note activity in the last 30 days (MAU ÷ total). */
    activeLast30DaysPct: number;
  };
  content: {
    notes: number;
    folders: number;
    threads: number;
    notesCreatedLast7Days: number;
    notesCreatedLast30Days: number;
    notesByType: {
      default: number;
      scripture: number;
      resource: number;
    };
  };
  engagement: {
    dau: number;
    wau: number;
    mau: number;
    stickiness: number | null;
    notesEditedLast7Days: number;
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
    usersWhoAddedPassageLast30Days: number;
    dismissCloseEventsLast30Days: number;
    createNoteEventsLast30Days: number;
  };
  scripture: {
    totalPills: number;
    scriptureNoteShare: number;
    topTranslations: DiscoveryRankItem[];
  };
};

export type DailyCount = { date: string; count: number };

export type UsageTrends = {
  days: number;
  signups: DailyCount[];
  notesCreated: DailyCount[];
  activeUsers: DailyCount[];
  scripturePillsCreated: DailyCount[];
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

function daysAgoDate(days: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function clampDiscoveryDays(daysParam: number): number {
  return Math.min(Math.max(daysParam, 7), 90);
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

class UnionFind {
  private parent = new Map<string, string>();

  find(id: string): string {
    const existing = this.parent.get(id);
    if (!existing) {
      this.parent.set(id, id);
      return id;
    }
    if (existing !== id) {
      const root = this.find(existing);
      this.parent.set(id, root);
      return root;
    }
    return id;
  }

  union(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parent.set(rootB, rootA);
  }

  componentCount(): number {
    const roots = new Set<string>();
    for (const id of this.parent.keys()) roots.add(this.find(id));
    return roots.size;
  }
}

/** Legacy thread count when prototype NoteConnections / study-thread columns are not migrated yet. */
async function countLegacyThreads(): Promise<number> {
  const rows = await db.execute<{ count: number }>(sql`
    SELECT COUNT(*)::int AS count FROM "Threads"
    WHERE "id" <> 'thread_unorganized'
      AND NOT starts_with("id"::text, 'thread_onboarding_')
  `);
  return Number(rows[0]?.count ?? 0);
}

/** Prototype study-thread clusters: connected note groups + titled singletons (matches sidebar threads mode). */
async function countStudyThreadClusters(): Promise<number> {
  try {
    const [edgeRows, singletonRows] = await Promise.all([
      db
        .select({
          userId: NoteConnections.userId,
          fromNoteId: NoteConnections.fromNoteId,
          toNoteId: NoteConnections.toNoteId,
        })
        .from(NoteConnections),
      db
        .select({ userId: Notes.userId, id: Notes.id })
        .from(Notes)
        .where(
          and(
            eq(Notes.studyThreadUserOverride, true),
            isNotNull(Notes.studyThreadTitle),
            sql`TRIM(COALESCE(${Notes.studyThreadTitle}, '')) <> ''`,
            countableUserNotesWhere(),
          ),
        ),
    ]);

    const edgesByUser = new Map<string, Array<{ fromNoteId: string; toNoteId: string }>>();
    for (const row of edgeRows) {
      const list = edgesByUser.get(row.userId) ?? [];
      list.push({ fromNoteId: row.fromNoteId, toNoteId: row.toNoteId });
      edgesByUser.set(row.userId, list);
    }

    const singletonsByUser = new Map<string, Set<string>>();
    for (const row of singletonRows) {
      const set = singletonsByUser.get(row.userId) ?? new Set<string>();
      set.add(row.id);
      singletonsByUser.set(row.userId, set);
    }

    const userIds = new Set([...edgesByUser.keys(), ...singletonsByUser.keys()]);
    let total = 0;

    for (const userId of userIds) {
      const edges = edgesByUser.get(userId) ?? [];
      const uf = new UnionFind();
      const connectedNodes = new Set<string>();

      for (const edge of edges) {
        uf.union(edge.fromNoteId, edge.toNoteId);
        connectedNodes.add(edge.fromNoteId);
        connectedNodes.add(edge.toNoteId);
      }

      total += uf.componentCount();

      const singletons = singletonsByUser.get(userId);
      if (singletons) {
        for (const noteId of singletons) {
          if (!connectedNodes.has(noteId)) total += 1;
        }
      }
    }

    return total;
  } catch (error) {
    if (isNoteConnectionsTableMissing(error) || isStudyThreadNamingColumnMissing(error)) {
      return countLegacyThreads();
    }
    throw error;
  }
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

async function fetchStudyBehaviorMetrics(): Promise<{
  notesLinkedInThreads: number;
  highlightsSpawned: number;
  pinnedNotes: number;
  notesWithPassages: number;
}> {
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
          WHERE ${COUNTABLE_USER_NOTES_N_SQL}
          UNION
          SELECT nc."toNoteId" AS note_id FROM "NoteConnections" nc
          INNER JOIN "Notes" n ON n."id" = nc."toNoteId"
          WHERE ${COUNTABLE_USER_NOTES_N_SQL}
        ) linked) AS notes_linked_in_threads,
        (SELECT COUNT(*) FROM "Notes" WHERE "linkedFromNoteId" IS NOT NULL AND ${COUNTABLE_USER_NOTES_SQL}) AS highlights_spawned,
        (SELECT COUNT(*) FROM "Notes" WHERE "isPinned" = true AND ${COUNTABLE_USER_NOTES_SQL}) AS pinned_notes,
        (SELECT COUNT(DISTINCT sm."noteId") FROM "ScriptureMetadata" sm
          INNER JOIN "Notes" n ON n."id" = sm."noteId"
          WHERE ${COUNTABLE_USER_NOTES_N_SQL}) AS notes_with_passages
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
          (SELECT COUNT(*) FROM "Notes" WHERE "linkedFromNoteId" IS NOT NULL AND ${COUNTABLE_USER_NOTES_SQL}) AS highlights_spawned,
          (SELECT COUNT(*) FROM "Notes" WHERE "isPinned" = true AND ${COUNTABLE_USER_NOTES_SQL}) AS pinned_notes,
          (SELECT COUNT(DISTINCT sm."noteId") FROM "ScriptureMetadata" sm
            INNER JOIN "Notes" n ON n."id" = sm."noteId"
            WHERE ${COUNTABLE_USER_NOTES_N_SQL}) AS notes_with_passages
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

async function countActiveStudyThreadEntries(): Promise<number> {
  try {
    const rows = await db.execute<{ count: number }>(sql`
      SELECT COUNT(*) AS count FROM "StudyThreadEntries" WHERE "isArchived" = false
    `);
    return Number(rows[0]?.count ?? 0);
  } catch (error) {
    if (isStudyThreadEntriesTableMissing(error)) return 0;
    throw error;
  }
}

async function fetchNotesForTrendingAutoFolders(since: Date): Promise<
  Array<{
    primaryCollection: string | null;
    updatedAt: Date | string | null;
    createdAt: Date | string;
    collectionUserOverride: boolean;
    threadTitle: string | null;
  }>
> {
  const activityFilter = sql`${noteActivityAt()} >= ${since.toISOString()}`;
  try {
    return await db
      .select({
        primaryCollection: Notes.primaryCollection,
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
          isNotNull(Notes.primaryCollection),
          sql`trim(${Notes.primaryCollection}) <> ''`,
          // Classic thread backfill copies pile title → primary with collectionPinned=true.
          // Prototype auto-assign uses unpinned labels that differ from the legacy thread title.
          or(eq(Notes.collectionPinned, false), isNotNull(Notes.collectionLastAutoUpdatedAt)),
          or(
            eq(Notes.threadId, 'thread_unorganized'),
            isNull(Threads.title),
            sql`trim(${Threads.title}) = ''`,
            sql`trim(${Notes.primaryCollection}) <> trim(${Threads.title})`,
          ),
        ),
      );
  } catch (error) {
    if (
      isPrototypeFolderStatsColumnMissing(error) ||
      isPgUndefinedColumn(error, 'collectionUserOverride') ||
      isPgUndefinedColumn(error, 'collectionLastAutoUpdatedAt') ||
      isPgUndefinedColumn(error, 'collectionPinned')
    ) {
      return [];
    }
    throw error;
  }
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
        LIMIT 10
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
      themes: themeRows.map((r) => ({ name: r.name, count: Number(r.count) })),
      tones: toneRows.map((r) => ({ name: r.name, count: Number(r.count) })),
    };
  } catch (error) {
    if (isNoteFingerprintsTableMissing(error)) return { themes: [], tones: [] };
    throw error;
  }
}

export async function getUsageOverview(): Promise<UsageOverview> {
  const now7 = daysAgoDate(7);
  const now30 = daysAgoDate(30);
  const dauSince = daysAgoDate(1);
  const wauSince = daysAgoDate(7);
  const mauSince = daysAgoDate(30);

  const [
    clerkTotal,
    contentRows,
    tierRows,
    noteTypeRows,
    studyThreads,
    folders,
    studyDepthRows,
    passageMetrics,
    totalPillsRow,
    translationRows,
    studyThreadEntries,
  ] = await Promise.all([
    getClerkTotalUserCount(),
    db.execute<{
      total_accounts: number;
      users_with_content: number;
      notes: number;
      notes_7d: number;
      notes_30d: number;
      signups_7d: number;
      signups_30d: number;
      dau: number;
      wau: number;
      mau: number;
      notes_edited_7d: number;
    }>(sql`
    SELECT
      (SELECT COUNT(*) FROM "UserMetadata") AS total_accounts,
      (SELECT COUNT(DISTINCT "userId") FROM "Notes" WHERE ${COUNTABLE_USER_NOTES_SQL}) AS users_with_content,
      (SELECT COUNT(*) FROM "Notes" WHERE ${COUNTABLE_USER_NOTES_SQL}) AS notes,
      (SELECT COUNT(*) FROM "Notes" WHERE "createdAt" >= ${now7.toISOString()} AND ${COUNTABLE_USER_NOTES_SQL}) AS notes_7d,
      (SELECT COUNT(*) FROM "Notes" WHERE "createdAt" >= ${now30.toISOString()} AND ${COUNTABLE_USER_NOTES_SQL}) AS notes_30d,
      (SELECT COUNT(*) FROM "UserMetadata" WHERE "createdAt" >= ${now7.toISOString()}) AS signups_7d,
      (SELECT COUNT(*) FROM "UserMetadata" WHERE "createdAt" >= ${now30.toISOString()}) AS signups_30d,
      (SELECT COUNT(DISTINCT "userId") FROM "Notes" WHERE COALESCE("updatedAt", "createdAt") >= ${dauSince.toISOString()} AND ${COUNTABLE_USER_NOTES_SQL}) AS dau,
      (SELECT COUNT(DISTINCT "userId") FROM "Notes" WHERE COALESCE("updatedAt", "createdAt") >= ${wauSince.toISOString()} AND ${COUNTABLE_USER_NOTES_SQL}) AS wau,
      (SELECT COUNT(DISTINCT "userId") FROM "Notes" WHERE COALESCE("updatedAt", "createdAt") >= ${mauSince.toISOString()} AND ${COUNTABLE_USER_NOTES_SQL}) AS mau,
      (SELECT COUNT(*) FROM "Notes" WHERE "updatedAt" >= ${now7.toISOString()} AND "updatedAt" > "createdAt" AND ${COUNTABLE_USER_NOTES_SQL}) AS notes_edited_7d
  `),
    db
      .select({ tier: UserMetadata.tier, count: sql<number>`COUNT(*)`.as('count') })
      .from(UserMetadata)
      .groupBy(UserMetadata.tier),
    db
      .select({ noteType: Notes.noteType, count: sql<number>`COUNT(*)`.as('count') })
      .from(Notes)
      .where(countableUserNotesWhere())
      .groupBy(Notes.noteType),
    countStudyThreadClusters(),
    countPlatformFolders(),
    fetchStudyBehaviorMetrics(),
    fetchVotdPassageEngagementMetrics(now30),
    db.select({ count: sql<number>`COUNT(*)`.as('count') }).from(ScriptureMetadata),
    db
      .select({ translation: UserMetadata.defaultTranslation, count: sql<number>`COUNT(*)`.as('count') })
      .from(UserMetadata)
      .groupBy(UserMetadata.defaultTranslation)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(5),
    countActiveStudyThreadEntries(),
  ]);

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
  const mau = Number(row?.mau ?? 0);
  const dau = Number(row?.dau ?? 0);

  const activationRate =
    totalAccounts > 0 ? Math.round((usersWithContent / totalAccounts) * 100) : 0;
  const activeLast30DaysPct =
    totalAccounts > 0 ? Math.round((mau / totalAccounts) * 100) : 0;
  const stickiness = mau > 0 ? Math.round((dau / mau) * 100) : null;
  const avgNotesPerUserWithContent =
    usersWithContent > 0 ? Math.round((totalNotes / usersWithContent) * 10) / 10 : 0;
  const scriptureNoteShare =
    totalNotes > 0 ? Math.round((notesByType.scripture / totalNotes) * 100) : 0;
  const notesLinkedInThreads = studyBehavior.notesLinkedInThreads;
  const highlightsSpawned = studyBehavior.highlightsSpawned;
  const notesWithPassages = studyBehavior.notesWithPassages;
  const linkRatePct = totalNotes > 0 ? Math.round((notesLinkedInThreads / totalNotes) * 100) : 0;
  const highlightRatePct = totalNotes > 0 ? Math.round((highlightsSpawned / totalNotes) * 100) : 0;
  const passageRatePct = totalNotes > 0 ? Math.round((notesWithPassages / totalNotes) * 100) : 0;

  return {
    users: {
      total: totalAccounts,
      clerkAccounts: clerkTotal,
      withContent: usersWithContent,
      freeTier,
      unlimitedTier,
      signupsLast7Days: Number(row?.signups_7d ?? 0),
      signupsLast30Days: Number(row?.signups_30d ?? 0),
      activationRate,
      activeLast30DaysPct,
    },
    content: {
      notes: totalNotes,
      folders,
      threads: studyThreads,
      notesCreatedLast7Days: Number(row?.notes_7d ?? 0),
      notesCreatedLast30Days: Number(row?.notes_30d ?? 0),
      notesByType,
    },
    engagement: {
      dau,
      wau: Number(row?.wau ?? 0),
      mau,
      stickiness,
      notesEditedLast7Days: Number(row?.notes_edited_7d ?? 0),
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
      usersWhoAddedPassageLast30Days: passage.usersWhoAddedPassage,
      dismissCloseEventsLast30Days: passage.dismissCloseEvents,
      createNoteEventsLast30Days: passage.passageNotesAdded,
    },
    scripture: {
      totalPills: Number(totalPillsRow[0]?.count ?? 0),
      scriptureNoteShare,
      topTranslations: translationRows.map((r) => ({
        name: r.translation ?? 'NET',
        count: Number(r.count),
      })),
    },
  };
}

export async function getUsageTrends(daysParam: number): Promise<UsageTrends> {
  const days = Math.min(Math.max(daysParam, 1), 90);
  const since = daysAgoDate(days - 1);

  const dayExpr = (col: typeof UserMetadata.createdAt) =>
    sql<string>`TO_CHAR(${col}::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD')`.as('date');

  const [signupRows, noteRows, activeRows, scriptureRows] = await Promise.all([
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
  ]);

  return {
    days,
    signups: fillDailyBuckets(days, signupRows),
    notesCreated: fillDailyBuckets(days, noteRows),
    activeUsers: fillDailyBuckets(days, activeRows),
    scripturePillsCreated: fillDailyBuckets(days, scriptureRows),
  };
}

export async function getUsageDiscovery(daysParam: number): Promise<UsageDiscovery> {
  const days = clampDiscoveryDays(daysParam);
  const since = daysAgoDate(days);

  const activityFilter = sql`${noteActivityAt()} >= ${since.toISOString()}`;

  const [passageRows, bookRows, tagRows, noteRowsForFolders, dictionaryWords, fingerprintDiscovery] =
    await Promise.all([
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
    fetchNotesForTrendingAutoFolders(since),
    fetchDictionaryLookups(since),
    fetchFingerprintDiscovery(since),
  ]);

  return {
    days,
    passages: passageRows.map((r) => ({ name: r.reference, count: Number(r.count) })),
    books: bookRows.filter((r) => r.book).map((r) => ({ name: r.book!, count: Number(r.count) })),
    dictionaryWords,
    tags: tagRows.filter((r) => r.tagName).map((r) => ({ name: r.tagName!, count: Number(r.count) })),
    folders: rankTrendingFolders(noteRowsForFolders, since, 10, true),
    themes: fingerprintDiscovery.themes,
    tones: fingerprintDiscovery.tones,
  };
}
