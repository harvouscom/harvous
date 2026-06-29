/**
 * Study-thread cluster counting (DB) — uses pure graph helpers from @/utils/study-thread-cluster-count.
 */

import {
  db,
  Notes,
  NoteConnections,
  eq,
  and,
  isNotNull,
  sql,
} from '../db';
import { countableUserNotesWhere } from './purge-onboarding-content';
import { isNoteConnectionsTableMissing, isStudyThreadNamingColumnMissing } from './pg-undefined-relation';
import {
  countStudyThreadClustersFromGraph,
  pickRepNoteIdFromGraph,
  type StudyThreadClusterEdge,
} from '@/utils/study-thread-cluster-count';

export type { StudyThreadClusterEdge };
export { countStudyThreadClustersFromGraph, pickRepNoteIdFromGraph } from '@/utils/study-thread-cluster-count';

async function fetchUserClusterInputs(userId: string): Promise<{
  edges: StudyThreadClusterEdge[];
  titledSingletonNoteIds: string[];
}> {
  const [edgeRows, singletonRows] = await Promise.all([
    db
      .select({ fromNoteId: NoteConnections.fromNoteId, toNoteId: NoteConnections.toNoteId })
      .from(NoteConnections)
      .where(eq(NoteConnections.userId, userId)),
    db
      .select({ id: Notes.id })
      .from(Notes)
      .where(
        and(
          eq(Notes.userId, userId),
          eq(Notes.studyThreadUserOverride, true),
          isNotNull(Notes.studyThreadTitle),
          sql`TRIM(COALESCE(${Notes.studyThreadTitle}, '')) <> ''`,
          countableUserNotesWhere(),
        ),
      ),
  ]);

  return {
    edges: edgeRows,
    titledSingletonNoteIds: singletonRows.map((r) => r.id),
  };
}

export async function countStudyThreadClustersForUser(userId: string): Promise<number> {
  try {
    const { edges, titledSingletonNoteIds } = await fetchUserClusterInputs(userId);
    return countStudyThreadClustersFromGraph(edges, titledSingletonNoteIds);
  } catch (error) {
    if (isNoteConnectionsTableMissing(error) || isStudyThreadNamingColumnMissing(error)) {
      return 0;
    }
    throw error;
  }
}

export async function pickRepNoteIdForCluster(userId: string, seedNoteId: string): Promise<string | null> {
  try {
    const { edges } = await fetchUserClusterInputs(userId);
    return pickRepNoteIdFromGraph(seedNoteId, edges);
  } catch (error) {
    if (isNoteConnectionsTableMissing(error) || isStudyThreadNamingColumnMissing(error)) {
      return seedNoteId;
    }
    throw error;
  }
}

/** Platform-wide study-thread cluster count (all users). */
export async function countStudyThreadClustersPlatform(): Promise<number> {
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
    let total = 0;

    for (const userId of userIds) {
      total += countStudyThreadClustersFromGraph(
        edgesByUser.get(userId) ?? [],
        singletonsByUser.get(userId) ?? [],
      );
    }

    return total;
  } catch (error) {
    if (isNoteConnectionsTableMissing(error) || isStudyThreadNamingColumnMissing(error)) {
      return countLegacyThreadsFallback();
    }
    throw error;
  }
}

async function countLegacyThreadsFallback(): Promise<number> {
  const rows = await db.execute<{ count: number }>(sql`
    SELECT COUNT(*)::int AS count FROM "Threads"
    WHERE "id" <> 'thread_unorganized'
      AND NOT starts_with("id"::text, 'thread_onboarding_')
  `);
  return Number(rows[0]?.count ?? 0);
}
