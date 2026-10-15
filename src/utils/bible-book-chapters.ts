/**
 * Canonical chapter count per book, derived once from bible-chapters.json (a flat list of
 * { book, bookOrder, chapter, ... } records). Used by the "continue the book" generative recall card
 * to know when a book is finished and what the next chapter is.
 */

import bibleChaptersData from '@/data/bible-chapters.json';
import deuterocanonChaptersData from '@/data/deuterocanon-chapters.json';
import { DEUTEROCANON_TRANSLATIONS, translationHasDeuterocanon } from '@/data/translations';

interface ChapterRecord {
  book: string;
  bookOrder: number;
  chapter: number;
  startVerse: number;
  endVerse: number;
}

/*
 * Two canons, one numbering.
 *
 * `bible-chapters.json` is the 66 books every translation carries, and what every function here
 * means when it's given no translation: continue-book, progress, packs for a Protestant-canon
 * translation and every stored `bookOrder` are built on it. `deuterocanon-chapters.json` adds
 * what only the Catholic translations (NABRE, DRB) carry: Tobit, Judith, Wisdom, Sirach,
 * Baruch, 1–2 Maccabees and the Prayer of Azariah (Daniel 3:24–90, at `bookOrder` 67–74), plus
 * Esther 10:4–16:24 and Daniel 13–14. Pass a translation to get the canon that translation reads.
 */

let cache: Map<string, number> | null = null;

/** Map of book name → highest (canonical) chapter number, 66 books. Built once and memoized. */
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

let deuteroCache: Map<string, number> | null = null;

/** The same map for a translation that carries the deuterocanon: 74 books, Esther 16, Daniel 14. */
function catholicChapterCounts(): Map<string, number> {
  if (deuteroCache) return deuteroCache;
  const counts = new Map(bibleBookChapterCounts());
  for (const record of deuterocanonChaptersData as ChapterRecord[]) {
    if (record.chapter > (counts.get(record.book) ?? 0)) counts.set(record.book, record.chapter);
  }
  deuteroCache = counts;
  return counts;
}

/**
 * Number of chapters in a book, or null when the book name isn't recognized — or, given a
 * translation, when that translation doesn't carry the book.
 */
export function bookChapterCount(book: string, translation?: string | null): number | null {
  const counts = translationHasDeuterocanon(translation) ? catholicChapterCounts() : bibleBookChapterCounts();
  return counts.get(book) ?? null;
}

let orderCache: string[] | null = null;

/**
 * Book names in canonical order, Genesis to Revelation.
 *
 * Lives here rather than beside its one caller because the reader needs the same order the
 * scripture dock picks from — two copies of "what order are the books in" is exactly the kind
 * of duplication that drifts silently when a translation adds or renames something.
 *
 * Given a translation that carries the deuterocanon, the 73 books in the order Catholic Bibles
 * print them (Tobit and Judith after Nehemiah, the Maccabees after Esther, Wisdom and Sirach
 * after the Song, Baruch after Lamentations). The Prayer of Azariah isn't in that list: it reads
 * inside Daniel 3.
 */
