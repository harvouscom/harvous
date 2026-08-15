/**
 * Canonical chapter count per book, derived once from bible-chapters.json (a flat list of
 * { book, bookOrder, chapter, ... } records). Used by the "continue the book" generative recall card
 * to know when a book is finished and what the next chapter is.
 */

import bibleChaptersData from '@/data/bible-chapters.json';

interface ChapterRecord {
  book: string;
  bookOrder: number;
  chapter: number;
}

let cache: Map<string, number> | null = null;

/** Map of book name → highest (canonical) chapter number. Built once and memoized. */
export function bibleBookChapterCounts(): Map<string, number> {
  if (cache) return cache;
  const counts = new Map<string, number>();
  for (const record of bibleChaptersData as ChapterRecord[]) {
    const current = counts.get(record.book) ?? 0;
    if (record.chapter > current) counts.set(record.book, record.chapter);
  }
  cache = counts;
  return counts;
}

/** Number of chapters in a book, or null when the book name isn't recognized. */
export function bookChapterCount(book: string): number | null {
  return bibleBookChapterCounts().get(book) ?? null;
}

let orderCache: string[] | null = null;

/**
 * Book names in canonical order, Genesis to Revelation.
 *
 * Lives here rather than beside its one caller because the reader needs the same order the
 * scripture dock picks from — two copies of "what order are the books in" is exactly the kind
 * of duplication that drifts silently when a translation adds or renames something.
 */
export function orderedCanonBooks(): string[] {
  if (orderCache) return orderCache;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const record of bibleChaptersData as ChapterRecord[]) {
    if (!seen.has(record.book)) {
      seen.add(record.book);
      out.push(record.book);
    }
  }
  orderCache = out;
  return out;
}

/**
 * The chapter before or after this one — crossing into the next book when it runs out.
 *
 * Reading does not stop at a book's last chapter; Exodus 40 is followed by Leviticus 1. The
 * reader's prev/next used to be bounded by the current book, so every book ended in a dead
 * end with no way onward but the sidebar. Returns null only at the two real ends of the
 * canon, before Genesis 1 and after Revelation 22.
 */
export function adjacentChapter(
  book: string,
  chapter: number,
  direction: 1 | -1,
): { book: string; chapter: number } | null {
  const count = bookChapterCount(book);
  if (count == null) return null;

  const target = chapter + direction;
  if (target >= 1 && target <= count) return { book, chapter: target };

  const books = orderedCanonBooks();
  const index = books.indexOf(book);
  if (index === -1) return null;

  const nextBook = books[index + direction];
  if (!nextBook) return null;

  // Stepping back lands on the previous book's LAST chapter, not its first.
  const nextCount = bookChapterCount(nextBook);
  if (nextCount == null) return null;
  return { book: nextBook, chapter: direction === 1 ? 1 : nextCount };
}

/**
 * A book name as a URL path segment: "Song of Solomon" → "song-of-solomon".
 *
 * Spaces in a path are always percent-encoded by the browser, so `/read/Song of Solomon/2`
 * only ever *displays* as `/read/Song%20of%20Solomon/2`. Nothing is broken by that, but a
 * chapter address is a thing people paste into messages and put on slides, and `%20` three
 * times over is noise in the middle of it.
 */
export function bookSlug(book: string): string {
  return book.trim().toLowerCase().replace(/\s+/g, '-');
}

let slugCache: Map<string, string> | null = null;

/**
 * The canonical book name for a path segment, or null when it names no book.
 *
 * Accepts the space form as well as the slug, because links to `/read/Song%20of%20Solomon/2`
 * were shared before this existed and a URL that has been sent to someone has to keep working.
 * Matching is on the slugged form of both sides, so case and separator stop mattering:
 * "1-corinthians", "1 Corinthians" and "1%20corinthians" all land in the same place.
 */
export function bookFromSlug(segment: string): string | null {
  if (!segment) return null;
  if (!slugCache) {
    slugCache = new Map(orderedCanonBooks().map((book) => [bookSlug(book), book]));
  }
  return slugCache.get(bookSlug(segment)) ?? null;
}
