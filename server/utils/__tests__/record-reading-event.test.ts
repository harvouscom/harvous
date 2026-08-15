import { describe, it, expect } from 'vitest';
import { validateReadingEventInput } from '../record-reading-event';

describe('validateReadingEventInput', () => {
  it('accepts a real chapter', () => {
    expect(validateReadingEventInput({ book: 'John', chapter: 3, translation: 'NLT' })).toEqual({
      book: 'John',
      chapter: 3,
      verse: null,
      translation: 'NLT',
    });
  });

  it('keeps a verse when one is given', () => {
    expect(validateReadingEventInput({ book: 'John', chapter: 3, verse: 16 })?.verse).toBe(16);
  });

  it('rejects chapters the canon does not have', () => {
    // The log is meant to be aggregated over later; one that accepts "Hezekiah 4" is one that
    // has to be cleaned before it can be counted.
    expect(validateReadingEventInput({ book: 'John', chapter: 99 })).toBeNull();
    expect(validateReadingEventInput({ book: 'Hezekiah', chapter: 4 })).toBeNull();
    expect(validateReadingEventInput({ book: 'John', chapter: 0 })).toBeNull();
    expect(validateReadingEventInput({ book: 'John', chapter: 1.5 })).toBeNull();
  });

  it('rejects payloads that are not events', () => {
    expect(validateReadingEventInput(null)).toBeNull();
    expect(validateReadingEventInput('John 3')).toBeNull();
    expect(validateReadingEventInput({ book: '   ', chapter: 1 })).toBeNull();
    expect(validateReadingEventInput({ book: 'John' })).toBeNull();
  });

  it('discards junk in the optional fields rather than the whole event', () => {
    expect(
      validateReadingEventInput({ book: 'John', chapter: 3, verse: 'sixteen', translation: 42 }),
    ).toEqual({ book: 'John', chapter: 3, verse: null, translation: null });
  });

  it('caps translation length so a long string cannot ride in on the column', () => {
    const result = validateReadingEventInput({
      book: 'John',
      chapter: 3,
      translation: 'X'.repeat(200),
    });
    expect(result?.translation).toHaveLength(16);
  });
});
