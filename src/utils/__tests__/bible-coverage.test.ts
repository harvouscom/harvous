import { describe, expect, it } from 'vitest';
import {
  DEEP_STUDY_SCORE,
  buildBibleCoverage,
  chapterDepthScore,
  chaptersBeenIn,
  chaptersInRange,
  deepestLevel,
  levelsForBook,
  mostStudiedBook,
  type BibleCoverageInput,
  type ChapterDepthCounts,
} from '../bible-coverage';

const empty: BibleCoverageInput = { read: [], cited: [], highlighted: [], depth: [] };
const zero: ChapterDepthCounts = {
  revisitCount: 0,
  explicitConnectionCount: 0,
  expansionCount: 0,
  synthesisCount: 0,
  reviewCount: 0,
};

describe('buildBibleCoverage', () => {
  it('leaves an empty account with no books', () => {
    expect(buildBibleCoverage(empty).books).toEqual([]);
  });

  it('marks a read chapter at level 1 and lists only that book', () => {
    const { books } = buildBibleCoverage({ ...empty, read: [{ book: 'Ruth', chapter: 2 }] });
    expect(books).toEqual([{ book: 'Ruth', chapterCount: 4, levels: [0, 1, 0, 0] }]);
  });

  it('lets writing or highlighting outrank reading', () => {
    const { books } = buildBibleCoverage({
      ...empty,
      read: [{ book: 'Ruth', chapter: 1 }, { book: 'Ruth', chapter: 2 }],
      cited: [{ book: 'Ruth', chapter: 1, noteId: 'n1' }],
      highlighted: [{ book: 'Ruth', chapter: 3 }],
    });
    expect(books[0].levels).toEqual([2, 1, 2, 0]);
  });

  it('deepens a written-on chapter that clears the depth score, but never a read-only one', () => {
    const deep = { ...zero, revisitCount: 2, expansionCount: 2 };
    expect(chapterDepthScore(deep)).toBeGreaterThanOrEqual(DEEP_STUDY_SCORE);
    const { books } = buildBibleCoverage({
      ...empty,
      read: [{ book: 'Jonah', chapter: 1 }],
      cited: [{ book: 'Jonah', chapter: 2, noteId: 'n1' }],
      depth: [
        { book: 'Jonah', chapter: 1, ...deep },
        { book: 'Jonah', chapter: 2, ...deep },
      ],
    });
    expect(books[0].levels).toEqual([1, 3, 0, 0]);
  });

  it('counts a second note on the same chapter toward depth', () => {
    const cited = ['a', 'b', 'c', 'd'].map((noteId) => ({ book: 'Jonah', chapter: 4, noteId }));
    const { books } = buildBibleCoverage({ ...empty, cited });
    expect(books[0].levels[3]).toBe(3);
  });

  it('ignores exposure, which every note save inflates', () => {
    expect(chapterDepthScore({ ...zero, ...{ exposureCount: 500 } } as ChapterDepthCounts)).toBe(0);
  });

  it('accepts book names in any case or separator and drops chapters past the end', () => {
    const { books } = buildBibleCoverage({
      ...empty,
      read: [
        { book: 'song-of-solomon', chapter: 1 },
        { book: 'Ruth', chapter: 9 },
        { book: 'Nonsense', chapter: 1 },
      ],
    });
    expect(books.map((b) => b.book)).toEqual(['Song of Solomon']);
  });

  it('returns books in canon order', () => {
    const { books } = buildBibleCoverage({
      ...empty,
      read: [{ book: 'Revelation', chapter: 1 }, { book: 'Genesis', chapter: 1 }, { book: 'John', chapter: 1 }],
    });
    expect(books.map((b) => b.book)).toEqual(['Genesis', 'John', 'Revelation']);
  });
});

describe('chaptersInRange', () => {
  it('spans a range that crosses chapters', () => {
    expect(chaptersInRange('Exodus', 6, 7)).toEqual([
      { book: 'Exodus', chapter: 6 },
      { book: 'Exodus', chapter: 7 },
    ]);
  });
  it('is one chapter without an end', () => {
    expect(chaptersInRange('Exodus', 6, null)).toEqual([{ book: 'Exodus', chapter: 6 }]);
  });
});

describe('reading the shape', () => {
  const coverage = buildBibleCoverage({
    ...empty,
    read: [1, 2, 3, 4].map((chapter) => ({ book: 'Ruth', chapter })),
    cited: [{ book: 'Jonah', chapter: 1, noteId: 'n' }, { book: 'Jonah', chapter: 2, noteId: 'n' }, { book: 'Jonah', chapter: 3, noteId: 'n' }],
  });

  it('counts chapters been in and the deepest level', () => {
    const ruth = levelsForBook(coverage, 'Ruth');
    expect(chaptersBeenIn(ruth)).toBe(4);
    expect(deepestLevel(ruth)).toBe(1);
  });

  it('weighs a book you wrote through above one you only read', () => {
    expect(mostStudiedBook(coverage.books)).toBe('Jonah');
    expect(mostStudiedBook([])).toBeNull();
  });

  it('gives zeros for a book the payload left out', () => {
    expect(levelsForBook(coverage, 'Jude')).toEqual([0]);
  });
});
