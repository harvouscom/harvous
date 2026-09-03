/**
 * The verse that comes after this one, as a reference.
 *
 * "What comes after Romans 1:7?" needs to know that Romans 1 has 32 verses and that Romans has
 * 16 chapters — nothing more. Pure, and separate from the fetch that turns the answer into text,
 * because the stepping is where all the edge cases are and none of them need a database.
 *
 * Three rules, all of them things a naive `verse + 1` gets wrong:
 *
 * - **The last verse of a chapter rolls into the next chapter**, not into a verse that does not
 *   exist. Romans 1:32 is followed by Romans 2:1.
 * - **The last verse of a book has no next verse here.** Rolling Revelation 22:21 into Genesis
 *   1:1 would be a claim about the canon that this file has no business making, and rolling
 *   Malachi into Matthew is a claim about which canon. It returns null and the rung falls back.
 * - **A range is stepped from its end.** What comes after "John 15:5-8" is 15:9, not 15:6, which
 *   is inside the passage the reader was just shown.
 */

import {
  getBookChapterCount,
  getChapterVerseRange,
  parseScriptureReference,
} from '@/utils/scripture-detector';

export interface VerseAddress {
  book: string;
  chapter: number;
  verse: number;
}

export function formatVerseAddress(address: VerseAddress): string {
  return `${address.book} ${address.chapter}:${address.verse}`;
}

/** The last verse a reference covers — the one to step from. */
export function lastVerseOf(reference: string): VerseAddress | null {
  const parsed = parseScriptureReference(reference);
  if (!parsed) return null;

  // A cross-chapter range ends in `endChapter`, whose own last verse the range runs to.
  if (parsed.endChapter != null && parsed.endChapter !== parsed.chapter) {
    const verse = Array.isArray(parsed.verse) ? parsed.verse[1] : parsed.verse;
    return { book: parsed.book, chapter: parsed.endChapter, verse };
  }

  const verse = Array.isArray(parsed.verse) ? parsed.verse[1] : parsed.verse;
  if (!Number.isFinite(verse) || verse < 1) return null;
  return { book: parsed.book, chapter: parsed.chapter, verse };
}

/**
 * The next verse after a reference, or null at the end of a book.
 *
 * Null is a real answer, not a failure: see the docblock above on why this refuses to cross a
 * book boundary.
 */
export function nextVerseAddress(reference: string): VerseAddress | null {
  const last = lastVerseOf(reference);
  if (!last) return null;

  const range = getChapterVerseRange(last.book, last.chapter);
  // An unknown chapter is not an invitation to guess that verse + 1 exists.
  if (!range) return null;

  if (last.verse < range.end) {
    return { book: last.book, chapter: last.chapter, verse: last.verse + 1 };
  }

  const chapters = getBookChapterCount(last.book);
  if (!chapters || last.chapter >= chapters) return null;

  const nextChapter = getChapterVerseRange(last.book, last.chapter + 1);
  if (!nextChapter) return null;
  return { book: last.book, chapter: last.chapter + 1, verse: nextChapter.start };
}

/**
 * Verses of the same chapter to sit beside the answer, nearest first.
 *
 * Neighbours rather than strangers: choosing between the next verse and three verses from other
 * books tests whether you recognise the *topic*, which you would pass without remembering the
 * passage at all. Verses from the same chapter sound alike, so the question is about the order
 * of what you have read.
 *
 * Excludes the verse asked about and the answer itself.
 */
export function neighbourVerseAddresses(
  reference: string,
  limit: number,
): VerseAddress[] {
  const last = lastVerseOf(reference);
  if (!last) return [];
  const range = getChapterVerseRange(last.book, last.chapter);
  if (!range) return [];

  const answer = nextVerseAddress(reference);
  const taken = new Set<number>([last.verse]);
  if (answer && answer.chapter === last.chapter) taken.add(answer.verse);

  const out: VerseAddress[] = [];
  // Outward from the verse in question: 1 before, 1 after, 2 before, 2 after…
  for (let step = 1; out.length < limit && step <= range.end - range.start + 1; step++) {
    for (const verse of [last.verse - step, last.verse + step]) {
      if (out.length >= limit) break;
      if (verse < range.start || verse > range.end || taken.has(verse)) continue;
      taken.add(verse);
      out.push({ book: last.book, chapter: last.chapter, verse });
    }
  }
  return out;
}
