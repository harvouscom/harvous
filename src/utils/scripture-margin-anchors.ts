/**
 * Verse-bucketed note anchors for the reader's left margin.
 *
 * Derives entirely from the space scripture index — the same payload the sidebar's
 * Scripture list mode already drills (`/api/spaces/:id/scripture-index`). No new
 * server route, and no second source of truth: a margin dot means exactly what a
 * Scripture-mode row means, which is "a note in this space cites this passage."
 *
 * A note anchored to John 15:1-8 marks every verse it covers, so the dot is beside
 * v5 while you are reading v5 — not only beside v1.
 *
 * Two shapes in the index need care, both confirmed against the parser:
 *
 * 1. A chapter-only citation normalizes to the full span ("John 15" → John 15:1-27),
 *    which would otherwise stripe a dot down every verse in the chapter for a single
 *    note. Those are separated out as `wholeChapter` and belong at the chapter head,
 *    not in the gutter.
 * 2. A cross-chapter range parses with the end verse belonging to a LATER chapter
 *    ("Exodus 6:28-7:7" → chapter 6, verse [28, 7]), and the index drops the end
 *    chapter when it flattens to verseStart/verseEnd. The pair therefore arrives
 *    inverted. Anchoring it from verseStart to the end of its own chapter keeps the
 *    note visible where it starts; its tail chapter cannot be recovered from the
 *    index as stored, so those verses go un-dotted rather than mis-dotted.
 */

import { getChapterVerseRange } from '@/utils/scripture-detector';
import { canonicalBookOrderMap } from '@/utils/scripture-passage-drill';

export type MarginAnchorNoteLike = {
  id: string;
  title: string | null;
  updatedAt: string | null;
  createdAt: string;
};

export type MarginAnchorPassageLike = {
  passageKey: string;
  displayRef: string;
  bookOrder: number;
  chapter: number;
  verseStart: number;
  verseEnd: number;
  notes?: MarginAnchorNoteLike[];
};

export type MarginAnchorBookLike = {
  bookOrder: number;
  passages: MarginAnchorPassageLike[];
};

export type ChapterMarginAnchors = {
  /** Verse number → notes citing that verse, most recently touched first. */
  byVerse: Map<number, MarginAnchorNoteLike[]>;
  /** Notes citing the chapter as a whole — surfaced at the chapter head, not per verse. */
  wholeChapter: MarginAnchorNoteLike[];
};

export const EMPTY_CHAPTER_MARGIN_ANCHORS: ChapterMarginAnchors = {
  byVerse: new Map(),
  wholeChapter: [],
};

/** Canonical book order for a book name, or null when the name is not a known book. */
export function resolveCanonicalBookOrder(book: string): number | null {
  const order = canonicalBookOrderMap().get(book.trim());
  return order === undefined ? null : order;
}

function noteRecencyMs(note: MarginAnchorNoteLike): number {
  const updated = note.updatedAt ? Date.parse(note.updatedAt) : NaN;
  if (Number.isFinite(updated)) return updated;
  const created = Date.parse(note.createdAt);
  return Number.isFinite(created) ? created : 0;
}

function sortByRecency(notes: MarginAnchorNoteLike[]): MarginAnchorNoteLike[] {
  return [...notes].sort((a, b) => noteRecencyMs(b) - noteRecencyMs(a));
}

/**
 * Verses a passage should mark within `chapter`, as an inclusive [start, end].
 * Returns null when the passage covers the whole chapter (caller lifts it to the head).
 */
function verseSpanWithinChapter(
  passage: MarginAnchorPassageLike,
  chapterRange: { start: number; end: number } | null,
): [number, number] | null {
  const rawStart = Math.max(1, Math.floor(passage.verseStart));
  const rawEnd = Math.floor(passage.verseEnd);

  // Cross-chapter range flattened by the index — run to the end of this chapter.
  const end = rawEnd < rawStart ? (chapterRange?.end ?? rawStart) : rawEnd;

  if (chapterRange && rawStart <= chapterRange.start && end >= chapterRange.end) {
    return null;
  }
  return [rawStart, end];
}

/**
 * Bucket the space's scripture index into per-verse note anchors for one chapter.
 * Pure — safe to memoize on (books, book, chapter).
 */
export function buildChapterMarginAnchors(
  books: MarginAnchorBookLike[],
  book: string,
  chapter: number,
): ChapterMarginAnchors {
  const bookOrder = resolveCanonicalBookOrder(book);
  if (bookOrder === null || !Number.isFinite(chapter)) return EMPTY_CHAPTER_MARGIN_ANCHORS;

  const chapterRange = getChapterVerseRange(book.trim(), chapter);

  // Dedupe per verse: a note citing both John 15:1-8 and John 15:5 marks v5 once.
  const perVerse = new Map<number, Map<string, MarginAnchorNoteLike>>();
  const wholeChapter = new Map<string, MarginAnchorNoteLike>();

  for (const indexedBook of books) {
    if (indexedBook.bookOrder !== bookOrder) continue;

    for (const passage of indexedBook.passages) {
      if (passage.chapter !== chapter) continue;
      if (!passage.notes?.length) continue;

      const span = verseSpanWithinChapter(passage, chapterRange);

      if (span === null) {
        for (const note of passage.notes) wholeChapter.set(note.id, note);
        continue;
      }

      const [start, end] = span;
      for (let verse = start; verse <= end; verse += 1) {
        let bucket = perVerse.get(verse);
        if (!bucket) {
          bucket = new Map();
          perVerse.set(verse, bucket);
        }
        for (const note of passage.notes) bucket.set(note.id, note);
      }
    }
  }

  const byVerse = new Map<number, MarginAnchorNoteLike[]>();
  for (const [verse, bucket] of [...perVerse.entries()].sort((a, b) => a[0] - b[0])) {
    byVerse.set(verse, sortByRecency([...bucket.values()]));
  }

  return { byVerse, wholeChapter: sortByRecency([...wholeChapter.values()]) };
}
