/**
 * Read a search box query as a place in the Bible.
 *
 * Search already finds passages you have *written about* — it indexes your notes. Typing
 * "Nahum 2" when you have never written on Nahum found nothing, which is the wrong answer
 * now that the app has a Bible in it: the chapter exists whether or not you have been there.
 * This turns a typed reference into a destination.
 *
 * Deliberately reuses `resolveCanonicalBookName` rather than matching book names here. That
 * function is where the Philemon-vs-Philippians ranking lives, and a second, simpler matcher
 * in the search box would resolve "philemon" to Philippians all over again.
 */

import { bookChapterCount } from './bible-book-chapters';
import { getBookNameVariations, normalizeText, resolveCanonicalBookName } from './scripture-detector';

export interface ReaderQueryMatch {
  book: string;
  chapter: number;
  /** The verse the reference named, when it named one — used to focus the reader on arrival. */
  verse: number | null;
  /** How the destination should be written out: "John 3", "1 Corinthians 13:4". */
  reference: string;
  /** True when the query named only a book and the chapter is this function's assumption. */
  chapterAssumed: boolean;
}

/**
 * The shortest book fragment that may resolve on its own.
 *
 * "is" is a prefix of Isaiah, and so is "i"; offering "Read Isaiah 1" to someone typing the
 * word "is" would be noise in every other search they run. Three characters is where a
 * fragment starts to look like it was meant as a book — "job", "rom", "1jn" all clear it.
 * A query that names a chapter has already declared its intent, so it is exempt: "is 40"
 * is unambiguously Isaiah.
 */
const MIN_BOOK_FRAGMENT = 3;

/*
 * A trailing range is matched and then thrown away. "John 3:16-17" is a normal way to write a
 * reference — the verse-of-the-day arrives in exactly that shape — and the reader opens on a
 * chapter, so only where the range *starts* has anywhere to go.
 */
const QUERY_PATTERN =
  /^\s*((?:[123]|i{1,3}|first|second|third)?\s*[a-z][a-z\s.]*?)\s*(?:(\d{1,3})\s*(?::\s*(\d{1,3}))?)?(?:\s*[-–—]\s*\d{1,3}(?:\s*:\s*\d{1,3})?)?\s*$/i;

export function parseReaderQuery(rawQuery: string): ReaderQueryMatch | null {
  const query = rawQuery.trim();
  if (!query) return null;

  const match = QUERY_PATTERN.exec(query);
  if (!match) return null;

  const [, bookPart, chapterPart, versePart] = match;
  const normalizedBook = normalizeText(bookPart ?? '').replace(/\s+/g, '');
  if (!normalizedBook) return null;

  const namedChapter = chapterPart ? Number(chapterPart) : null;
  if (!namedChapter && normalizedBook.length < MIN_BOOK_FRAGMENT) return null;

  const book = resolveCanonicalBookName(bookPart ?? '', getBookNameVariations());
  if (!book) return null;

  const chapterCount = bookChapterCount(book);
  if (chapterCount == null) return null;

  /*
   * Jude, Obadiah, Philemon and the two short letters of John have one chapter, and nobody
   * writes it. "Jude 3" means the third verse, and reading it as a chapter would reject a
   * reference that is not only valid but the only way anyone cites those books.
   */
  const singleChapterVerse = chapterCount === 1 && namedChapter != null && versePart == null;

  // A chapter the book does not have is a typo, not a destination — "John 99" should keep
  // looking like a miss rather than quietly landing on John 21.
  if (!singleChapterVerse && namedChapter != null && (namedChapter < 1 || namedChapter > chapterCount)) {
    return null;
  }

  const chapter = singleChapterVerse ? 1 : (namedChapter ?? 1);
  const verse = singleChapterVerse ? namedChapter : versePart ? Number(versePart) : null;

  const resolvedVerse = verse && verse > 0 ? verse : null;

  return {
    book,
    chapter,
    verse: resolvedVerse,
    reference: readerReference(book, chapter, resolvedVerse, chapterCount),
    chapterAssumed: namedChapter == null && chapterCount > 1,
  };
}

/** How the destination reads back to the person who typed it. */
function readerReference(
  book: string,
  chapter: number,
  verse: number | null,
  chapterCount: number,
): string {
  // One-chapter books are cited by verse alone; "Jude 1:3" is technically right and looks wrong.
  if (chapterCount === 1) return verse ? `${book} ${verse}` : book;
  if (verse) return `${book} ${chapter}:${verse}`;
  return `${book} ${chapter}`;
}
