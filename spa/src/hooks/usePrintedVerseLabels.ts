import { useEffect, useMemo, useState } from 'react';
import {
  formatPrintedVerse,
  loadPrintedVerseMap,
  printedVerseFor,
  type PrintedVerseMap,
} from '@/utils/printed-verse-number';

const EMPTY = new Map<number, string>();

/**
 * Verse number → what the printed edition calls it ("12", "50:12"), for a chapter in a
 * translation whose print numbering differs from Harvous's (NABRE, Douay-Rheims). Empty for every
 * other translation, and until the small per-translation map has loaded — the reader never waits
 * on it.
 */
export function usePrintedVerseLabels(
  book: string,
  chapter: number,
  translation: string | null | undefined,
): Map<number, string> {
  const [map, setMap] = useState<{ translation: string; data: PrintedVerseMap } | null>(null);

  useEffect(() => {
    if (!translation) return;
    const pending = loadPrintedVerseMap(translation);
    if (!pending) return;
    let cancelled = false;
    void pending.then((data) => {
      if (!cancelled) setMap({ translation, data });
    });
    return () => {
      cancelled = true;
    };
  }, [translation]);

  return useMemo(() => {
    if (!map || map.translation !== translation) return EMPTY;
    const runs = map.data[book]?.filter((r) => r.chapter === chapter);
    if (!runs?.length) return EMPTY;
    const labels = new Map<number, string>();
    for (const run of runs) {
      for (let verse = run.from; verse <= run.to; verse++) {
        const printed = printedVerseFor(map.data, book, chapter, verse);
        if (printed) labels.set(verse, formatPrintedVerse(printed, book, chapter));
      }
    }
    return labels;
  }, [map, translation, book, chapter]);
}
