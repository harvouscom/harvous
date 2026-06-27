import { describe, expect, it } from 'vitest';
import { rankCrossRefGaps } from '../crossref-gaps';

const v = (book: string, chapter: number, verse: number) => ({ book, chapter, verse });

describe('rankCrossRefGaps', () => {
  it('returns passages the user has NOT cited, ranked by votes', () => {
    const cited = new Set(['Romans|8|28']);
    const crossRefs = [
      { from: v('Romans', 8, 28), to: v('Genesis', 50, 20), votes: 8 },
      { from: v('Romans', 8, 28), to: v('Psalm', 73, 1), votes: 5 },
      { from: v('Romans', 8, 28), to: v('Romans', 8, 28), votes: 3 }, // self → cited → skip
    ];
    const gaps = rankCrossRefGaps(crossRefs, cited);
    expect(gaps).toHaveLength(2);
    expect(gaps[0].to.book).toBe('Genesis');
    expect(gaps[1].to.book).toBe('Psalm');
  });

  it('dedupes by target passage', () => {
    const cited = new Set<string>();
    const crossRefs = [
      { from: v('Romans', 8, 28), to: v('Genesis', 50, 20), votes: 8 },
      { from: v('John', 3, 16), to: v('Genesis', 50, 20), votes: 6 }, // same target
    ];
    const gaps = rankCrossRefGaps(crossRefs, cited);
    expect(gaps).toHaveLength(1);
  });

  it('respects the limit', () => {
    const cited = new Set<string>();
    const crossRefs = [
      { from: v('A', 1, 1), to: v('B', 1, 1), votes: 3 },
      { from: v('A', 1, 1), to: v('C', 1, 1), votes: 2 },
      { from: v('A', 1, 1), to: v('D', 1, 1), votes: 1 },
    ];
    expect(rankCrossRefGaps(crossRefs, cited, { limit: 2 })).toHaveLength(2);
  });
});
