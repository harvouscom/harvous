/**
 * Admin Pulse — community study insight aggregates for the Pulse dashboard.
 */

import {
  db,
  Notes,
  ScriptureMetadata,
  NoteTags,
  Tags,
  MonthlyAnalytics,
  eq,
  and,
  or,
  gte,
  lt,
  isNotNull,
  inArray,
  sql,
} from '../db';
import { countableUserNotesWhere } from './purge-onboarding-content';
import { getTrendingAutoFolders, type DiscoveryRankItem } from './admin-usage-stats';
import {
  attachRankDeltasToListedItems,
  computeCoolingDeltas,
  computeRisingDeltas,
  type ListedRankDelta,
  type RankDelta,
} from '@/utils/admin-pulse-deltas';
import { buildCanonBookGrid, type CanonBookCell } from '@/utils/admin-pulse-heatmap';
import { aggregateCanonGroupCounts, type CanonGroupStat } from '@/utils/admin-pulse-canon-groups';
import { getAdminPulseXp, type PulseXpSummary } from './admin-pulse-xp-stats';
import { getAdminPulseThreadsStats, getAdminPulseThreadsSummaryForReport, type PulseThreadsStats } from './admin-pulse-threads-stats';
import { adminWindowSince, adminWindowPreviousRange, clampAdminDays } from './admin-time-window';
import { filterPulseDiscoveryThemes } from '@/utils/universal-bible-entities';
import { formatPulseThemeLabels } from '@/utils/divine-name-display';
export type PulseHistoryMonth = {
  month: string;
  books: DiscoveryRankItem[];
};

export type AdminPulse = {
  days: number;
  uniquePassages: number;
  books: CanonBookCell[];
  rising: {
    books: RankDelta[];
    passages: RankDelta[];
    themes: RankDelta[];
  };
  cooling: {
    books: RankDelta[];
    passages: RankDelta[];
    themes: RankDelta[];
  };
  curiosity: {
    passages: ListedRankDelta[];
    dictionaryWords: ListedRankDelta[];
    folders: ListedRankDelta[];
    tags: ListedRankDelta[];
    themes: DiscoveryRankItem[];
    tones: DiscoveryRankItem[];
    translations: DiscoveryRankItem[];
  };
  threads: PulseThreadsStats;
  history: PulseHistoryMonth[];
  xp: PulseXpSummary;
  canonGroups: {
    groups: CanonGroupStat[];
    rising: RankDelta[];
    cooling: RankDelta[];
  };
};

function clampPulseDays(daysParam: number): number {
  return clampAdminDays(daysParam);
}

/** Wider prior-period fetch so curiosity deltas capture names outside the current top 10. */
const CURIOSITY_PREV_LIMIT = 50;

function noteActivityAt() {
  return sql`COALESCE(${Notes.updatedAt}, ${Notes.createdAt})`;
}

function activityFilter(since: Date, until?: Date) {
  if (until) {
    return and(
      sql`${noteActivityAt()} >= ${since.toISOString()}`,
      sql`${noteActivityAt()} < ${until.toISOString()}`,
    );
  }
  return sql`${noteActivityAt()} >= ${since.toISOString()}`;
}

async function fetchPassages(since: Date, until?: Date, limit = 10): Promise<DiscoveryRankItem[]> {
  const rows = await db
    .select({
      reference: ScriptureMetadata.reference,
      count: sql<number>`COUNT(DISTINCT ${ScriptureMetadata.noteId})`.as('count'),
    })
    .from(ScriptureMetadata)
    .innerJoin(Notes, eq(ScriptureMetadata.noteId, Notes.id))
    .where(and(activityFilter(since, until), countableUserNotesWhere()))
    .groupBy(ScriptureMetadata.reference)
    .orderBy(sql`COUNT(DISTINCT ${ScriptureMetadata.noteId}) DESC`, ScriptureMetadata.reference)
    .limit(limit);

  return rows.map((r) => ({ name: r.reference, count: Number(r.count) }));
}

async function fetchUniquePassageCount(since: Date, until?: Date): Promise<number> {
  const rows = await db
    .select({
      count: sql<number>`COUNT(DISTINCT ${ScriptureMetadata.reference})`.as('count'),
    })
    .from(ScriptureMetadata)
    .innerJoin(Notes, eq(ScriptureMetadata.noteId, Notes.id))
    .where(and(activityFilter(since, until), countableUserNotesWhere()));

  return Number(rows[0]?.count ?? 0);
}

