import { describe, expect, it } from 'vitest';
import { preferFresherLastRead, type LastReadPosition } from '../last-read-position';

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
