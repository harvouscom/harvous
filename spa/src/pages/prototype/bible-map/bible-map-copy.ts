/**
 * The words "Your Bible" says, in one place so the card and the map agree.
 *
 * Counts per book and nothing larger. No whole-Bible percentage, no "keep going" — this
 * describes where you have been, it does not set you somewhere to get to.
 */
import {
  chaptersBeenIn,
  mostStudiedBook,
  type BibleCoverageBook,
  type CoverageLevel,
} from '@/utils/bible-coverage';

/** The card's one sentence, or null when there is nothing to describe yet. */
export function shelfSentence(books: readonly BibleCoverageBook[]): string | null {
  if (books.length === 0) return null;
  const most = mostStudiedBook(books);
  if (books.length === 1) return `You've been in ${books[0].book}.`;
  const lead = `You've been in ${books.length} books.`;
  return most ? `${lead} ${most} most of all.` : lead;
}

/**
 * The map's header, in two parts: what you have done, then where most of it was. Split so the
 * count can be the headline and the book its quieter follow-on.
 */
export function shelfSummary(
  books: readonly BibleCoverageBook[],
): { headline: string; detail: string | null } | null {
  if (books.length === 0) return null;
  const most = mostStudiedBook(books);
  if (books.length === 1) return { headline: `You've been in ${books[0].book}.`, detail: null };
  return {
    headline: `You've been in ${books.length} books.`,
    detail: most ? `${most} most of all.` : null,
  };
}

/**
 * A book row's count, spelled out: "2 of 28 chapters". The row shows only "2/28"; this is what
 * a screen reader hears. Empty for a book you haven't been in.
 */
export function bookCountLabel(levels: readonly CoverageLevel[]): string {
  const been = chaptersBeenIn(levels);
  return been === 0 ? '' : `${been} of ${levels.length} chapters`;
}

const LEVEL_WORDS: Record<CoverageLevel, string> = {
  0: 'not yet',
  1: 'read',
  2: 'wrote or highlighted',
  3: 'studied deeply',
};

/** "John 3, read" — a chapter cell's accessible name. */
export function chapterCellLabel(book: string, chapter: number, level: CoverageLevel): string {
  return `${book} ${chapter}, ${LEVEL_WORDS[level]}`;
}

export const COVERAGE_LEGEND: ReadonlyArray<{ level: CoverageLevel; label: string }> = [
  { level: 0, label: 'Not yet' },
  { level: 1, label: 'Read' },
  { level: 2, label: 'Wrote or highlighted' },
  { level: 3, label: 'Studied deeply' },
];

/**
 * A section's count, spelled out: "3 of 5 books". The line shows only "3/5" — its dots already
 * show how many books there are — and this is what a screen reader hears. Blank at zero.
 */
export function sectionCountLabel(booksBeenIn: number, books: number): string {
  if (booksBeenIn === 0) return '';
  return `${booksBeenIn} of ${books} ${books === 1 ? 'book' : 'books'}`;
}
