import { describe, expect, it } from 'vitest';
import {
  continueReadingEyebrow,
  continueReadingMeta,
  deriveContinueBook,
  deriveContinueReading,
  deriveSmartJumpDestination,
} from '../prototype-home-trends';

const chapterCounts = new Map([
  ['John', 21],
  ['Jude', 1],
  ['Romans', 16],
]);

const lastRead = (book: string, chapter: number) => ({
  book,
  bookOrder: 42,
  chapter,
  translation: 'NLT',
});

describe('deriveContinueReading', () => {
  it('offers the next chapter when the last one was read through', () => {
    expect(
      deriveContinueReading(
        {
          lastRead: lastRead('John', 15),
          readChapters: [{ book: 'John', chapter: 15, countsAsRead: true }],
        },
        chapterCounts,
      ),
    ).toEqual({ book: 'John', bookOrder: 42, chapter: 16, translation: 'NLT', reason: 'next' });
  });

  it('offers the same chapter again when it was opened but not read', () => {
    expect(
      deriveContinueReading(
        {
          lastRead: lastRead('John', 15),
          readChapters: [{ book: 'John', chapter: 15, countsAsRead: false }],
        },
        chapterCounts,
      ),
    ).toMatchObject({ chapter: 15, reason: 'resume' });
  });

  it('treats a chapter with no event at all as unfinished', () => {
    expect(
      deriveContinueReading({ lastRead: lastRead('John', 15), readChapters: [] }, chapterCounts),
    ).toMatchObject({ chapter: 15, reason: 'resume' });
  });

  it('skips past chapters already read, rather than proposing them again', () => {
    expect(
      deriveContinueReading(
        {
          lastRead: lastRead('John', 15),
          readChapters: [16, 17, 15].map((chapter) => ({ book: 'John', chapter, countsAsRead: true })),
        },
        chapterCounts,
      ),
    ).toMatchObject({ chapter: 18, reason: 'next' });
  });

  it('ignores chapters read in other books', () => {
    expect(
      deriveContinueReading(
        {
          lastRead: lastRead('John', 15),
          readChapters: [
            { book: 'John', chapter: 15, countsAsRead: true },
            { book: 'Romans', chapter: 16, countsAsRead: true },
          ],
        },
        chapterCounts,
      ),
    ).toMatchObject({ book: 'John', chapter: 16 });
  });

  it('stops at the end of the book instead of rolling into the next one', () => {
    expect(
      deriveContinueReading(
        {
          lastRead: { ...lastRead('Jude', 1), bookOrder: 64 },
          readChapters: [{ book: 'Jude', chapter: 1, countsAsRead: true }],
        },
        chapterCounts,
      ),
    ).toBeNull();
  });

  it('has nothing to offer before anything has been read', () => {
    expect(deriveContinueReading({ lastRead: null, readChapters: [] }, chapterCounts)).toBeNull();
  });

  it('carries the verse back when resuming a chapter left partway through', () => {
    expect(
      deriveContinueReading(
        { lastRead: { ...lastRead('John', 15), verse: 12 }, readChapters: [] },
        chapterCounts,
      ),
    ).toMatchObject({ chapter: 15, reason: 'resume', resumeVerse: 12 });
  });

  it('does not carry a verse onto a chapter that has never been read', () => {
    // "Next in John" is chapter 16, which the stored verse said nothing about — landing
    // partway into it would be inventing a position rather than restoring one.
    const out = deriveContinueReading(
      {
        lastRead: { ...lastRead('John', 15), verse: 12 },
        readChapters: [{ book: 'John', chapter: 15, countsAsRead: true }],
      },
      chapterCounts,
    );

    expect(out).toMatchObject({ chapter: 16, reason: 'next' });
    expect(out).not.toHaveProperty('resumeVerse');
  });

  it('treats verse 1 as no position at all', () => {
    // It is where the chapter opens anyway, and putting it on the URL would focus a verse
    // nobody chose.
    const out = deriveContinueReading(
      { lastRead: { ...lastRead('John', 15), verse: 1 }, readChapters: [] },
      chapterCounts,
    );

    expect(out).not.toHaveProperty('resumeVerse');
  });

  it('ignores a stored position outside the canon', () => {
    expect(
      deriveContinueReading({ lastRead: lastRead('Hezekiah', 1), readChapters: [] }, chapterCounts),
    ).toBeNull();
    expect(
      deriveContinueReading({ lastRead: lastRead('John', 99), readChapters: [] }, chapterCounts),
    ).toBeNull();
  });
});

