import { describe, expect, it } from 'vitest';
import {
  lastReadPositionReference,
  parseLastReadPosition,
  serializeLastReadPosition,
  validateLastReadPositionInput,
} from '../last-read-position';

describe('validateLastReadPositionInput', () => {
  it('accepts a chapter and derives its book order', () => {
    expect(
      validateLastReadPositionInput({ book: 'John', chapter: 15, translation: 'nlt' }),
    ).toEqual({ book: 'John', bookOrder: 42, chapter: 15, translation: 'NLT' });
  });

  it('carries a verse anchor when the surface tracks one', () => {
    expect(
      validateLastReadPositionInput({ book: 'John', chapter: 15, translation: 'ESV', verse: 5 }),
    ).toMatchObject({ verse: 5 });
  });

  it('omits the verse rather than inventing one', () => {
    const position = validateLastReadPositionInput({
      book: 'John',
      chapter: 15,
      translation: 'ESV',
    });

    expect(position).not.toHaveProperty('verse');
  });

  it('rejects a bad verse instead of quietly dropping it', () => {
    const base = { book: 'John', chapter: 15, translation: 'ESV' };
    expect(validateLastReadPositionInput({ ...base, verse: 0 })).toBeNull();
    expect(validateLastReadPositionInput({ ...base, verse: 1.5 })).toBeNull();
    expect(validateLastReadPositionInput({ ...base, verse: 'five' })).toBeNull();
  });

  it('rejects a chapter outside the book and a book outside the canon', () => {
    expect(validateLastReadPositionInput({ book: 'Jude', chapter: 2, translation: 'ESV' })).toBeNull();
    expect(validateLastReadPositionInput({ book: 'Hezekiah', chapter: 1, translation: 'ESV' })).toBeNull();
  });
});

describe('parseLastReadPosition', () => {
  it('round-trips what it stored', () => {
    const input = validateLastReadPositionInput({ book: 'Romans', chapter: 8, translation: 'ESV' });
    const raw = serializeLastReadPosition(input!, '2026-08-14T10:00:00.000Z');

    expect(parseLastReadPosition(raw)).toEqual({
      book: 'Romans',
      bookOrder: 44,
      chapter: 8,
      translation: 'ESV',
      readAt: '2026-08-14T10:00:00.000Z',
    });
  });

  it('degrades to no saved position rather than throwing', () => {
    expect(parseLastReadPosition(null)).toBeNull();
    expect(parseLastReadPosition('')).toBeNull();
    expect(parseLastReadPosition('not json')).toBeNull();
    expect(parseLastReadPosition('"a string"')).toBeNull();
    expect(parseLastReadPosition('{}')).toBeNull();
  });

  it('rejects a stored value whose chapter no longer resolves', () => {
    const raw = JSON.stringify({
      book: 'Jude',
      bookOrder: 64,
      chapter: 7,
      translation: 'ESV',
      readAt: '2026-08-14T10:00:00.000Z',
    });

    expect(parseLastReadPosition(raw)).toBeNull();
  });

  it('rejects a missing or unparseable timestamp', () => {
    const withReadAt = (readAt: unknown) =>
      JSON.stringify({ book: 'John', bookOrder: 42, chapter: 15, translation: 'ESV', readAt });

    expect(parseLastReadPosition(withReadAt(undefined))).toBeNull();
    expect(parseLastReadPosition(withReadAt('whenever'))).toBeNull();
    expect(parseLastReadPosition(withReadAt(1786723674651))).toBeNull();
  });

  it('ignores a book order stored alongside a book it does not match', () => {
    const raw = JSON.stringify({
      book: 'John',
      bookOrder: 999,
      chapter: 15,
      translation: 'ESV',
      readAt: '2026-08-14T10:00:00.000Z',
    });

    expect(parseLastReadPosition(raw)?.bookOrder).toBe(42);
  });
});

describe('lastReadPositionReference', () => {
  it('names the chapter to open', () => {
    const position = parseLastReadPosition(
      serializeLastReadPosition(
        validateLastReadPositionInput({ book: 'Psalms', chapter: 23, translation: 'NLT' })!,
        '2026-08-14T10:00:00.000Z',
      ),
    );

    expect(lastReadPositionReference(position!)).toBe('Psalms 23');
  });
});
