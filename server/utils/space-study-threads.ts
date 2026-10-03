/**
 * The study threads of one space: connected components of the viewer's NoteConnections
 * graph, plus singleton notes the viewer titled as a thread on purpose.
 *
 * Lifted out of `GET /api/spaces/:spaceId/study-threads` so the Connector's
 * `list_study_thread_connections` tool (server/connector/) reads the same clusters the
 * sidebar shows rather than a second implementation of them. Read-only: the caller has
 * already checked access with `requireSpaceAccess`.
 */

import { db, Notes, ResourceMetadata, NoteConnections, eq, and, inArray, sql, isNotNull } from '../db';
import {
  NOT_ONBOARDING_NOTES_THREAD,
  NOT_ONBOARDING_SYSTEM_NOTES,
} from './purge-onboarding-content';
import {
  pickStudyThreadRepresentativeNoteId,
  type StudyThreadSuggestNode,
} from '@/utils/suggest-study-thread-title';
import { fetchStudyThreadNoteRows } from './study-thread-note-rows';
import { noteConnectionEndpointsLive } from './live-note-connections';
import { resolveStudyThreadClusterNaming } from './study-thread-cluster-naming';
import { sortStudyThreadClustersByTitle } from '@/utils/sorting';
import { noteBodyUnlessLocked } from './note-lock-guards';

export async function listStudyThreadsForSpace(userId: string, spaceIdNorm: string) {
  // Load this user's NoteConnections in this space, keeping only rows whose notes both still
  // exist. A row pointing at a deleted note used to become a listed Thread — its id was the
  // deleted note whenever the tie-break picked it — that 404'd on GET /api/notes/:id/thread.
  const edges = await db
    .select({ fromNoteId: NoteConnections.fromNoteId, toNoteId: NoteConnections.toNoteId })
    .from(NoteConnections)
    .where(
      and(
        eq(NoteConnections.userId, userId),
        eq(NoteConnections.spaceId, spaceIdNorm),
        noteConnectionEndpointsLive(),
      ),
    );

  // Build adjacency list and degree count.
  const adj = new Map<string, Set<string>>();
  const degree = new Map<string, number>();
  for (const e of edges) {
    if (!adj.has(e.fromNoteId)) adj.set(e.fromNoteId, new Set());
    if (!adj.has(e.toNoteId)) adj.set(e.toNoteId, new Set());
    adj.get(e.fromNoteId)!.add(e.toNoteId);
    adj.get(e.toNoteId)!.add(e.fromNoteId);
    degree.set(e.fromNoteId, (degree.get(e.fromNoteId) ?? 0) + 1);
    degree.set(e.toNoteId, (degree.get(e.toNoteId) ?? 0) + 1);
  }

  // BFS to find connected components.
  const allNodeIds = [...adj.keys()];
  const visited = new Set<string>();
  const components: string[][] = [];
  for (const start of allNodeIds) {
    if (visited.has(start)) continue;
    const component: string[] = [];
    const queue = [start];
    visited.add(start);
    while (queue.length > 0) {
      const node = queue.shift()!;
      component.push(node);
      for (const neighbor of adj.get(node) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    components.push(component);
  }

  const connectedNodeIds = new Set(components.flat());
  const repIds = components.map((members) => pickStudyThreadRepresentativeNoteId(members, degree)!);

  const allMemberIds = [...connectedNodeIds];
  const memberRows = allMemberIds.length > 0 ? await fetchStudyThreadNoteRows(allMemberIds, userId) : [];

  const memberMap = new Map(memberRows.map((r) => [r.id, r]));

  const resourceIds = memberRows.filter((n) => n.noteType === 'resource').map((n) => n.id);
  let resourceMap: Record<
    string,
    { sourceTitle: string | null; sourceDescription: string | null }
  > = {};
  if (resourceIds.length > 0) {
    try {
      const rmList = await db
        .select({
          noteId: ResourceMetadata.noteId,
          sourceTitle: ResourceMetadata.sourceTitle,
          sourceDescription: ResourceMetadata.sourceDescription,
        })
        .from(ResourceMetadata)
        .where(inArray(ResourceMetadata.noteId, resourceIds));
      resourceMap = Object.fromEntries(rmList.map((m) => [m.noteId, m]));
    } catch {
      resourceMap = {};
    }
  }

  const toSuggestNode = (id: string): StudyThreadSuggestNode | null => {
    const n = memberMap.get(id);
    if (!n) return null;
    const rm = n.noteType === 'resource' ? resourceMap[n.id] : null;
    return {
      id: n.id,
      title: n.title,
      content: n.content,
      noteType: n.noteType,
      resourceTitle: rm?.sourceTitle ?? null,
      resourceDescription: rm?.sourceDescription ?? null,
      updatedAt: n.updatedAt ? n.updatedAt.toISOString() : null,
    };
  };

  // Build response from connected components, then merge singleton titled notes.
  const connectedThreads = sortStudyThreadClustersByTitle(
    components.map((members, i) => {
      const repId = repIds[i];
      const rep = memberMap.get(repId);
      const clusterMemberRows = members
        .map((id) => memberMap.get(id))
        .filter((row): row is NonNullable<typeof row> => row != null);
      const suggestNodes = members.map(toSuggestNode).filter((n): n is StudyThreadSuggestNode => n != null);
      const naming = resolveStudyThreadClusterNaming(clusterMemberRows, suggestNodes, repId);
      return {
        id: repId,
        title: naming.threadTitle,
        suggestedTitle: naming.suggestedTitle,
        hasCustomTitle: naming.studyThreadUserOverride,
        studyThreadPinned: naming.studyThreadPinned,
        noteCount: members.length,
        updatedAt: rep?.updatedAt ? rep.updatedAt.toISOString() : null,
        memberIds: members,
      };
    }),
  );

  const singletonRows = await db
    .select({
      id: Notes.id,
      title: Notes.title,
      content: noteBodyUnlessLocked,
      noteType: Notes.noteType,
      updatedAt: Notes.updatedAt,
      studyThreadTitle: Notes.studyThreadTitle,
      studyThreadUserOverride: Notes.studyThreadUserOverride,
      studyThreadPinned: Notes.studyThreadPinned,
    })
    .from(Notes)
    .where(
      and(
        eq(Notes.userId, userId),
        eq(Notes.spaceId, spaceIdNorm),
        eq(Notes.studyThreadUserOverride, true),
        isNotNull(Notes.studyThreadTitle),
        sql`TRIM(COALESCE(${Notes.studyThreadTitle}, '')) <> ''`,
        NOT_ONBOARDING_NOTES_THREAD,
        NOT_ONBOARDING_SYSTEM_NOTES,
      ),
    );

  const singletonThreads = singletonRows
    .filter((row) => !connectedNodeIds.has(row.id))
    .map((row) => ({
      id: row.id,
      title: (row.studyThreadTitle ?? '').trim() || null,
      suggestedTitle: row.title?.trim() || null,
      hasCustomTitle: true,
      studyThreadPinned: Boolean(row.studyThreadPinned),
      noteCount: 1,
      updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
      memberIds: [row.id],
    }));

  return sortStudyThreadClustersByTitle([...connectedThreads, ...singletonThreads]);
}
