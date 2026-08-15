import { describe, expect, it } from 'vitest';
import {
  adjacentChapter,
  bookChapterCount,
  bookFromSlug,
  bookSlug,
  orderedCanonBooks,
} from '../bible-book-chapters';

describe('orderedCanonBooks', () => {
  it('runs Genesis to Revelation', () => {
    const books = orderedCanonBooks();
    expect(books[0]).toBe('Genesis');
    expect(books[books.length - 1]).toBe('Revelation');
    expect(books).toHaveLength(66);
  });

  it('has no duplicates', () => {
    const books = orderedCanonBooks();
    expect(new Set(books).size).toBe(books.length);
  });
});

describe('adjacentChapter', () => {
  it('steps within a book', () => {
    expect(adjacentChapter('Exodus', 17, 1)).toEqual({ book: 'Exodus', chapter: 18 });
    expect(adjacentChapter('Exodus', 17, -1)).toEqual({ book: 'Exodus', chapter: 16 });
  });

  it('crosses into the next book at the end of one', () => {
    // Reading does not stop at Exodus 40 — the old prev/next dead-ended here.
    expect(bookChapterCount('Exodus')).toBe(40);
    expect(adjacentChapter('Exodus', 40, 1)).toEqual({ book: 'Leviticus', chapter: 1 });
  });

  it('steps back to the PREVIOUS book last chapter, not its first', () => {
    expect(adjacentChapter('Exodus', 1, -1)).toEqual({
      book: 'Genesis',
      chapter: bookChapterCount('Genesis')!,
    });
  });

  it('stops at the two real ends of the canon', () => {
    expect(adjacentChapter('Genesis', 1, -1)).toBeNull();
    const lastChapter = bookChapterCount('Revelation')!;
    expect(adjacentChapter('Revelation', lastChapter, 1)).toBeNull();
  });

  it('walks a book boundary and back again without drifting', () => {
    const forward = adjacentChapter('Exodus', 40, 1)!;
    const back = adjacentChapter(forward.book, forward.chapter, -1);
    expect(back).toEqual({ book: 'Exodus', chapter: 40 });
  });

  it('returns null for an unknown book', () => {
    expect(adjacentChapter('Hesitations', 1, 1)).toBeNull();
  });

  it('covers every book boundary in the canon', () => {
    // One walk across all 66 books: each book's last chapter must lead to the next book's
    // first, with no gaps or repeats.
    const books = orderedCanonBooks();
    for (let i = 0; i < books.length - 1; i += 1) {
      const last = bookChapterCount(books[i])!;
      expect(adjacentChapter(books[i], last, 1)).toEqual({ book: books[i + 1], chapter: 1 });
    }
  });
});

describe('bookSlug / bookFromSlug', () => {
  it('makes a URL segment with no percent-encoding in it', () => {
    // "Song of Solomon" in a path only ever *displays* as Song%20of%20Solomon.
    expect(bookSlug('Song of Solomon')).toBe('song-of-solomon');
    expect(bookSlug('1 Corinthians')).toBe('1-corinthians');
    expect(bookSlug('John')).toBe('john');
    expect(orderedCanonBooks().every((b) => !/[^a-z0-9-]/.test(bookSlug(b)))).toBe(true);
  });

  it('gives all sixty-six books a distinct slug that round-trips', () => {
    const books = orderedCanonBooks();
    const slugs = books.map(bookSlug);
    expect(new Set(slugs).size).toBe(books.length);
    for (const book of books) {
      expect(bookFromSlug(bookSlug(book))).toBe(book);
    }
  });

  it('still resolves the space form, so links shared before slugs keep working', () => {
    expect(bookFromSlug('Song of Solomon')).toBe('Song of Solomon');
    expect(bookFromSlug('1 Corinthians')).toBe('1 Corinthians');
    expect(bookFromSlug('SONG OF SOLOMON')).toBe('Song of Solomon');
  });

  it('returns null for a segment that names no book', () => {
    expect(bookFromSlug('hezekiah')).toBeNull();
    expect(bookFromSlug('')).toBeNull();
  });
});
