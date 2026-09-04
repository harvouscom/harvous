import { describe, it, expect } from 'vitest';
import { deriveReadingNote } from '@/utils/prototype-home-trends';

const NOW = new Date('2026-09-04T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

const chapter = (over: Partial<Parameters<typeof deriveReadingNote>[0]['readChapters'][number]> = {}) => ({
  book: 'John',
  bookOrder: 42,
  chapter: 3,
  lastReadAt: hoursAgo(2),
  ...over,
});

describe('deriveReadingNote', () => {
  it('takes the most recently read chapter inside the window', () => {
    const suggestion = deriveReadingNote(
      {
        readChapters: [
          chapter({ book: 'Romans', chapter: 8, lastReadAt: hoursAgo(20) }),
          chapter({ lastReadAt: hoursAgo(2) }),
        ],
        citedChapterKeys: new Set(),
      },
      NOW,
    );
    expect(suggestion).toMatchObject({ book: 'John', chapter: 3 });
  });

  it('never offers a chapter that was only glanced at', () => {
    // `lastReadAt` is null for a glance, and the card says "you read this".
    expect(
      deriveReadingNote(
        { readChapters: [chapter({ lastReadAt: null })], citedChapterKeys: new Set() },
        NOW,
      ),
    ).toBeNull();
  });

  it('skips a chapter a note already cites, which is not a gap', () => {
    expect(
      deriveReadingNote(
        { readChapters: [chapter()], citedChapterKeys: new Set(['John|3']) },
        NOW,
      ),
    ).toBeNull();
    // Another chapter of the same book is still open.
    expect(
      deriveReadingNote(
        { readChapters: [chapter(), chapter({ chapter: 4, lastReadAt: hoursAgo(3) })], citedChapterKeys: new Set(['John|3']) },
        NOW,
      ),
    ).toMatchObject({ chapter: 4 });
  });

  it('lets old reading go rather than becoming a list of everything unwritten', () => {
    expect(
      deriveReadingNote(
        { readChapters: [chapter({ lastReadAt: hoursAgo(24 * 5) })], citedChapterKeys: new Set() },
        NOW,
      ),
    ).toBeNull();
    expect(
      deriveReadingNote(
        { readChapters: [chapter({ lastReadAt: hoursAgo(24 * 5) })], citedChapterKeys: new Set(), windowDays: 7 },
        NOW,
      ),
    ).not.toBeNull();
  });

  it('counts calendar days, so it never offers what the card cannot put an eyebrow on', () => {
    /*
     * Measured in hours the derivation and the eyebrow disagree, and the card is built and then
     * silently dropped. Read at eight last night, opening Home the morning after next: twenty
     * hours by the clock, two days by the calendar, and "you read this…" has nothing to say.
     */
    const now = new Date('2026-09-04T08:00:00');
    const lastNight = new Date('2026-09-03T20:00:00').toISOString();
    const twoNightsAgo = new Date('2026-09-02T20:00:00').toISOString();
    expect(
      deriveReadingNote({ readChapters: [chapter({ lastReadAt: lastNight })], citedChapterKeys: new Set() }, now),
    ).not.toBeNull();
    expect(
      deriveReadingNote({ readChapters: [chapter({ lastReadAt: twoNightsAgo })], citedChapterKeys: new Set() }, now),
    ).toBeNull();
  });

  it('carries the translation and the book order the card needs', () => {
    const suggestion = deriveReadingNote(
      { readChapters: [chapter({ translation: 'NLT' })], citedChapterKeys: new Set() },
      NOW,
    );
    expect(suggestion).toMatchObject({ bookOrder: 42, translation: 'NLT' });
  });
});