export function orderedCanonBooks(translation?: string | null): string[] {
  if (translationHasDeuterocanon(translation)) return catholicOrderedBooks();
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

/** Where each deuterocanonical book sits in a Catholic Bible: after this book. */
const CATHOLIC_PLACEMENT: Array<[after: string, books: string[]]> = [
  ['Nehemiah', ['Tobit', 'Judith']],
  ['Esther', ['1 Maccabees', '2 Maccabees']],
  ['Song of Solomon', ['Wisdom', 'Sirach']],
  ['Lamentations', ['Baruch']],
];

/** The Prayer of Azariah is Daniel 3:24–90: it reads inside Daniel 3, between these chapters. */
export const PRAYER_OF_AZARIAH = 'Prayer of Azariah';

let catholicOrderCache: string[] | null = null;

function catholicOrderedBooks(): string[] {
  if (catholicOrderCache) return catholicOrderCache;
  const out: string[] = [];
  for (const book of orderedCanonBooks()) {
    out.push(book);
    const placed = CATHOLIC_PLACEMENT.find(([after]) => after === book);
    if (placed) out.push(...placed[1]);
  }
  catholicOrderCache = out;
  return out;
}

let deuteroBookSet: Set<string> | null = null;

/** Books that exist only in the translations carrying the deuterocanon (Tobit … Prayer of Azariah). */
export function isDeuterocanonBook(book: string): boolean {
  if (!deuteroBookSet) {
    const shared = bibleBookChapterCounts();
    deuteroBookSet = new Set(
      (deuterocanonChaptersData as ChapterRecord[]).map((r) => r.book).filter((b) => !shared.has(b)),
    );
  }
  return deuteroBookSet.has(book);
}

/**
 * True when a passage exists only in the translations carrying the deuterocanon: one of their
 * books, Esther 10:4–16:24 or Daniel 13–14. Without a verse, the chapter's first verse counts,
 * so "Esther 10" is shared and "Esther 11" is not.
 */
export function isDeuterocanonPassage(book: string, chapter: number, verse?: number | null): boolean {
  if (isDeuterocanonBook(book)) return true;
  const shared = (bibleChaptersData as ChapterRecord[]).find((r) => r.book === book && r.chapter === chapter);
  if (!shared) {
    return (deuterocanonChaptersData as ChapterRecord[]).some((r) => r.book === book && r.chapter === chapter);
  }
  return verse != null && verse > shared.endVerse;
}

/**
 * Every chapter Harvous knows, for validating a reference without a translation in hand: the
 * 66 books' rows, then the deuterocanon's. Esther 10 appears twice (1–3 shared, 4–13 Catholic);
 * consumers keying by chapter should take the larger `endVerse`.
 */
export function allChapterRecords(): ChapterRecord[] {
  return [...(bibleChaptersData as ChapterRecord[]), ...(deuterocanonChaptersData as ChapterRecord[])];
}

/**
 * The chapter before or after this one — crossing into the next book when it runs out.
 *
 * Reading does not stop at a book's last chapter; Exodus 40 is followed by Leviticus 1. The
 * reader's prev/next used to be bounded by the current book, so every book ended in a dead
 * end with no way onward but the sidebar. Returns null only at the two real ends of the
 * canon, before Genesis 1 and after Revelation 22.
 *
 * The walk follows the translation's canon: in the NABRE, Nehemiah 13 is followed by Tobit 1;
 * in the ESV, by Esther 1. The Prayer of Azariah, which has no place in the book order, sits
 * between Daniel 3 and Daniel 4.
 */
export function adjacentChapter(
  book: string,
  chapter: number,
  direction: 1 | -1,
  translation?: string | null,
): { book: string; chapter: number } | null {
  if (book === PRAYER_OF_AZARIAH) return { book: 'Daniel', chapter: direction === 1 ? 4 : 3 };

  const count = bookChapterCount(book, translation);
  if (count == null) return null;

  const target = chapter + direction;
  if (target >= 1 && target <= count) return { book, chapter: target };

  const books = orderedCanonBooks(translation);
  const index = books.indexOf(book);
  if (index === -1) return null;

  const nextBook = books[index + direction];
  if (!nextBook) return null;

  // Stepping back lands on the previous book's LAST chapter, not its first.
  const nextCount = bookChapterCount(nextBook, translation);
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
    // Every book any translation carries, so a shared /read/tobit/1 link opens wherever it's sent.
    const books = [...orderedCanonBooks(DEUTEROCANON_TRANSLATIONS[0]), PRAYER_OF_AZARIAH];
    slugCache = new Map(books.map((book) => [bookSlug(book), book]));
  }
  return slugCache.get(bookSlug(segment)) ?? null;
}
