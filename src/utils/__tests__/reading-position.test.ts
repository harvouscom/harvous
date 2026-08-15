import { describe, it, expect } from 'vitest';
import {
  parseReadingPosition,
  readingPositionReference,
  serializeReadingPosition,
} from '../reading-position';

describe('parseReadingPosition', () => {
  it('round-trips a position', () => {
    const position = {
      book: 'John',
      chapter: 3,
      verse: 16,
      translation: 'NLT',
      at: '2026-08-14T12:00:00.000Z',
    };
    expect(parseReadingPosition(serializeReadingPosition(position))).toEqual(position);
  });

  it('reads a position with no verse or translation', () => {
    const raw = JSON.stringify({ book: 'Nahum', chapter: 2, at: '2026-08-14T12:00:00.000Z' });
    expect(parseReadingPosition(raw)).toEqual({
      book: 'Nahum',
      chapter: 2,
      verse: undefined,
      translation: undefined,
      at: '2026-08-14T12:00:00.000Z',
    });
  });

  it('treats anything malformed as no bookmark rather than throwing', () => {
    // The column holds free-form JSON written by past and future versions of the app; a blob
    // that has drifted must read as "no bookmark", never as a crash on Home.
    expect(parseReadingPosition(null)).toBeNull();
    expect(parseReadingPosition('')).toBeNull();
    expect(parseReadingPosition('not json')).toBeNull();
    expect(parseReadingPosition('[]')).toBeNull();
    expect(parseReadingPosition('{"book":"","chapter":1,"at":"x"}')).toBeNull();
    expect(parseReadingPosition('{"book":"John","chapter":0,"at":"x"}')).toBeNull();
    expect(parseReadingPosition('{"book":"John","chapter":"3","at":"x"}')).toBeNull();
    expect(parseReadingPosition('{"book":"John","chapter":3}')).toBeNull();
  });

  it('drops a nonsense verse without discarding the position', () => {
    const raw = '{"book":"John","chapter":3,"verse":-2,"at":"2026-08-14T12:00:00.000Z"}';
    expect(parseReadingPosition(raw)).toMatchObject({ book: 'John', chapter: 3, verse: undefined });
  });
});

describe('readingPositionReference', () => {
  it('writes the verse only when there is one', () => {
    const at = '2026-08-14T12:00:00.000Z';
    expect(readingPositionReference({ book: 'John', chapter: 3, verse: 16, at })).toBe('John 3:16');
    expect(readingPositionReference({ book: 'Nahum', chapter: 2, at })).toBe('Nahum 2');
  });
});
