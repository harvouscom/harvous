import { describe, expect, it } from 'vitest';
import {
  bookCountLabel,
  chapterCellLabel,
  sectionCountLabel,
  shelfSentence,
  shelfSummary,
} from '../bible-map-copy';
import type { BibleCoverageBook } from '@/utils/bible-coverage';

const book = (name: string, levels: BibleCoverageBook['levels']): BibleCoverageBook => ({
  book: name,
  chapterCount: levels.length,
  levels,
});

describe('shelfSentence', () => {
  it('says nothing for an empty account', () => {
    expect(shelfSentence([])).toBeNull();
  });
  it('names the one book', () => {
    expect(shelfSentence([book('Ruth', [1, 0, 0, 0])])).toBe("You've been in Ruth.");
  });
  it('counts books and names the most studied', () => {
    expect(shelfSentence([book('Ruth', [1, 1, 1, 1]), book('Jonah', [3, 2, 0, 0])])).toBe(
      "You've been in 2 books. Jonah most of all.",
    );
  });
});

describe('small labels', () => {
  it('counts a row, or leaves it blank', () => {
    expect(bookCountLabel([1, 0, 2])).toBe('2 of 3 chapters');
    expect(bookCountLabel([0, 0])).toBe('');
  });
  it('names a cell', () => {
    expect(chapterCellLabel('John', 3, 2)).toBe('John 3, wrote or highlighted');
  });
});

describe('sectionCountLabel', () => {
  it('counts books, and stays blank at zero', () => {
    expect(sectionCountLabel(3, 5)).toBe('3 of 5 books');
    expect(sectionCountLabel(1, 1)).toBe('1 of 1 book');
    expect(sectionCountLabel(0, 12)).toBe('');
  });
});

describe('shelfSummary', () => {
  it('splits the count from the book', () => {
    expect(shelfSummary([book('Ruth', [1, 1, 1, 1]), book('Jonah', [3, 2, 0, 0])])).toEqual({
      headline: "You've been in 2 books.",
      detail: 'Jonah most of all.',
    });
    expect(shelfSummary([book('Ruth', [1, 0, 0, 0])])).toEqual({ headline: "You've been in Ruth.", detail: null });
    expect(shelfSummary([])).toBeNull();
  });
});

describe('whose map it is', () => {
  const books = [book('Genesis', [2, 2, 0]), book('Romans', [3, 3, 2])];

  it('says "This space has" for a room, with where most of it was', () => {
    expect(shelfSentence(books, 'space')).toBe('This space has been in 2 books. Romans most of all.');
  });

  it('never picks a "most of all" for a family — every book weighs the same', () => {
    expect(shelfSentence(books, 'family')).toBe('Your family has been in 2 books.');
    expect(shelfSummary(books, 'family')?.detail).toBeNull();
  });

  it('keeps My Bible in the second person', () => {
    expect(shelfSentence([book('John', [1])])).toBe("You've been in John.");
  });
});
