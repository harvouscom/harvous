/**
 * Admin Pulse — platform thread trends (NoteConnections clusters, themes, Home recall).
 */

import { db, NoteConnections, Notes, eq, and, isNotNull, sql } from '../db';
import { COUNTABLE_USER_NOTES_N_SQL, countableUserNotesWhere } from './purge-onboarding-content';
import {
  isNoteConnectionsTableMissing,
  isRecallEventsTableMissing,
  isNoteFingerprintsTableMissing,
  isStudyThreadNamingColumnMissing,
} from './pg-undefined-relation';
import type { DiscoveryRankItem } from './admin-usage-stats';
import { recallSnoozeRatePct } from './admin-usage-stats';
import { filterPulseDiscoveryThemes } from '@/utils/universal-bible-entities';
import { formatPulseThemeLabels } from '@/utils/divine-name-display';
import { recallKindDisplayLabel } from '@/utils/recall-opportunity-kinds';
import {
  activeThreadClustersInWindow,
  averageMemberCount,
  clusterMemberSetsFromEdges,
  countStudyThreadClustersFromGraph,
  type StudyThreadClusterEdge,
  type StudyThreadClusterEdgeWithCreated,
} from '@/utils/study-thread-cluster-count';

/** Home recall kinds that surface thread / connection study opportunities. */
const THREAD_RECALL_KINDS = ['connectNotes', 'arc', 'subject', 'crossref', 'crossrefGap'] as const;

export type PulseThreadsSummary = {
  /** Connected clusters + titled singletons — matches sidebar Threads count. */
  totalThreads: number;
  avgNotesPerThread: number;
  linksCreated: number;
  threadsLinkedInWindow: number;
  notesInThreads: number;
};

export type PulseThreadsRecall = {
  impressions: number;
  opens: number;
  snoozes: number;
  snoozeRatePct: number;
  impressionsByKind: DiscoveryRankItem[];
  opensByKind: DiscoveryRankItem[];
};

export type PulseThreadsStats = {
  summary: PulseThreadsSummary;
  themes: DiscoveryRankItem[];
  recall: PulseThreadsRecall;
};

type PlatformThreadSnapshot = {
  totalThreads: number;
  avgNotesPerThread: number;
  threadNoteIds: string[];
};

type WindowLinkActivity = {
  linksCreated: number;
  threadsLinkedInWindow: number;
};

async function fetchPlatformThreadSnapshot(): Promise<PlatformThreadSnapshot> {
  const empty: PlatformThreadSnapshot = { totalThreads: 0, avgNotesPerThread: 0, threadNoteIds: [] };
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

    const edgesByUser = new Map<string, StudyThreadClusterEdge[]>();
    for (const row of edgeRows) {
      const list = edgesByUser.get(row.userId) ?? [];
      list.push({ fromNoteId: row.fromNoteId, toNoteId: row.toNoteId });
      edgesByUser.set(row.userId, list);
    }

    const singletonsByUser = new Map<string, string[]>();
    for (const row of singletonRows) {
      const list = singletonsByUser.get(row.userId) ?? [];
      list.push(row.id);
      singletonsByUser.set(row.userId, list);
    }

    const userIds = new Set([...edgesByUser.keys(), ...singletonsByUser.keys()]);
    let totalThreads = 0;
    const multiNoteClusters: Set<string>[] = [];

    for (const userId of userIds) {
      const edges = edgesByUser.get(userId) ?? [];
      const singletons = singletonsByUser.get(userId) ?? [];
      totalThreads += countStudyThreadClustersFromGraph(edges, singletons);
      multiNoteClusters.push(...clusterMemberSetsFromEdges(edges));
    }

    const threadNoteIds = [...new Set(multiNoteClusters.flatMap((cluster) => [...cluster]))];

    return {
      totalThreads,
      avgNotesPerThread: averageMemberCount(multiNoteClusters),
      threadNoteIds,
    };
  } catch (error) {
    if (isNoteConnectionsTableMissing(error) || isStudyThreadNamingColumnMissing(error)) {
      return empty;
    }
    throw error;
  }
}