async function fetchBooks(since: Date, until?: Date, limit?: number): Promise<DiscoveryRankItem[]> {
  const base = db
    .select({
      book: ScriptureMetadata.book,
      count: sql<number>`COUNT(DISTINCT ${ScriptureMetadata.noteId})`.as('count'),
    })
    .from(ScriptureMetadata)
    .innerJoin(Notes, eq(ScriptureMetadata.noteId, Notes.id))
    .where(and(activityFilter(since, until), isNotNull(ScriptureMetadata.book), countableUserNotesWhere()))
    .groupBy(ScriptureMetadata.book)
    .orderBy(sql`COUNT(DISTINCT ${ScriptureMetadata.noteId}) DESC`, ScriptureMetadata.book);

  const rows = limit != null ? await base.limit(limit) : await base;
  return rows.filter((r) => r.book).map((r) => ({ name: r.book!, count: Number(r.count) }));
}

async function fetchThemes(since: Date, until?: Date, limit = 10): Promise<DiscoveryRankItem[]> {
  try {
    const untilClause = until ? sql`AND "computedAt" < ${until.toISOString()}` : sql``;
    const fetchLimit = Math.max(limit * 5, 50);
    const rows = await db.execute<{ name: string; count: number }>(sql`
      SELECT theme AS name, COUNT(*)::int AS count
      FROM (
        SELECT jsonb_array_elements_text("themes"::jsonb) AS theme
        FROM "NoteFingerprints"
        WHERE "themes" IS NOT NULL
          AND "themes" <> '[]'
          AND "computedAt" >= ${since.toISOString()}
          ${untilClause}
      ) t
      WHERE theme <> ''
      GROUP BY theme
      ORDER BY count DESC, theme ASC
      LIMIT ${fetchLimit}
    `);
    return formatPulseThemeLabels(
      filterPulseDiscoveryThemes(
        rows.map((r) => ({ name: r.name, count: Number(r.count) })),
        limit,
      ),
    );
  } catch {
    return [];
  }
}

async function fetchTones(since: Date, until?: Date, limit = 10): Promise<DiscoveryRankItem[]> {
  try {
    const untilClause = until ? sql`AND "computedAt" < ${until.toISOString()}` : sql``;
    const rows = await db.execute<{ name: string; count: number }>(sql`
      SELECT "emotionalTone" AS name, COUNT(*)::int AS count
      FROM "NoteFingerprints"
      WHERE "emotionalTone" IS NOT NULL
        AND TRIM("emotionalTone") <> ''
        AND "computedAt" >= ${since.toISOString()}
        ${untilClause}
      GROUP BY "emotionalTone"
      ORDER BY count DESC, name ASC
      LIMIT ${limit}
    `);
    return rows.map((r) => ({ name: r.name, count: Number(r.count) }));
  } catch {
    return [];
  }
}

async function fetchTags(since: Date, until?: Date, limit = 10): Promise<DiscoveryRankItem[]> {
  const rows = await db
    .select({
      tagName: Tags.name,
      count: sql<number>`COUNT(DISTINCT ${NoteTags.noteId})`.as('count'),
    })
    .from(NoteTags)
    .innerJoin(Tags, eq(NoteTags.tagId, Tags.id))
    .innerJoin(Notes, eq(NoteTags.noteId, Notes.id))
    .where(
      and(
        activityFilter(since, until),
        or(eq(NoteTags.isAutoGenerated, true), eq(Tags.isSystem, true)),
        countableUserNotesWhere(),
      ),
    )
    .groupBy(Tags.name)
    .orderBy(sql`COUNT(DISTINCT ${NoteTags.noteId}) DESC`, Tags.name)
    .limit(limit);

  return rows.filter((r) => r.tagName).map((r) => ({ name: r.tagName!, count: Number(r.count) }));
}

async function fetchTranslations(since: Date, until?: Date): Promise<DiscoveryRankItem[]> {
  const scriptureSince = until
    ? and(gte(ScriptureMetadata.createdAt, since), lt(ScriptureMetadata.createdAt, until))
    : gte(ScriptureMetadata.createdAt, since);

  const rows = await db
    .select({
      translation: ScriptureMetadata.translation,
      count: sql<number>`COUNT(*)`.as('count'),
    })
    .from(ScriptureMetadata)
    .innerJoin(Notes, eq(ScriptureMetadata.noteId, Notes.id))
    .where(and(scriptureSince, countableUserNotesWhere()))
    .groupBy(ScriptureMetadata.translation)
    .orderBy(sql`COUNT(*) DESC`, ScriptureMetadata.translation)
    .limit(8);

  return rows
    .filter((r) => r.translation)
    .map((r) => ({ name: r.translation!, count: Number(r.count) }));
}

