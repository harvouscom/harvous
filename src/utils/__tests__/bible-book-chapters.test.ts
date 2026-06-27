import { describe, expect, it } from 'vitest';
import { bibleBookChapterCounts, bookChapterCount } from '../bible-book-chapters';

describe('bibleBookChapterCounts', () => {
  it('returns canonical chapter counts for known books', () => {
    expect(bookChapterCount('Genesis')).toBe(50);
    expect(bookChapterCount('Psalms')).toBe(150);
    expect(bookChapterCount('Romans')).toBe(16);
    expect(bookChapterCount('Jude')).toBe(1);
    expect(bookChapterCount('Revelation')).toBe(22);
  });

  it('returns null for an unknown book', () => {
    expect(bookChapterCount('Nonsense')).toBeNull();
  });

  it('memoizes the same map instance', () => {
    expect(bibleBookChapterCounts()).toBe(bibleBookChapterCounts());
  });
});
