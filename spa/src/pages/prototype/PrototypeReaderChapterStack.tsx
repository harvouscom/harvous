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
 * ## Why both directions
 *
 * This shipped as the chapters *behind* only, on Activity's precedent: yesterday sits above
 * today, so a forward-pointing edge would make one gesture mean two things across two surfaces.
 * Going on was a floating pill over the paper's corner instead.
 *
 * That was the wrong reading of the metaphor. Activity's stack is a pile of days and there is no
 * paper for tomorrow; a book has pages on both sides of the one you are on, and turning forward
 * and turning back are the same act. So the pile is mirrored — the same component, the same
 * gesture, `direction` deciding which way it leans — and the page sits between the chapter behind
 * and the chapter ahead, where a page in a book is. The floating pill is gone; it was a control
 * doing what the paper could say by being there.
 *
 * The trade is honest rather than hidden: reaching the sheet below means scrolling the chapter.
 * The pile above costs the same, and so does a book.
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

/**
 * The chapters either side of this one, nearest first. Empty at the canon's two ends.
 *
 * One function for both directions because they are one walk: `adjacentChapter` already crosses
 * book boundaries in either, and `null` from it is the real edge of Scripture rather than an
 * error — Genesis 1 has nothing behind it and Revelation 22 nothing ahead, and both should show
 * no paper rather than an edge that cannot be opened.
 */
export function chaptersFrom(
  book: string,
  chapter: number,
  count: number,
  direction: 1 | -1,
): { book: string; chapter: number }[] {
  const out: { book: string; chapter: number }[] = [];
  let cursor: { book: string; chapter: number } | null = { book, chapter };
  for (let i = 0; i < count; i += 1) {
    cursor = cursor ? adjacentChapter(cursor.book, cursor.chapter, direction) : null;
    if (!cursor) break;
    out.push(cursor);
  }
  return out;
}

/** The chapters immediately behind this one, nearest first. Empty at Genesis 1. */
export function chaptersBehind(book: string, chapter: number, count: number) {
  return chaptersFrom(book, chapter, count, -1);
}

export default function PrototypeReaderChapterStack({
  book,
  chapter,
  translation,
  direction = 'behind',
  onSelect,
}: {
  book: string;
  chapter: number;
  translation: string;
  /**
   * Which side of the page this pile is.
   *
   * `behind` sits above the sheet and holds the chapter you turned past; `ahead` sits below it
   * and holds the one you are reading toward. The same paper, the same gesture, mirrored — which
   * is what makes turning a page in either direction one idea rather than two controls.
   */
  direction?: 'behind' | 'ahead';
  onSelect: (book: string, chapter: number) => void;
}) {
  const queryClient = useQueryClient();

  const edges = useMemo(
    () => chaptersFrom(book, chapter, READER_CHAPTER_EDGES, direction === 'ahead' ? 1 : -1),
    [book, chapter, direction],
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
      className={`pds-reader-stack__edges pds-reader-stack__edges--${direction}`}
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
            aria-label={direction === 'ahead' ? `Read on to ${label}` : `Back to ${label}`}
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
