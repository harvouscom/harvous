import { normalizeScriptureReference, parseScriptureReference } from '@/utils/scripture-detector';

export type VerseKeyParts = { book: string; chapter: number; verse: number };

export const verseKeyFromParts = (v: VerseKeyParts) => `${v.book}|${v.chapter}|${v.verse}`;

/** Expand a stored passage/highlight ref into per-verse keys (same-chapter ranges). Pure. */
export function verseKeysFromScriptureReference(reference: string): string[] {
  const normalized = normalizeScriptureReference(reference.trim()) ?? reference.trim();
  if (!normalized) return [];
  const parsed = parseScriptureReference(normalized.replace(/,\s+/g, ','));
  if (!parsed) return [];
  const verseStart = Array.isArray(parsed.verse) ? parsed.verse[0] : parsed.verse;
  const verseEnd = Array.isArray(parsed.verse) ? parsed.verse[1] : verseStart;
  const keys: string[] = [];
  for (let v = verseStart; v <= verseEnd; v++) {
    keys.push(verseKeyFromParts({ book: parsed.book, chapter: parsed.chapter, verse: v }));
  }
  return keys;
}

/** True when `containerRef` includes every verse in `containedRef` (e.g. range pill vs single verse). */
export function scriptureReferenceContainsReference(containerRef: string, containedRef: string): boolean {
  const containedKeys = verseKeysFromScriptureReference(containedRef);
  if (!containedKeys.length) return false;
  const containerKeys = new Set(verseKeysFromScriptureReference(containerRef));
  return containedKeys.every((k) => containerKeys.has(k));
}
