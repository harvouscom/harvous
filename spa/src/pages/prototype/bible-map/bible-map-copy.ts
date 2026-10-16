/**
 * The words "My Bible" says, in one place so the card and the map agree.
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

/**
 * Whose map it is. `you` is My Bible; `space` and `family` are Our Bible. The family's map is
 * book names only, so it never says which book "most of all" — every book weighs the same.
 */
export type MapVoice = 'you' | 'space' | 'family';

const SUBJECT: Record<MapVoice, string> = {
  you: "You've",
  space: 'This space has',
  family: 'Your family has',
};

/** The card's one sentence, or null when there is nothing to describe yet. */
export function shelfSentence(books: readonly BibleCoverageBook[], voice: MapVoice = 'you'): string | null {
  const summary = shelfSummary(books, voice);
  if (!summary) return null;
  return summary.detail ? `${summary.headline} ${summary.detail}` : summary.headline;
}

/**
 * The map's header, in two parts: what you have done, then where most of it was. Split so the
 * count can be the headline and the book its quieter follow-on.
 */
export function shelfSummary(
  books: readonly BibleCoverageBook[],
  voice: MapVoice = 'you',
): { headline: string; detail: string | null } | null {
  if (books.length === 0) return null;
  const subject = SUBJECT[voice];
  if (books.length === 1) return { headline: `${subject} been in ${books[0].book}.`, detail: null };
  const most = voice === 'family' ? null : mostStudiedBook(books);
  return {
    headline: `${subject} been in ${books.length} books.`,
    detail: most ? `${most} most of all.` : null,
  };
}

/** What an empty map says, by whose it is. */
export const EMPTY_MAP_LINE: Record<MapVoice, string> = {
  you: 'Read a chapter, write a note or highlight a verse, and it shows here.',
  space: 'Share a note on a passage here, or highlight one, and it shows here.',
  family: 'No one has added their books yet.',
};

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
 * A space's map has no reading on it — only what the room shared — so it has no "Read", and
 * its deepest tone means several notes came back to the same chapter.
 */
export const SPACE_COVERAGE_LEGEND: ReadonlyArray<{ level: CoverageLevel; label: string }> = [
  { level: 0, label: 'Not yet' },
  { level: 2, label: 'Written about or highlighted here' },
  { level: 3, label: 'Kept coming back to' },
];

/**
 * A section's count, spelled out: "3 of 5 books". The line shows only "3/5" — its dots already
 * show how many books there are — and this is what a screen reader hears. Blank at zero.
 */
export function sectionCountLabel(booksBeenIn: number, books: number): string {
  if (booksBeenIn === 0) return '';
  return `${booksBeenIn} of ${books} ${books === 1 ? 'book' : 'books'}`;
}
