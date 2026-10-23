import { describe, expect, it } from 'vitest';
import {
  parseLastReadPosition,
  preferFresherLastRead,
  serializeLastReadPosition,
  validateLastReadPositionInput,
  type LastReadPosition,
} from '../last-read-position';

const at = (iso: string, extra: Partial<LastReadPosition> = {}): LastReadPosition => ({
  book: 'Exodus',
  bookOrder: 2,
  chapter: 5,
  translation: 'NLT',
  readAt: iso,
  ...extra,
});

describe('preferFresherLastRead', () => {
  it('keeps the locally newer chapter when a refetch is behind', () => {
    const local = at('2026-09-15T20:40:00.000Z', { chapter: 12, verse: 8 });
    const server = at('2026-09-15T20:30:00.000Z', { chapter: 5 });
    expect(preferFresherLastRead(local, server)).toEqual(local);
  });

  it('takes the server when it is actually newer', () => {
    const local = at('2026-09-15T20:30:00.000Z', { chapter: 5 });
    const server = at('2026-09-15T20:40:00.000Z', { chapter: 12, verse: 8 });
    expect(preferFresherLastRead(local, server)).toEqual(server);
  });

  it('prefers a verse when the timestamps match', () => {
    const without = at('2026-09-15T20:40:00.000Z', { chapter: 12 });
    const withVerse = at('2026-09-15T20:40:00.000Z', { chapter: 12, verse: 8 });
    expect(preferFresherLastRead(without, withVerse)?.verse).toBe(8);
  });
});

describe('validateLastReadPositionInput — atEnd', () => {
  const base = { book: 'John', chapter: 3, translation: 'NET', verse: 20 };

  it('keeps atEnd with a verse and round-trips it', () => {
    const input = validateLastReadPositionInput({ ...base, atEnd: true });
    expect(input).toMatchObject({ verse: 20, atEnd: true });
    const parsed = parseLastReadPosition(serializeLastReadPosition(input!, '2026-10-22T12:00:00.000Z'));
    expect(parsed?.atEnd).toBe(true);
  });

  it('drops anything that is not a plain true, without refusing the position', () => {
    for (const atEnd of [false, 'yes', 1, null]) {
      const input = validateLastReadPositionInput({ ...base, atEnd });
      expect(input).toMatchObject({ verse: 20 });
      expect(input).not.toHaveProperty('atEnd');
    }
  });

  it('ignores atEnd on a chapter-only position', () => {
    const { verse: _verse, ...chapterOnly } = base;
    expect(validateLastReadPositionInput({ ...chapterOnly, atEnd: true })).not.toHaveProperty('atEnd');
  });
});
