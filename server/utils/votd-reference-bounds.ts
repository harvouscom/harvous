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
  // `norm`, not `p.reference`: parseScriptureReference returns
  // { book, chapter, verse, endChapter? } and has no `reference` field, so these two
  // paths were handing back `undefined` — for a single verse and for a range already
  // inside the limit, i.e. the common cases. Both callers hide it behind `??`, but
  // votd-calendar's fallback is the *raw* input, so normalization was being skipped.
  if (typeof p.verse === 'number') return norm;
  const [a, b] = p.verse;
  const span = b - a + 1;
  if (span <= maxVerses) return norm;
  const end = a + maxVerses - 1;
  return `${p.book} ${ch}:${a}-${end}`;
}
