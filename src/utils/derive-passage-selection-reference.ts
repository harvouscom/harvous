import {
  normalizeScriptureReference,
  parseScriptureReference,
} from '@/utils/scripture-detector';

/**
 * Derive a tighter scripture citation when the user selected a subset of verses
 * in the passage dock. Falls back to `fallbackReference` when verse markers are
 * unavailable or the selection spans chapters.
 */
export function deriveReferenceFromPassageSelection(
  passageRoot: HTMLElement,
  domRange: Range,
  fallbackReference: string,
): string {
  const parsed = parseScriptureReference(fallbackReference);
  if (!parsed || parsed.endChapter != null) {
    return fallbackReference;
  }

  const verseNums: number[] = [];
  passageRoot.querySelectorAll('sup.verse-num').forEach((sup) => {
    const probe = document.createRange();
    probe.selectNodeContents(sup);
    const startsBeforeEnd = domRange.compareBoundaryPoints(Range.END_TO_START, probe) < 0;
    const endsAfterStart = domRange.compareBoundaryPoints(Range.START_TO_END, probe) > 0;
    if (!startsBeforeEnd || !endsAfterStart) return;
    const n = parseInt((sup.textContent || '').trim(), 10);
    if (!Number.isNaN(n)) verseNums.push(n);
  });

  if (verseNums.length === 0) return fallbackReference;

  const sorted = [...new Set(verseNums)].sort((a, b) => a - b);
  const book = parsed.book;
  const chapter = parsed.chapter;
  const raw =
    sorted.length === 1
      ? `${book} ${chapter}:${sorted[0]}`
      : `${book} ${chapter}:${sorted[0]}-${sorted[sorted.length - 1]}`;

  return normalizeScriptureReference(raw) ?? fallbackReference;
}
