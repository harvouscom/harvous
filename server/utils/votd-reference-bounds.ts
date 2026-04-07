import { normalizeScriptureReference, parseScriptureReference } from '@/utils/scripture-detector';

/** Canonical book name from a reference, or null if unparseable. */
export function bookFromReference(reference: string): string | null {
  const p = parseScriptureReference(normalizeScriptureReference(reference.trim()));
  return p?.book ?? null;
}

/**
 * If the parsed range spans more than `maxVerses`, shorten to the first `maxVerses` verses in the same chapter.
 * Single verse unchanged. Returns null if unparseable.
 */
export function clampReferenceToMaxVerseSpan(reference: string, maxVerses: number): string | null {
  const norm = normalizeScriptureReference(reference.trim());
  const p = parseScriptureReference(norm);
  if (!p) return null;
  const ch = p.chapter;
  if (typeof p.verse === 'number') return p.reference;
  const [a, b] = p.verse;
  const span = b - a + 1;
  if (span <= maxVerses) return p.reference;
  const end = a + maxVerses - 1;
  return `${p.book} ${ch}:${a}-${end}`;
}
