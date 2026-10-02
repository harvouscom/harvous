import { getChapterVerseRange, normalizeScriptureReference, parseScriptureReference } from '@/utils/scripture-detector';

export type VerseKeyParts = { book: string; chapter: number; verse: number };

export const verseKeyFromParts = (v: VerseKeyParts) => `${v.book}|${v.chapter}|${v.verse}`;

/**
 * Expand a stored passage/highlight ref into per-verse keys. Pure.
 *
 * Cross-chapter ranges ("Exodus 6:28-7:7") parse as `verse: [28, 7]` with `endChapter: 7`;
 * they used to loop 28→7 and yield nothing, so they matched no note anywhere. Each chapter
 * in between is expanded to its full verse range.
 */
export function verseKeysFromScriptureReference(reference: string): string[] {
  const normalized = normalizeScriptureReference(reference.trim()) ?? reference.trim();
  if (!normalized) return [];
  const parsed = parseScriptureReference(normalized.replace(/,\s+/g, ','));
  if (!parsed) return [];
  const verseStart = Array.isArray(parsed.verse) ? parsed.verse[0] : parsed.verse;
  const verseEnd = Array.isArray(parsed.verse) ? parsed.verse[1] : verseStart;
  const endChapter = parsed.endChapter && parsed.endChapter > parsed.chapter ? parsed.endChapter : parsed.chapter;
  const keys: string[] = [];
  for (let chapter = parsed.chapter; chapter <= endChapter; chapter++) {
    const first = chapter === parsed.chapter ? verseStart : 1;
    const last =
      chapter === endChapter
        ? verseEnd
        : (getChapterVerseRange(parsed.book, chapter)?.end ?? first - 1);
    for (let v = first; v <= last; v++) {
      keys.push(verseKeyFromParts({ book: parsed.book, chapter, verse: v }));
    }
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
