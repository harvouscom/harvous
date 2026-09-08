import { describe, expect, it } from 'vitest';
import { collapseReadingHistory, validateReadingEventInput } from '../record-reading-event';

describe('validateReadingEventInput', () => {
  it('accepts a canonical chapter and derives its book order', () => {
    const input = validateReadingEventInput({
      book: 'John',
      chapter: 15,
      translation: 'nlt',
      dwellBucket: 'read',
    });

    expect(input).toEqual({
      book: 'John',
      bookOrder: 42,
      chapter: 15,
      translation: 'NLT',
      dwellBucket: 'read',
    });
  });

  it('ignores a book order the sender supplies, so a stale one cannot split a book', () => {
    const input = validateReadingEventInput({
      book: 'John',
      bookOrder: 999,
      chapter: 1,
      translation: 'ESV',
      dwellBucket: 'glance',
    });

    expect(input?.bookOrder).toBe(42);
  });

  it('rejects a chapter past the end of the book', () => {
    expect(
      validateReadingEventInput({
        book: 'Jude',
        chapter: 2,
        translation: 'ESV',
        dwellBucket: 'read',
      }),
    ).toBeNull();
  });

  it('rejects a book that is not canonical', () => {
    expect(
      validateReadingEventInput({
        book: 'Hezekiah',
        chapter: 1,
        translation: 'ESV',
        dwellBucket: 'read',
      }),
    ).toBeNull();
  });

  it('rejects an unknown dwell bucket', () => {
    expect(
      validateReadingEventInput({
        book: 'John',
        chapter: 15,
        translation: 'ESV',
        dwellBucket: 'skimmed',
      }),
    ).toBeNull();
  });

  it('rejects a non-integer chapter and an empty translation', () => {
    const base = { book: 'John', translation: 'ESV', dwellBucket: 'read' };
    expect(validateReadingEventInput({ ...base, chapter: 1.5 })).toBeNull();
    expect(validateReadingEventInput({ ...base, chapter: 0 })).toBeNull();
    expect(validateReadingEventInput({ ...base, chapter: 1, translation: '   ' })).toBeNull();
  });
});

describe('collapseReadingHistory', () => {
  it('keeps one entry per chapter, timestamped by the most recent read', () => {
    const entries = collapseReadingHistory([
      { book: 'John', bookOrder: 42, chapter: 15, dwellBucket: 'read', createdAt: '2026-08-14T10:00:00.000Z' },
      { book: 'John', bookOrder: 42, chapter: 15, dwellBucket: 'read', createdAt: '2026-08-01T10:00:00.000Z' },
      { book: 'John', bookOrder: 42, chapter: 16, dwellBucket: 'glance', createdAt: '2026-08-13T10:00:00.000Z' },
    ]);

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ chapter: 15, createdAt: '2026-08-14T10:00:00.000Z' });
    expect(entries[1]).toMatchObject({ chapter: 16, dwellBucket: 'glance' });
  });

  it('keeps the strongest bucket, so a later glance does not make a chapter unread', () => {
    const entries = collapseReadingHistory([
      { book: 'John', bookOrder: 42, chapter: 15, dwellBucket: 'glance', createdAt: '2026-08-14T10:00:00.000Z' },
      { book: 'John', bookOrder: 42, chapter: 15, dwellBucket: 'study', createdAt: '2026-08-07T10:00:00.000Z' },
    ]);

    expect(entries).toEqual([
      {
        book: 'John',
        bookOrder: 42,
        chapter: 15,
        dwellBucket: 'study',
        createdAt: '2026-08-14T10:00:00.000Z',
        // Opened today, last actually *read* a week ago. Both facts are kept, because a card
        // saying "you read this today" on the strength of a three-second glance is built on
        // nothing, and neither the bucket nor `createdAt` can be asked which day that was.
        lastReadAt: '2026-08-07T10:00:00.000Z',
      },
    ]);
  });

  it('leaves lastReadAt null for a chapter only ever glanced at', () => {
    const entries = collapseReadingHistory([
      { book: 'John', bookOrder: 42, chapter: 15, dwellBucket: 'glance', createdAt: '2026-08-14T10:00:00.000Z' },
      { book: 'John', bookOrder: 42, chapter: 15, dwellBucket: 'glance', createdAt: '2026-08-13T10:00:00.000Z' },
    ]);
    expect(entries[0]?.lastReadAt).toBeNull();
  });

  it('takes the newest read, not the newest row, since rows arrive newest-first', () => {
    const entries = collapseReadingHistory([
      { book: 'John', bookOrder: 42, chapter: 15, dwellBucket: 'glance', createdAt: '2026-08-14T10:00:00.000Z' },
      { book: 'John', bookOrder: 42, chapter: 15, dwellBucket: 'read', createdAt: '2026-08-12T10:00:00.000Z' },
      { book: 'John', bookOrder: 42, chapter: 15, dwellBucket: 'study', createdAt: '2026-08-07T10:00:00.000Z' },
    ]);
    expect(entries[0]?.lastReadAt).toBe('2026-08-12T10:00:00.000Z');
  });

  it('drops rows it cannot read rather than emitting a broken entry', () => {
    const entries = collapseReadingHistory([
      { book: 'John', bookOrder: 42, chapter: 15, dwellBucket: 'nonsense', createdAt: '2026-08-14T10:00:00.000Z' },
      { book: '', bookOrder: 42, chapter: 16, dwellBucket: 'read', createdAt: '2026-08-14T10:00:00.000Z' },
      { book: 'John', bookOrder: 42, chapter: 0, dwellBucket: 'read', createdAt: '2026-08-14T10:00:00.000Z' },
      { book: 'John', bookOrder: 42, chapter: 17, dwellBucket: 'read', createdAt: null },
    ]);

    expect(entries).toEqual([]);
  });

  it('accepts Date timestamps from the driver', () => {
    const entries = collapseReadingHistory([
      {
        book: 'Romans',
        bookOrder: 44,
        chapter: 8,
        dwellBucket: 'study',
        createdAt: new Date('2026-08-14T10:00:00.000Z'),
      },
    ]);

    expect(entries[0].createdAt).toBe('2026-08-14T10:00:00.000Z');
  });
});