async function fetchDictionaryWords(
  since: Date,
  until?: Date,
  limit = 10,
): Promise<DiscoveryRankItem[]> {
  try {
    const untilClause = until ? sql`AND COALESCE("updatedAt", "createdAt") < ${until.toISOString()}` : sql``;
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
      ${untilClause}
      AND TRIM(COALESCE(
        NULLIF(TRIM("sourceSnippet"), ''),
        NULLIF(TRIM("anchorTextSnapshot"), ''),
        NULLIF(TRIM("focusTitle"), '')
      )) <> ''
    GROUP BY 1
    ORDER BY count DESC, name ASC
    LIMIT ${limit}
  `);
    return rows.map((row) => ({ name: row.name, count: Number(row.count) }));
  } catch {
    return [];
  }
}

async function fetchPulseHistory(months: number): Promise<PulseHistoryMonth[]> {
  const now = new Date();
  const monthKeys: string[] = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    monthKeys.push(`${year}-${month}`);
  }

  const rows = await db
    .select({
      month: MonthlyAnalytics.month,
      bookName: MonthlyAnalytics.bookName,
      count: MonthlyAnalytics.count,
    })
    .from(MonthlyAnalytics)
    .where(and(eq(MonthlyAnalytics.category, 'book'), inArray(MonthlyAnalytics.month, monthKeys)))
    .orderBy(MonthlyAnalytics.month, sql`${MonthlyAnalytics.count} DESC`);

  const byMonth = new Map<string, DiscoveryRankItem[]>();
  for (const key of monthKeys) byMonth.set(key, []);

  for (const row of rows) {
    if (!row.bookName) continue;
    const list = byMonth.get(row.month) ?? [];
    if (list.length >= 3) continue;
    list.push({ name: row.bookName, count: Number(row.count) });
    byMonth.set(row.month, list);
  }

  return monthKeys.map((month) => ({ month, books: byMonth.get(month) ?? [] }));
}

export async function getAdminPulse(daysParam: number): Promise<AdminPulse> {
  const days = clampPulseDays(daysParam);
  const currentSince = adminWindowSince(days);
  const { since: previousSince, until: previousUntil } = adminWindowPreviousRange(days);

  const [
    uniquePassages,
    currentPassages,
    previousPassages,
    currentBooks,
    previousBooks,
    previousAllBooks,
    allBookCounts,
    currentThemes,
    previousThemes,
    tones,
    tags,
    dictionaryWords,
    folders,
    translations,
    history,
    previousPassagesWide,
    previousTags,
    previousDictionaryWords,
    previousFolders,
    threads,
  ] = await Promise.all([
    fetchUniquePassageCount(currentSince),
    fetchPassages(currentSince, undefined, 10),
    fetchPassages(previousSince, previousUntil, 10),
    fetchBooks(currentSince, undefined, 10),
    fetchBooks(previousSince, previousUntil, 10),
    fetchBooks(previousSince, previousUntil),
    fetchBooks(currentSince, undefined),
    fetchThemes(currentSince, undefined, 10),
    fetchThemes(previousSince, previousUntil, 10),
    fetchTones(currentSince, undefined, 10),
    fetchTags(currentSince, undefined),
    fetchDictionaryWords(currentSince, undefined),
    getTrendingAutoFolders(currentSince, 10),
    fetchTranslations(currentSince, undefined),
    fetchPulseHistory(6),
    fetchPassages(previousSince, previousUntil, CURIOSITY_PREV_LIMIT),
    fetchTags(previousSince, previousUntil, CURIOSITY_PREV_LIMIT),
    fetchDictionaryWords(previousSince, previousUntil, CURIOSITY_PREV_LIMIT),
    getTrendingAutoFolders(previousSince, CURIOSITY_PREV_LIMIT, previousUntil),
    getAdminPulseThreadsStats(currentSince),
  ]);

  const risingBooks = computeRisingDeltas(currentBooks, previousBooks, 5);
  const risingPassages = computeRisingDeltas(currentPassages, previousPassages, 5);
  const risingThemes = computeRisingDeltas(currentThemes, previousThemes, 5);
  const xp = await getAdminPulseXp(days, currentSince, previousSince, previousUntil);

  const canonGroupCurrent = aggregateCanonGroupCounts(allBookCounts);
  const canonGroupPrevious = aggregateCanonGroupCounts(previousAllBooks);
  const canonGroupItems = canonGroupCurrent.map((group) => ({ name: group.label, count: group.count }));
  const canonGroupPreviousItems = canonGroupPrevious.map((group) => ({ name: group.label, count: group.count }));

  return {
    days,
    uniquePassages,
    books: buildCanonBookGrid(allBookCounts),
    rising: {
      books: risingBooks,
      passages: risingPassages,
      themes: risingThemes,
    },
    cooling: {
      books: computeCoolingDeltas(currentBooks, previousBooks, 5),
      passages: computeCoolingDeltas(currentPassages, previousPassages, 5),
      themes: computeCoolingDeltas(currentThemes, previousThemes, 5),
    },
    curiosity: {
      passages: attachRankDeltasToListedItems(currentPassages, previousPassagesWide),
      dictionaryWords: attachRankDeltasToListedItems(dictionaryWords, previousDictionaryWords),
      folders: attachRankDeltasToListedItems(folders, previousFolders),
      tags: attachRankDeltasToListedItems(tags, previousTags),
      themes: currentThemes,
      tones,
      translations,
    },
    threads,
    history,
    xp,
    canonGroups: {
      groups: canonGroupCurrent,
      rising: computeRisingDeltas(canonGroupItems, canonGroupPreviousItems, 5),
      cooling: computeCoolingDeltas(canonGroupItems, canonGroupPreviousItems, 5),
    },
  };
}

export type PulseReportMetrics = {
  uniquePassages: number;
  books: DiscoveryRankItem[];
  themes: DiscoveryRankItem[];
  passages: DiscoveryRankItem[];
  tags: DiscoveryRankItem[];
  translations: DiscoveryRankItem[];
  threads: PulseThreadsStats;
};

/** Fixed calendar range snapshot for monthly admin reports (skips heavy theme/translation scans). */
export async function getPulseReportMetricsForSnapshot(since: Date, until: Date): Promise<PulseReportMetrics> {
  const emptyRecall: PulseThreadsStats['recall'] = {
    impressions: 0,
    opens: 0,
    snoozes: 0,
    snoozeRatePct: 0,
    impressionsByKind: [],
    opensByKind: [],
  };
  const [uniquePassages, books, passages, tags, threadSummary] = await Promise.all([
    fetchUniquePassageCount(since, until),
    fetchBooks(since, until, 10),
    fetchPassages(since, until, 10),
    fetchTags(since, until, 10),
    getAdminPulseThreadsSummaryForReport(since, until),
  ]);
  return {
    uniquePassages,
    books,
    themes: [],
    passages,
    tags,
    translations: [],
    threads: { summary: threadSummary, themes: [], recall: emptyRecall },
  };
}

/** Fixed calendar range snapshot for monthly admin reports. */
export async function getPulseReportMetrics(since: Date, until: Date): Promise<PulseReportMetrics> {
  const emptyRecall: PulseThreadsStats['recall'] = {
    impressions: 0,
    opens: 0,
    snoozes: 0,
    snoozeRatePct: 0,
    impressionsByKind: [],
    opensByKind: [],
  };
  const [uniquePassages, books, themes, passages, tags, translations, threadSummary] = await Promise.all([
    fetchUniquePassageCount(since, until),
    fetchBooks(since, until, 10),
    fetchThemes(since, until, 10),
    fetchPassages(since, until, 10),
    fetchTags(since, until, 10),
    fetchTranslations(since, until),
    getAdminPulseThreadsSummaryForReport(since, until),
  ]);
  return {
    uniquePassages,
    books,
    themes,
    passages,
    tags,
    translations: translations.slice(0, 5),
    threads: { summary: threadSummary, themes: [], recall: emptyRecall },
  };
}

async function fetchMonthlyAnalyticsRank(
  monthKey: string,
  category: 'book' | 'tag',
  limit: number,
): Promise<DiscoveryRankItem[]> {
  const nameCol = category === 'book' ? MonthlyAnalytics.bookName : MonthlyAnalytics.tagName;
  const rows = await db
    .select({ name: nameCol, count: MonthlyAnalytics.count })
    .from(MonthlyAnalytics)
    .where(and(eq(MonthlyAnalytics.month, monthKey), eq(MonthlyAnalytics.category, category)))
    .orderBy(sql`${MonthlyAnalytics.count} DESC`)
    .limit(limit);
  return rows.filter((r) => r.name).map((r) => ({ name: r.name!, count: Number(r.count) }));
}

export async function getMonthlyAnalyticsForReport(monthKey: string): Promise<{
  books: DiscoveryRankItem[];
  tags: DiscoveryRankItem[];
}> {
  const [books, tags] = await Promise.all([
    fetchMonthlyAnalyticsRank(monthKey, 'book', 10),
    fetchMonthlyAnalyticsRank(monthKey, 'tag', 10),
  ]);
  return { books, tags };
}
