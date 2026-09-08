/**
 * Which chapters peek above the page you are on.
 *
 * The interesting cases are the two ends and the seam between books: a pile that stopped at a
 * book boundary would say the canon does, and the reader's own prev/next stopped doing that
 * deliberately ("every book ended in a dead end").
 */
import { describe, expect, it } from 'vitest';
import { chaptersBehind, READER_CHAPTER_EDGES } from '../PrototypeReaderChapterStack';

describe('chaptersBehind', () => {
  it('offers the two chapters just read, nearest first', () => {
    expect(chaptersBehind('Romans', 13, 2)).toEqual([
      { book: 'Romans', chapter: 12 },
      { book: 'Romans', chapter: 11 },
    ]);
  });

  it('crosses back into the previous book, landing on its last chapter', () => {
    /* Leviticus 1 follows Exodus 40, so the page behind it is Exodus 40 — not Exodus 1, and
       not nothing. */
    expect(chaptersBehind('Leviticus', 1, 2)).toEqual([
      { book: 'Exodus', chapter: 40 },
      { book: 'Exodus', chapter: 39 },
    ]);
  });

  it('has nothing behind Genesis 1', () => {
    /* The real start of the canon. No pile rather than an edge that cannot be opened. */
    expect(chaptersBehind('Genesis', 1, 2)).toEqual([]);
  });

  it('offers only what exists near the start', () => {
    expect(chaptersBehind('Genesis', 2, 2)).toEqual([{ book: 'Genesis', chapter: 1 }]);
  });

  it('crosses the testament seam', () => {
    /* Matthew 1 is preceded by Malachi 4 — the canon reads as one book here, the same rule
       `adjacentChapter` follows. */
    expect(chaptersBehind('Matthew', 1, 1)).toEqual([{ book: 'Malachi', chapter: 4 }]);
  });

  it('returns nothing for an unknown book rather than throwing', () => {
    expect(chaptersBehind('Nonexistent', 3, 2)).toEqual([]);
  });

  it('shows one chapter behind, not two', () => {
    /* Activity shows two because reaching back three days is a real thing to want. A chapter
       has one predecessor that matters, and the heading's grid reaches the rest at once. */
    expect(READER_CHAPTER_EDGES).toBe(1);
  });
});
