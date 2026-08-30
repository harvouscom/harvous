/**
 * The chapters you have turned past, as paper.
 *
 * ## Why chapters and not translations
 *
 * This started as a pile of translations, on the reasoning that a stack is for comparing and a
 * sequence belongs in a picker. That was wrong about this app: Activity's stack — the one this
 * borrows from — is *chronological*, days in order, not a comparison. And a Bible is a sequence
 * of pages before it is anything else. Turning to the next chapter is the page-turn the metaphor
 * was already describing; parallel versions, in print, are two columns rather than a pile.
 *
 * So the pile is the canon and the reader is somewhere in it. Translations kept the heading chip,
 * which reaches all eleven, and a two-column comparison sheet is its own piece of work.
 *
 * ## Why the chapters behind and not the ones ahead
 *
 * Both directions are defensible; consistency decides it. Activity puts yesterday above today and
 * flipping an edge goes *back*, so edges pointing forward here would make one gesture mean two
 * things across two surfaces. It also matches a book — the pages you have turned past are the
 * ones under your thumb. Going on is the floating control over the paper's corner, which is the
 * only other direction and the only other control.
 */
import { useEffect, useMemo, type CSSProperties } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { adjacentChapter } from '@/utils/bible-book-chapters';
import { bibleChapterQueryOptions } from '../../hooks/queries/usePrototypeBibleChapter';

/**
 * How many chapters show an edge.
 *
 * One. Activity shows two because its sheets are days and reaching back three of them is a
 * real thing to want; a chapter has one predecessor that matters — the one you were just in —
 * and the heading's chapter grid goes anywhere in the book in a single press. A second edge
 * was depth for its own sake, and it cost the top of the page twice over.
 *
 * Passed to CSS as `--edge-count` rather than restated there. Activity keeps this number twice,
 * once in TS and again as `calc(step * 2)`, and the two can drift with nothing to notice.
 */
export const READER_CHAPTER_EDGES = 1;

/** The chapters immediately behind this one, nearest first. Empty at Genesis 1. */
export function chaptersBehind(
  book: string,
  chapter: number,
  count: number,
): { book: string; chapter: number }[] {
  const out: { book: string; chapter: number }[] = [];
  let cursor: { book: string; chapter: number } | null = { book, chapter };
  for (let i = 0; i < count; i += 1) {
    cursor = cursor ? adjacentChapter(cursor.book, cursor.chapter, -1) : null;
    /* `null` is the real start of the canon, not an error — Genesis 1 has nothing behind it and
       should show no pile rather than an edge that cannot be opened. */
    if (!cursor) break;
    out.push(cursor);
  }
  return out;
}

export default function PrototypeReaderChapterStack({
  book,
  chapter,
  translation,
  onSelect,
}: {
  book: string;
  chapter: number;
  translation: string;
  onSelect: (book: string, chapter: number) => void;
}) {
  const queryClient = useQueryClient();

  const edges = useMemo(
    () => chaptersBehind(book, chapter, READER_CHAPTER_EDGES),
    [book, chapter],
  );

  /*
   * Warm the sheets behind, so a flip is a flip rather than a load.
   *
   * `usePrefetchAdjacentChapters` already warms ±1, so with one edge this is usually a cache
   * read rather than a fetch — kept because the loop is what makes the count a number rather
   * than an assumption. `bibleChapterQueryOptions` rather than a fetch of its own, per that
   * module's warning: a prefetch that builds its own key or its own fetcher warms an entry the
   * hook never reads, which looks like it works and does nothing.
   */
  useEffect(() => {
    for (const e of edges) {
      void queryClient.prefetchQuery(bibleChapterQueryOptions(e.book, e.chapter, translation));
    }
  }, [queryClient, edges, translation]);

  if (edges.length === 0) return null;

  return (
    <div
      className="pds-reader-stack__edges"
      style={{ '--edge-count': edges.length } as CSSProperties}
    >
      {/*
        Deepest first in the DOM so the nearest paints last and sits on top — the order a pile is
        actually in, and no z-index needed. `--edge-depth` is 1 for the nearest.
      */}
      {[...edges].reverse().map((e, i) => {
        const depth = edges.length - i;
        const label = `${e.book} ${e.chapter}`;
        return (
          <button
            key={`${e.book}:${e.chapter}`}
            type="button"
            className="pds-reader-stack__edge"
            style={{ '--edge-depth': depth } as CSSProperties}
            onClick={() => onSelect(e.book, e.chapter)}
            aria-label={`Back to ${label}`}
          >
            {/* The whole name, not a bare number: an edge above Leviticus 1 says "Exodus 40",
                and a "40" there would be the wrong book's chapter with no way to tell. */}
            <span className="pds-caption pds-reader-stack__edge-label">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
