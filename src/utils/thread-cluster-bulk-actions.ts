/** Normalize study-thread cluster member note ids for bulk disconnect. */
export function normalizeThreadClusterMemberIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const id of raw) {
    if (typeof id !== 'string') continue;
    const trimmed = id.trim();
    if (!trimmed || out.includes(trimmed)) continue;
    out.push(trimmed);
  }
  return out;
}

/** Sidebar drill slug for a cluster representative note id. */
export function threadClusterDrillSlug(clusterId: string): string {
  return clusterId.startsWith('note_') ? clusterId.slice('note_'.length) : clusterId;
}

export interface ThreadClusterEdge {
  fromNoteId: string;
  toNoteId: string;
}

/**
 * Edges to delete when removing a study-thread cluster or a single note from it.
 * When `noteId` is set, only edges touching that note within `memberIds` are included.
 */
export function filterThreadClusterEdgesForRemoval(
  edges: ThreadClusterEdge[],
  memberIds: string[],
  noteId?: string | null,
): ThreadClusterEdge[] {
  const memberSet = new Set(memberIds);
  const scoped = edges.filter(
    (edge) => memberSet.has(edge.fromNoteId) && memberSet.has(edge.toNoteId),
  );
  const trimmedNoteId = typeof noteId === 'string' ? noteId.trim() : '';
  if (!trimmedNoteId) return scoped;
  return scoped.filter(
    (edge) => edge.fromNoteId === trimmedNoteId || edge.toNoteId === trimmedNoteId,
  );
}
