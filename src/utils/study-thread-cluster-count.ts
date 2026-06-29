/**
 * Pure study-thread cluster counting — matches admin usage stats and sidebar threads mode.
 * Connected components via NoteConnections + titled singletons (studyThreadUserOverride).
 */

import { pickStudyThreadRepresentativeNoteId } from '@/utils/suggest-study-thread-title';

export type StudyThreadClusterEdge = { fromNoteId: string; toNoteId: string };

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

  /** All note ids in the same component as seedNoteId (including seed if present in graph). */
  componentMembers(seedNoteId: string): Set<string> {
    const root = this.find(seedNoteId);
    const members = new Set<string>();
    for (const id of this.parent.keys()) {
      if (this.find(id) === root) members.add(id);
    }
    if (members.size === 0 && this.parent.has(seedNoteId)) {
      members.add(seedNoteId);
    }
    return members;
  }
}

/** Pure cluster count from in-memory edges + titled singleton note ids. */
export function countStudyThreadClustersFromGraph(
  edges: StudyThreadClusterEdge[],
  titledSingletonNoteIds: Iterable<string>,
): number {
  const uf = new UnionFind();
  const connectedNodes = new Set<string>();

  for (const edge of edges) {
    uf.union(edge.fromNoteId, edge.toNoteId);
    connectedNodes.add(edge.fromNoteId);
    connectedNodes.add(edge.toNoteId);
  }

  let total = uf.componentCount();

  for (const noteId of titledSingletonNoteIds) {
    if (!connectedNodes.has(noteId)) total += 1;
  }

  return total;
}

/** Representative note id for the cluster containing seedNoteId. */
export function pickRepNoteIdFromGraph(
  seedNoteId: string,
  edges: StudyThreadClusterEdge[],
): string | null {
  const uf = new UnionFind();
  for (const edge of edges) {
    uf.union(edge.fromNoteId, edge.toNoteId);
  }

  const members = uf.componentMembers(seedNoteId);
  if (members.size === 0) {
    return seedNoteId;
  }

  const degree = new Map<string, number>();
  for (const edge of edges) {
    if (members.has(edge.fromNoteId)) {
      degree.set(edge.fromNoteId, (degree.get(edge.fromNoteId) ?? 0) + 1);
    }
    if (members.has(edge.toNoteId)) {
      degree.set(edge.toNoteId, (degree.get(edge.toNoteId) ?? 0) + 1);
    }
  }
  for (const id of members) {
    if (!degree.has(id)) degree.set(id, 0);
  }

  return pickStudyThreadRepresentativeNoteId([...members], degree);
}

/** Connected components (2+ notes only) from graph edges. */
export function clusterMemberSetsFromEdges(edges: StudyThreadClusterEdge[]): Set<string>[] {
  const uf = new UnionFind();
  const nodes = new Set<string>();
  for (const edge of edges) {
    uf.union(edge.fromNoteId, edge.toNoteId);
    nodes.add(edge.fromNoteId);
    nodes.add(edge.toNoteId);
  }
  const byRoot = new Map<string, Set<string>>();
  for (const id of nodes) {
    const root = uf.find(id);
    const set = byRoot.get(root) ?? new Set<string>();
    set.add(id);
    byRoot.set(root, set);
  }
  return [...byRoot.values()].filter((set) => set.size >= 2);
}

export function averageMemberCount(sets: Iterable<Set<string>>): number {
  const sizes = [...sets].map((set) => set.size);
  if (sizes.length === 0) return 0;
  const total = sizes.reduce((sum, size) => sum + size, 0);
  return Math.round((total / sizes.length) * 10) / 10;
}

export type StudyThreadClusterEdgeWithCreated = StudyThreadClusterEdge & { createdAt: Date };

/** Connected components (2+ notes) that received a new link in [sinceMs, untilMs). */
export function activeThreadClustersInWindow(
  edges: StudyThreadClusterEdgeWithCreated[],
  sinceMs: number,
  untilMs?: number,
): Set<string>[] {
  const uf = new UnionFind();
  const nodes = new Set<string>();
  const activeRoots = new Set<string>();

  for (const edge of edges) {
    uf.union(edge.fromNoteId, edge.toNoteId);
    nodes.add(edge.fromNoteId);
    nodes.add(edge.toNoteId);
    const createdMs = edge.createdAt.getTime();
    if (createdMs >= sinceMs && (untilMs == null || createdMs < untilMs)) {
      activeRoots.add(uf.find(edge.fromNoteId));
    }
  }

  const membersByRoot = new Map<string, Set<string>>();
  for (const id of nodes) {
    const root = uf.find(id);
    const set = membersByRoot.get(root) ?? new Set<string>();
    set.add(id);
    membersByRoot.set(root, set);
  }

  return [...activeRoots]
    .map((root) => membersByRoot.get(root) ?? new Set<string>())
    .filter((members) => members.size >= 2);
}
