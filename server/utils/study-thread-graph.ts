import { db, NoteConnections, eq, and, or, inArray } from '../db';

export type StudyThreadGraphEdge = { fromId: string; toId: string };

export type StudyThreadGraph = {
  nodeIds: string[];
  edges: StudyThreadGraphEdge[];
  degreeMap: Map<string, number>;
};

/**
 * Bidirectional BFS over NoteConnections. When spaceId is set, only edges in that
 * space are traversed (matches GET /api/spaces/:id/study-threads).
 */
export async function collectStudyThreadGraph(
  startNoteId: string,
  userId: string,
  options?: { spaceId?: string | null; maxNodes?: number },
): Promise<StudyThreadGraph> {
  const maxNodes = options?.maxNodes ?? 200;
  const spaceId = options?.spaceId?.trim() || null;

  const visited = new Set<string>([startNoteId]);
  const collectedEdges: StudyThreadGraphEdge[] = [];
  let frontier = [startNoteId];

  while (frontier.length > 0 && visited.size < maxNodes) {
    const edgeConditions = [
      eq(NoteConnections.userId, userId),
      or(
        inArray(NoteConnections.fromNoteId, frontier),
        inArray(NoteConnections.toNoteId, frontier),
      ),
    ];
    if (spaceId) {
      edgeConditions.push(eq(NoteConnections.spaceId, spaceId));
    }

    const edgeRows = await db
      .select({ fromNoteId: NoteConnections.fromNoteId, toNoteId: NoteConnections.toNoteId })
      .from(NoteConnections)
      .where(and(...edgeConditions));

    const next: string[] = [];
    for (const edge of edgeRows) {
      collectedEdges.push({ fromId: edge.fromNoteId, toId: edge.toNoteId });
      for (const neighbor of [edge.fromNoteId, edge.toNoteId]) {
        if (!visited.has(neighbor) && visited.size < maxNodes) {
          visited.add(neighbor);
          next.push(neighbor);
        }
      }
    }
    frontier = [...new Set(next)];
  }

  const edgeSet = new Set<string>();
  const uniqueEdges = collectedEdges.filter((e) => {
    const key = `${e.fromId}:${e.toId}`;
    if (edgeSet.has(key)) return false;
    edgeSet.add(key);
    return true;
  });

  const degreeMap = new Map<string, number>();
  for (const e of uniqueEdges) {
    degreeMap.set(e.fromId, (degreeMap.get(e.fromId) ?? 0) + 1);
    degreeMap.set(e.toId, (degreeMap.get(e.toId) ?? 0) + 1);
  }

  return { nodeIds: [...visited], edges: uniqueEdges, degreeMap };
}
