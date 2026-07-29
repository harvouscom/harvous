/** Strip accidental JSON quotes from legacy address-bar values (`"1785"`). */
function stripJsonQuotes(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'string') return parsed;
    } catch {
      /* keep trimmed */
    }
  }
  return trimmed;
}

/**
 * Match {@link useSpaceNotes}: prototype APIs expect `space_*` ids in the URL path.
 * Navigation may return bare ids without the prefix.
 */
export function normalizePrototypeApiSpaceId(spaceId: string | undefined | null): string | undefined {
  const trimmed = stripJsonQuotes(spaceId ?? '');
  if (!trimmed) return undefined;
  return trimmed.startsWith('space_') ? trimmed : `space_${trimmed}`;
}

/**
 * Value for the `?space=` search param — bare id without the `space_` prefix so the
 * address bar reads `?space=1785…` instead of `?space=space_1785…`.
 * Accepts prefixed, bare, or legacy JSON-quoted input; always returns bare (or undefined).
 */
export function toPrototypeSpaceSearchParam(spaceId: string | undefined | null): string | undefined {
  const trimmed = stripJsonQuotes(spaceId ?? '');
  if (!trimmed) return undefined;
  return trimmed.startsWith('space_') ? trimmed.slice('space_'.length) : trimmed;
}
