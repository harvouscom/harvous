/**
 * Match {@link useSpaceNotes}: prototype APIs expect `space_*` ids in the URL path.
 * Navigation may return bare ids without the prefix.
 */
export function normalizePrototypeApiSpaceId(spaceId: string | undefined): string | undefined {
  const trimmed = (spaceId ?? '').trim();
  if (!trimmed) return undefined;
  return trimmed.startsWith('space_') ? trimmed : `space_${trimmed}`;
}
