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
  // The verse a selection *starts* in has its marker before the range, not inside it, so a
  // selection from mid-verse 3 into verse 5 used to be cited as 4–5, and one inside a single
  // verse fell back to the whole dock reference. Track the last marker before the start, and
  // count it whenever selected text comes before the first marker inside the range.
  let verseBeforeStart: number | null = null;
  let firstInnerSup: Element | null = null;
  for (const sup of Array.from(passageRoot.querySelectorAll('sup.verse-num'))) {
    const probe = document.createRange();
    probe.selectNodeContents(sup);
    const n = parseInt((sup.textContent || '').trim(), 10);
    const startsBeforeEnd = domRange.compareBoundaryPoints(Range.END_TO_START, probe) < 0;
    const endsAfterStart = domRange.compareBoundaryPoints(Range.START_TO_END, probe) > 0;
    if (!startsBeforeEnd) {
      // Marker wholly before the range start.
      if (!Number.isNaN(n)) verseBeforeStart = n;
      continue;
    }
    if (!endsAfterStart) continue;
    firstInnerSup ??= sup;
    if (!Number.isNaN(n)) verseNums.push(n);
  }

  const leading = document.createRange();
  leading.setStart(domRange.startContainer, domRange.startOffset);
  if (firstInnerSup) leading.setEndBefore(firstInnerSup);
  else leading.setEnd(domRange.endContainer, domRange.endOffset);
  const hasLeadingText = leading.toString().trim().length > 0;
  if (hasLeadingText) {
    const parsedStart = Array.isArray(parsed.verse) ? parsed.verse[0] : parsed.verse;
    const startVerse = verseBeforeStart ?? parsedStart ?? null;
    if (startVerse != null) verseNums.push(startVerse);
  }

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
