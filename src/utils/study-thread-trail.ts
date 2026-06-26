export interface StudyThreadTrailNode {
  id: string;
  updatedAt: string | null;
}

export interface StudyThreadTrailEdge {
  fromId: string;
  toId: string;
  createdAt?: string | null;
}

export type StudyThreadTrail<T extends StudyThreadTrailNode> = {
  /** Furthest → nearest (linked-from chain). */
  upstream: T[];
  focus: T | null;
  /** Nearest → furthest (links-to chain). */
  downstream: T[];
  /** Branches, cycles, and off-path nodes. */
  alsoConnected: T[];
};

function timestampMs(value: string | null | undefined): number {
  if (!value) return 0;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

function compareByUpdatedAtDesc<T extends StudyThreadTrailNode>(a: T, b: T): number {
  return timestampMs(b.updatedAt) - timestampMs(a.updatedAt);
}

function compareEdgesByCreatedAtAsc(a: StudyThreadTrailEdge, b: StudyThreadTrailEdge): number {
  return timestampMs(a.createdAt) - timestampMs(b.createdAt);
}

function edgeBetween(
  fromId: string,
  toId: string,
  edges: StudyThreadTrailEdge[],
): StudyThreadTrailEdge | undefined {
  return edges.find((e) => e.fromId === fromId && e.toId === toId);
}

function pickUpstreamParent<T extends StudyThreadTrailNode>(
  currentId: string,
  parentIds: string[],
  edges: StudyThreadTrailEdge[],
  nodeById: Map<string, T>,
): T | null {
  const incoming = edges
    .filter((e) => e.toId === currentId && parentIds.includes(e.fromId))
    .sort(compareEdgesByCreatedAtAsc);

  if (incoming.length > 0) {
    const fromId = incoming[0]!.fromId;
    return nodeById.get(fromId) ?? null;
  }

  const nodes = parentIds.map((id) => nodeById.get(id)).filter((n): n is T => Boolean(n));
  if (nodes.length === 0) return null;
  nodes.sort(compareByUpdatedAtDesc);
  return nodes[0] ?? null;
}

function walkUpstream<T extends StudyThreadTrailNode>(
  focusId: string,
  nodeById: Map<string, T>,
  edges: StudyThreadTrailEdge[],
): T[] {
  const chainNearestFirst: T[] = [];
  const visited = new Set<string>([focusId]);
  let current = focusId;

  while (true) {
    const parentIds = edges
      .filter((e) => e.toId === current)
      .map((e) => e.fromId)
      .filter((id) => !visited.has(id));

    const next = pickUpstreamParent(current, parentIds, edges, nodeById);
    if (!next) break;

    chainNearestFirst.push(next);
    visited.add(next.id);
    current = next.id;
  }

  return chainNearestFirst.reverse();
}

function collectDownstream<T extends StudyThreadTrailNode>(
  focusId: string,
  nodeById: Map<string, T>,
  edges: StudyThreadTrailEdge[],
  excludeIds: Set<string>,
): T[] {
  const result: T[] = [];
  const visited = new Set<string>([focusId, ...excludeIds]);
  let frontier = [focusId];

  while (frontier.length > 0) {
    const nextFrontier: string[] = [];
    const levelEntries: Array<{ node: T; edge: StudyThreadTrailEdge }> = [];

    for (const current of frontier) {
      const outgoing = edges
        .filter((e) => e.fromId === current && !visited.has(e.toId))
        .sort(compareEdgesByCreatedAtAsc);

      for (const edge of outgoing) {
        const n = nodeById.get(edge.toId);
        if (!n) continue;
        visited.add(edge.toId);
        levelEntries.push({ node: n, edge });
        nextFrontier.push(edge.toId);
      }
    }

    levelEntries.sort((a, b) => compareEdgesByCreatedAtAsc(a.edge, b.edge));
    result.push(...levelEntries.map((entry) => entry.node));
    frontier = nextFrontier;
  }

  return result;
}

function connectionOrderMs(
  nodeId: string,
  focusId: string,
  edges: StudyThreadTrailEdge[],
): number {
  const direct = edgeBetween(focusId, nodeId, edges) ?? edgeBetween(nodeId, focusId, edges);
  if (direct?.createdAt) return timestampMs(direct.createdAt);

  const related = edges
    .filter((e) => e.fromId === nodeId || e.toId === nodeId)
    .sort(compareEdgesByCreatedAtAsc);
  return related[0] ? timestampMs(related[0].createdAt) : 0;
}

/**
 * Builds a direction-aware trail from a study-thread graph anchored on focusNoteId.
 * Upstream follows incoming edges (linked from); downstream follows outgoing edges (links to).
 * Sibling order uses connection createdAt (oldest first).
 */
export function buildStudyThreadTrail<T extends StudyThreadTrailNode>(
  focusNoteId: string,
  nodes: T[],
  edges: StudyThreadTrailEdge[],
): StudyThreadTrail<T> {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const focus = nodeById.get(focusNoteId) ?? null;

  if (!focus) {
    return {
      upstream: [],
      focus: null,
      downstream: [],
      alsoConnected: [...nodes].sort(compareByUpdatedAtDesc),
    };
  }

  const upstream = walkUpstream(focusNoteId, nodeById, edges);
  const upstreamIds = new Set(upstream.map((n) => n.id));
  const downstream = collectDownstream(focusNoteId, nodeById, edges, upstreamIds);

  const onPathIds = new Set<string>([focusNoteId, ...upstreamIds, ...downstream.map((n) => n.id)]);
  const alsoConnected = nodes
    .filter((n) => !onPathIds.has(n.id))
    .sort((a, b) => {
      const orderDiff =
        connectionOrderMs(a.id, focusNoteId, edges) - connectionOrderMs(b.id, focusNoteId, edges);
      if (orderDiff !== 0) return orderDiff;
      return compareByUpdatedAtDesc(a, b);
    });

  return { upstream, focus, downstream, alsoConnected };
}

/** True when the trail has connected notes beyond the focus note alone. */
export function studyThreadTrailHasConnectionOrder(trail: StudyThreadTrail<StudyThreadTrailNode>): boolean {
  return trail.upstream.length + trail.downstream.length > 0;
}

/** @deprecated Use studyThreadTrailHasConnectionOrder */
export const studyThreadTrailHasReadingOrder = studyThreadTrailHasConnectionOrder;