describe('continue-reading copy', () => {
  it('says something different for resuming than for moving on', () => {
    const resume = deriveContinueReading(
      { lastRead: lastRead('John', 15), readChapters: [] },
      chapterCounts,
    )!;
    const next = deriveContinueReading(
      {
        lastRead: lastRead('John', 15),
        readChapters: [{ book: 'John', chapter: 15, countsAsRead: true }],
      },
      chapterCounts,
    )!;

    expect(continueReadingEyebrow(resume)).toBe('Where you left off reading');
    expect(continueReadingMeta(resume)).toBe('Back to John 15');
    expect(continueReadingEyebrow(next)).toBe('Keep reading');
    expect(continueReadingMeta(next)).toBe('Next in John');
  });

  it('names the verse when the row will land on one', () => {
    // The row returns you to the verse now, so saying only the chapter would be a small lie
    // told by the one card whose promise is remembering where you were.
    const resume = deriveContinueReading(
      { lastRead: { ...lastRead('John', 15), verse: 12 }, readChapters: [] },
      chapterCounts,
    )!;

    expect(continueReadingMeta(resume)).toBe('Back to John 15:12');
  });

  it('still names just the chapter when there is no verse to return to', () => {
    const resume = deriveContinueReading(
      { lastRead: lastRead('John', 15), readChapters: [] },
      chapterCounts,
    )!;

    expect(continueReadingMeta(resume)).toBe('Back to John 15');
  });
});

describe('deriveContinueBook with reading', () => {
  it('no longer proposes a chapter that was read but never written about', () => {
    const books = [{ book: 'John', bookOrder: 42, citedChapters: [2, 3], readChapters: [1] }];

    expect(deriveContinueBook(books, chapterCounts)[0]).toMatchObject({ nextChapter: 4 });
  });

  it('still works from citations alone', () => {
    const books = [{ book: 'John', bookOrder: 42, citedChapters: [1, 2] }];

    expect(deriveContinueBook(books, chapterCounts)[0]).toMatchObject({ nextChapter: 3 });
  });

  it('counts a book known only from reading', () => {
    const books = [{ book: 'John', bookOrder: 42, citedChapters: [], readChapters: [1, 2] }];

    expect(deriveContinueBook(books, chapterCounts)[0]).toMatchObject({ nextChapter: 3 });
  });

  it('skips a book finished by reading and citing together', () => {
    const books = [
      { book: 'Jude', bookOrder: 64, citedChapters: [], readChapters: [1] },
      { book: 'John', bookOrder: 42, citedChapters: [1], readChapters: [] },
    ];

    const out = deriveContinueBook(books, chapterCounts);

    expect(out.map((s) => s.book)).toEqual(['John']);
  });

  it('ranks by everything been through, not citations alone', () => {
    const books = [
      { book: 'Romans', bookOrder: 44, citedChapters: [1, 2], readChapters: [] },
      { book: 'John', bookOrder: 42, citedChapters: [1], readChapters: [2, 3] },
    ];

    expect(deriveContinueBook(books, chapterCounts).map((s) => s.book)).toEqual(['John', 'Romans']);
  });
});

describe('deriveSmartJumpDestination', () => {
  const votd = { book: 'Proverbs', chapter: 29, verse: 25 };

  it('prefers where reading stopped, carrying its translation', () => {
    const out = deriveSmartJumpDestination(
      { book: 'John', bookOrder: 42, chapter: 16, translation: 'NLT', reason: 'next' },
      votd,
    );

    expect(out).toEqual({
      book: 'John',
      chapter: 16,
      verse: null,
      translation: 'NLT',
      source: 'continue',
    });
  });

  it('lands on the verse reading stopped at, when resuming', () => {
    const out = deriveSmartJumpDestination(
      { book: 'John', bookOrder: 42, chapter: 15, translation: 'NLT', reason: 'resume', resumeVerse: 12 },
      votd,
    );

    expect(out).toMatchObject({ book: 'John', chapter: 15, verse: 12, source: 'continue' });
  });

  it("falls to today's passage when there is no reading position", () => {
    const out = deriveSmartJumpDestination(null, votd);

    expect(out).toEqual({
      book: 'Proverbs',
      chapter: 29,
      verse: 25,
      translation: null,
      source: 'votd',
    });
  });

  it('always answers, so a first run is never a dead click', () => {
    const out = deriveSmartJumpDestination(null, null);

    expect(out).toEqual({
      book: 'Genesis',
      chapter: 1,
      verse: null,
      translation: null,
      source: 'fallback',
    });
  });
});
