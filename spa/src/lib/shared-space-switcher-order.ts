/** Normalize space ids so preference order matches nav rows. */
export function normalizeSharedSpaceSwitcherId(id: string): string {
  return id.startsWith('space_') ? id : `space_${id}`;
}

/**
 * Apply per-user switcher preference: preferred ids first (stable), then any
 * remaining spaces sorted alphabetically by title.
 */
export function orderPersonalSharedSpaces<T extends { id: string; title: string }>(
  spaces: T[],
  preferredOrder: string[] | null | undefined,
): T[] {
  if (spaces.length <= 1) return [...spaces];

  const byId = new Map<string, T>();
  for (const space of spaces) {
    byId.set(normalizeSharedSpaceSwitcherId(space.id), space);
  }

  const seen = new Set<string>();
  const ordered: T[] = [];
  for (const rawId of preferredOrder ?? []) {
    const id = normalizeSharedSpaceSwitcherId(rawId);
    const space = byId.get(id);
    if (!space || seen.has(id)) continue;
    ordered.push(space);
    seen.add(id);
  }

  const rest = spaces
    .filter((space) => !seen.has(normalizeSharedSpaceSwitcherId(space.id)))
    .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));

  return [...ordered, ...rest];
}
