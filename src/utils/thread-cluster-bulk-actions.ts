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
