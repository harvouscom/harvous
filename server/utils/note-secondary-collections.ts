/**
 * Secondary study collections (JSON text column in `Notes.secondaryCollections`).
 * Primary remains `primaryCollection`; secondaries are additional bucket memberships.
 */

export function parseNoteSecondaryCollections(raw: string | null | undefined): string[] {
  if (raw == null || typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return normalizeSecondaryLabels(
      parsed.filter((x): x is string => typeof x === 'string'),
      null,
    );
  } catch {
    return [];
  }
}

export function serializeNoteSecondaryCollections(arr: string[] | null | undefined): string | null {
  if (arr == null || arr.length === 0) return null;
  const normalized = normalizeSecondaryLabels(arr, null);
  if (normalized.length === 0) return null;
  return JSON.stringify(normalized);
}

/** Trim, drop empties, dedupe case-insensitively, exclude primary if present. */
export function normalizeSecondaryLabels(candidates: string[], primary: string | null | undefined): string[] {
  const primaryNorm = typeof primary === 'string' && primary.trim().length > 0 ? primary.trim() : null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of candidates) {
    if (typeof c !== 'string') continue;
    const t = c.trim();
    if (!t.length) continue;
    const low = t.toLowerCase();
    if (primaryNorm && primaryNorm.toLowerCase() === low) continue;
    if (seen.has(low)) continue;
    seen.add(low);
    out.push(t);
  }
  return out;
}
