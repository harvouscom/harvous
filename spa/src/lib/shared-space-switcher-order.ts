/** Normalize space ids so preference order matches nav rows. */
export function normalizeSharedSpaceSwitcherId(id: string): string {
  return id.startsWith('space_') ? id : `space_${id}`;
}

/**
 * Apply per-user switcher preference: preferred ids first (stable), then any
 * remaining spaces sorted alphabetically by title.
 *
 * Works for any of the switcher's lists — My Home's personal spaces and a church's
 * spaces/channels both draw from the same stored preference array. Ids belonging to
 * the other list are simply not found in `spaces` and fall through, so the two can
 * share one preference without needing to know about each other.
 */
export function orderSwitcherSpaces<T extends { id: string; title: string }>(
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

/**
 * Fold one list's new order back into the shared preference array.
 *
 * Both switcher lists persist to the same `sharedSpaceSwitcherOrder`, so writing a
 * list's ids alone would drop every id belonging to the other one — reordering a
 * church channel would silently reset My Home's arrangement. Carrying the untouched
 * ids through, in the order they were already stored, keeps each list's arrangement
 * independent.
 */
export function mergeSwitcherOrder(
  updated: readonly string[],
  storedOrder: readonly string[] | null | undefined,
): string[] {
  const updatedIds = updated.map(normalizeSharedSpaceSwitcherId);
  const claimed = new Set(updatedIds);
  const preserved: string[] = [];
  const seen = new Set(claimed);

  for (const rawId of storedOrder ?? []) {
    const id = normalizeSharedSpaceSwitcherId(rawId);
    if (seen.has(id)) continue;
    preserved.push(id);
    seen.add(id);
  }

  return [...updatedIds, ...preserved];
}
