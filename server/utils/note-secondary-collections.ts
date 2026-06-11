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

/**
 * Split a directory path into a leaf (primary collection) + ancestors (secondary).
 * e.g. "Pauline Epistles/Romans/Chapter 8" → { primary: "Chapter 8", secondary: ["Pauline Epistles", "Romans"] }.
 */
export function collectionsFromPath(folderPath: string | null | undefined): {
  primary: string | null;
  secondary: string[];
} {
  if (!folderPath) return { primary: null, secondary: [] };
  const parts = folderPath.split('/').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return { primary: null, secondary: [] };
  const primary = parts[parts.length - 1];
  return { primary, secondary: normalizeSecondaryLabels(parts.slice(0, -1), primary) };
}

/**
 * Resolve a note's collections on import. Explicit frontmatter folders win over the
 * directory structure; folderless content yields null (stays Unsorted, no override).
 */
export function resolveImportCollections(
  metaFolder: string | null | undefined,
  metaFolders: string[] | null | undefined,
  folderPath: string | null | undefined,
): { primary: string | null; secondary: string[] } {
  const explicitPrimary = typeof metaFolder === 'string' && metaFolder.trim().length > 0 ? metaFolder.trim() : null;
  if (explicitPrimary) {
    return { primary: explicitPrimary, secondary: normalizeSecondaryLabels(metaFolders || [], explicitPrimary) };
  }
  return collectionsFromPath(folderPath);
}