async function fetchWindowLinkActivity(since: Date, until?: Date): Promise<WindowLinkActivity> {
  const sinceIso = since.toISOString();
  const untilClause = until ? sql`AND "createdAt" < ${until.toISOString()}` : sql``;
  try {
    const linkRows = await db.execute<{ count: number }>(sql`
      SELECT COUNT(*)::int AS count FROM "NoteConnections"
      WHERE "createdAt" >= ${sinceIso} ${untilClause}
    `);
    const linksCreated = Number(linkRows[0]?.count ?? 0);
    if (linksCreated === 0) {
      return { linksCreated: 0, threadsLinkedInWindow: 0 };
    }

    const edgeRows = await db
      .select({
        userId: NoteConnections.userId,
        fromNoteId: NoteConnections.fromNoteId,
        toNoteId: NoteConnections.toNoteId,
        createdAt: NoteConnections.createdAt,
      })
      .from(NoteConnections)
      .where(
        sql`${NoteConnections.userId} IN (
          SELECT DISTINCT "userId" FROM "NoteConnections"
          WHERE "createdAt" >= ${sinceIso} ${untilClause}
        )`,
      );

    const sinceMs = since.getTime();
    const untilMs = until?.getTime();
    const edgesByUser = new Map<string, StudyThreadClusterEdgeWithCreated[]>();
    for (const row of edgeRows) {
      const list = edgesByUser.get(row.userId) ?? [];
      list.push({
        fromNoteId: row.fromNoteId,
        toNoteId: row.toNoteId,
        createdAt: row.createdAt,
      });
      edgesByUser.set(row.userId, list);
    }

    let threadsLinkedInWindow = 0;
    for (const edges of edgesByUser.values()) {
      threadsLinkedInWindow += activeThreadClustersInWindow(edges, sinceMs, untilMs).length;
    }

    return { linksCreated, threadsLinkedInWindow };
  } catch (error) {
    if (isNoteConnectionsTableMissing(error)) {
      return { linksCreated: 0, threadsLinkedInWindow: 0 };
    }
    throw error;
  }
}

/** Max note IDs passed to thread theme SQL — avoids oversized IN clauses. */
const MAX_THREAD_THEME_NOTE_IDS = 500;

async function fetchThreadThemes(threadNoteIds: string[], limit = 8): Promise<DiscoveryRankItem[]> {
  if (threadNoteIds.length === 0) return [];
  if (threadNoteIds.length > MAX_THREAD_THEME_NOTE_IDS) return [];

  try {
    const fetchLimit = Math.max(limit * 5, 40);
    const noteIdList = sql.join(threadNoteIds.map((noteId) => sql`${noteId}`), sql`, `);
    const rows = await db.execute<{ name: string; count: number }>(sql`
      SELECT theme AS name, COUNT(DISTINCT "noteId")::int AS count
      FROM (
        SELECT nf."noteId", jsonb_array_elements_text(nf."themes"::jsonb) AS theme
        FROM "NoteFingerprints" nf
        INNER JOIN "Notes" n ON n."id" = nf."noteId"
        WHERE nf."noteId" IN (${noteIdList})
          AND ${COUNTABLE_USER_NOTES_N_SQL}
          AND nf."themes" IS NOT NULL
          AND nf."themes" <> '[]'
      ) expanded
      WHERE theme <> ''
      GROUP BY theme
      ORDER BY count DESC, theme ASC
      LIMIT ${fetchLimit}
    `);
    return formatPulseThemeLabels(
      filterPulseDiscoveryThemes(rows.map((row) => ({ name: row.name, count: Number(row.count) }))),
    ).slice(0, limit);
  } catch (error) {
    if (isNoteConnectionsTableMissing(error) || isNoteFingerprintsTableMissing(error)) {
      return [];
    }
    throw error;
  }
}

async function fetchThreadRecallMetrics(since: Date, until?: Date): Promise<PulseThreadsRecall> {
  const sinceIso = since.toISOString();
  const untilClause = until ? sql`AND "createdAt" < ${until.toISOString()}` : sql``;
  const kindList = sql.join(THREAD_RECALL_KINDS.map((kind) => sql`${kind}`), sql`, `);
  const empty: PulseThreadsRecall = {
    impressions: 0,
    opens: 0,
    snoozes: 0,
    snoozeRatePct: 0,
    impressionsByKind: [],
    opensByKind: [],
  };
  try {
    const [summaryRows, impressionKindRows, openKindRows] = await Promise.all([
      db.execute<{ impressions: number; opens: number; snoozes: number }>(sql`
        SELECT
          (SELECT COUNT(*)::int FROM "RecallEvents"
            WHERE "action" = 'impression' AND "createdAt" >= ${sinceIso} ${untilClause}
              AND "kind" IN (${kindList})) AS impressions,
          (SELECT COUNT(*)::int FROM "RecallEvents"
            WHERE "action" = 'open' AND "createdAt" >= ${sinceIso} ${untilClause}
              AND "kind" IN (${kindList})) AS opens,
          (SELECT COUNT(*)::int FROM "RecallEvents"
            WHERE "action" = 'snooze' AND "createdAt" >= ${sinceIso} ${untilClause}
              AND "kind" IN (${kindList})) AS snoozes
      `),
      db.execute<{ kind: string; count: number }>(sql`
        SELECT "kind", COUNT(*)::int AS count
        FROM "RecallEvents"
        WHERE "action" = 'impression' AND "createdAt" >= ${sinceIso} ${untilClause}
          AND "kind" IN (${kindList})
        GROUP BY "kind"
        ORDER BY count DESC, "kind" ASC
        LIMIT 6
      `),
      db.execute<{ kind: string; count: number }>(sql`
        SELECT "kind", COUNT(*)::int AS count
        FROM "RecallEvents"
        WHERE "action" = 'open' AND "createdAt" >= ${sinceIso} ${untilClause}
          AND "kind" IN (${kindList})
        GROUP BY "kind"
        ORDER BY count DESC, "kind" ASC
        LIMIT 6
      `),
    ]);
    const impressions = Number(summaryRows[0]?.impressions ?? 0);
    const opens = Number(summaryRows[0]?.opens ?? 0);
    const snoozes = Number(summaryRows[0]?.snoozes ?? 0);
    return {
      impressions,
      opens,
      snoozes,
      snoozeRatePct: recallSnoozeRatePct(opens, snoozes),
      impressionsByKind: impressionKindRows.map((row) => ({
        name: recallKindDisplayLabel(row.kind),
        count: Number(row.count),
      })),
      opensByKind: openKindRows.map((row) => ({
        name: recallKindDisplayLabel(row.kind),
        count: Number(row.count),
      })),
    };
  } catch (error) {
    if (isRecallEventsTableMissing(error)) {
      return empty;
    }
    throw error;
  }
}

export async function getAdminPulseThreadsStats(since: Date, until?: Date): Promise<PulseThreadsStats> {
  const [snapshot, windowActivity, recall] = await Promise.all([
    fetchPlatformThreadSnapshot(),
    fetchWindowLinkActivity(since, until),
    fetchThreadRecallMetrics(since, until),
  ]);
  const themes = await fetchThreadThemes(snapshot.threadNoteIds);
  return {
    summary: {
      totalThreads: snapshot.totalThreads,
      avgNotesPerThread: snapshot.avgNotesPerThread,
      linksCreated: windowActivity.linksCreated,
      threadsLinkedInWindow: windowActivity.threadsLinkedInWindow,
      notesInThreads: snapshot.threadNoteIds.length,
    },
    themes,
    recall,
  };
}

/** Monthly report thread summary — window-scoped SQL counts only (avoids full-platform graph scan). */
export async function getAdminPulseThreadsSummaryForReport(
  since: Date,
  until: Date,
): Promise<PulseThreadsSummary> {
  const empty: PulseThreadsSummary = {
    totalThreads: 0,
    avgNotesPerThread: 0,
    linksCreated: 0,
    threadsLinkedInWindow: 0,
    notesInThreads: 0,
  };
  try {
    const sinceIso = since.toISOString();
    const untilIso = until.toISOString();
    const rows = await db.execute<{ links_created: number; users_with_links: number }>(sql`
      SELECT
        (SELECT COUNT(*)::int FROM "NoteConnections"
          WHERE "createdAt" >= ${sinceIso} AND "createdAt" < ${untilIso}) AS links_created,
        (SELECT COUNT(DISTINCT "userId")::int FROM "NoteConnections"
          WHERE "createdAt" >= ${sinceIso} AND "createdAt" < ${untilIso}) AS users_with_links
    `);
    const linksCreated = Number(rows[0]?.links_created ?? 0);
    const usersWithLinks = Number(rows[0]?.users_with_links ?? 0);
    return {
      totalThreads: usersWithLinks,
      avgNotesPerThread: 0,
      linksCreated,
      threadsLinkedInWindow: usersWithLinks,
      notesInThreads: 0,
    };
  } catch (error) {
    if (isNoteConnectionsTableMissing(error)) {
      return empty;
    }
    throw error;
  }
}

/** @internal test helper — clusters touched by new links in window. */
export function pulseActiveThreadClustersForUser(
  edges: StudyThreadClusterEdgeWithCreated[],
  since: Date,
  until?: Date,
): Set<string>[] {
  return activeThreadClustersInWindow(edges, since.getTime(), until?.getTime());
}
