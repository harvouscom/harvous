import { describe, expect, it } from 'vitest';
import {
  computeActivityStreak,
  deriveTopPassages,
  deriveTopTags,
  formatHomeNoteCount,
  greetingForHour,
  pickContinueNote,
  type HomeBookInput,
  type HomeTagInput,
} from '../prototype-home-trends';

describe('pickContinueNote', () => {
  it('returns undefined for an empty list', () => {
    expect(pickContinueNote([])).toBeUndefined();
  });

  it('ignores pin priority — an unpinned recent note beats a pinned stale one', () => {
    const pinnedStale = { id: 'a', isPinned: true, updatedAt: '2026-06-01T10:00:00Z' };
    const unpinnedRecent = { id: 'b', isPinned: false, updatedAt: '2026-06-10T10:00:00Z' };
    expect(pickContinueNote([pinnedStale, unpinnedRecent])).toBe(unpinnedRecent);
  });

  it('uses the newest of lastVisited / updatedAt / createdAt', () => {
    const visitedLately = {
      id: 'a',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
      lastVisited: '2026-06-11T00:00:00Z',
    };
    const editedEarlier = {
      id: 'b',
      createdAt: '2026-05-01T00:00:00Z',
      updatedAt: '2026-06-10T00:00:00Z',
      lastVisited: null,
    };
    expect(pickContinueNote([editedEarlier, visitedLately])).toBe(visitedLately);
  });

  it('keeps the first note on exact timestamp ties', () => {
    const first = { id: 'a', updatedAt: '2026-06-10T10:00:00Z' };
    const second = { id: 'b', updatedAt: '2026-06-10T10:00:00Z' };
    expect(pickContinueNote([first, second])).toBe(first);
  });

  it('tolerates notes with no usable dates', () => {
    const dateless = { id: 'a', updatedAt: null };
    const dated = { id: 'b', createdAt: '2026-06-01T00:00:00Z' };
    expect(pickContinueNote([dateless, dated])).toBe(dated);
    expect(pickContinueNote([dateless])).toBe(dateless);
  });
});

describe('deriveTopTags', () => {
  const tag = (overrides: Partial<HomeTagInput> & { id: string; name: string }): HomeTagInput => ({
    ...overrides,
  });

  it('returns empty for empty input', () => {
    expect(deriveTopTags([], 5)).toEqual([]);
  });

  it('filters system tags and tags without notes', () => {
    const tags = [
      tag({ id: '1', name: 'Faith', noteCount: 3 }),
      tag({ id: '2', name: 'System', isSystem: true, noteCount: 9 }),
      tag({ id: '3', name: 'Unused', noteCount: 0 }),
      tag({ id: '4', name: 'Uncounted' }),
    ];
    expect(deriveTopTags(tags, 5)).toEqual([{ id: '1', name: 'Faith', noteCount: 3 }]);
  });

  it('sorts by count desc, then name asc, and respects the limit', () => {
    const tags = [
      tag({ id: '1', name: 'Prayer', noteCount: 2 }),
      tag({ id: '2', name: 'Grace', noteCount: 5 }),
      tag({ id: '3', name: 'Faith', noteCount: 2 }),
      tag({ id: '4', name: 'Hope', noteCount: 1 }),
    ];
    expect(deriveTopTags(tags, 3).map((t) => t.name)).toEqual(['Grace', 'Faith', 'Prayer']);
  });
});

describe('greetingForHour', () => {
  it('maps hour boundaries to the right greeting', () => {
    expect(greetingForHour(0)).toBe('Good morning');
    expect(greetingForHour(11)).toBe('Good morning');
    expect(greetingForHour(12)).toBe('Good afternoon');
    expect(greetingForHour(17)).toBe('Good afternoon');
    expect(greetingForHour(18)).toBe('Good evening');
    expect(greetingForHour(23)).toBe('Good evening');
  });
});

describe('formatHomeNoteCount', () => {
  it('handles singular, plural, and has-more', () => {
    expect(formatHomeNoteCount(1, false)).toBe('1 note');
    expect(formatHomeNoteCount(12, false)).toBe('12 notes');
    expect(formatHomeNoteCount(20, true)).toBe('20+ notes');
    expect(formatHomeNoteCount(1, true)).toBe('1+ notes');
  });
});

describe('computeActivityStreak', () => {
  // Wednesday June 10, 2026, local noon — fixed anchor for day/week math.
  const now = new Date(2026, 5, 10, 12, 0, 0);
  const onDay = (daysAgo: number) => ({
    updatedAt: new Date(2026, 5, 10 - daysAgo, 9, 0, 0),
  });

  it('returns null for empty input and dateless notes', () => {
    expect(computeActivityStreak([], now)).toBeNull();
    expect(computeActivityStreak([{ updatedAt: null }], now)).toBeNull();
  });

  it('counts consecutive days ending today', () => {
    expect(computeActivityStreak([onDay(0), onDay(1), onDay(2)], now)).toEqual({ unit: 'day', count: 3 });
  });

  it('lets the day streak start yesterday when today is quiet', () => {
    expect(computeActivityStreak([onDay(1), onDay(2)], now)).toEqual({ unit: 'day', count: 2 });
  });

  it('a gap breaks the day streak', () => {
    // Active today and 2 days ago — day streak is 1, no week fallback (single week).
    expect(computeActivityStreak([onDay(0), onDay(2)], now)).toBeNull();
  });

  it('falls back to a week streak for non-consecutive days across consecutive weeks', () => {
    // Wed (today), last Thursday (6 days ago), two Mondays back (16 days ago).
    expect(computeActivityStreak([onDay(0), onDay(6), onDay(16)], now)).toEqual({ unit: 'week', count: 3 });
  });

  it('a missed week breaks the week streak', () => {
    // This week + three weeks ago, nothing in between.
    expect(computeActivityStreak([onDay(0), onDay(21)], now)).toBeNull();
  });

  it('prefers the day streak over the week streak', () => {
    // 3 consecutive days spanning into last week would also be a 2-week streak.
    const notes = [onDay(0), onDay(1), onDay(2), onDay(8)];
    expect(computeActivityStreak(notes, now)).toEqual({ unit: 'day', count: 3 });
  });

  it('lets the week streak start last week when this week is quiet', () => {
    // Last week + the week before, nothing yet this week.
    expect(computeActivityStreak([onDay(7), onDay(14)], now)).toEqual({ unit: 'week', count: 2 });
  });
});

describe('deriveTopPassages', () => {
  const book = (bookOrder: number, passages: Array<Partial<HomeBookInput['passages'][number]> & { passageKey: string }>): HomeBookInput => ({
    bookOrder,
    passages: passages.map((p) => ({
      displayRef: p.passageKey,
      bookOrder,
      chapter: 1,
      verseStart: 1,
      referenceCount: 0,
      noteCount: 0,
      ...p,
    })),
  });

  it('returns empty for empty input', () => {
    expect(deriveTopPassages([], 5)).toEqual([]);
  });

  it('flattens books and sorts by referenceCount desc then noteCount desc', () => {
    const books = [
      book(43, [{ passageKey: 'John 3:16', referenceCount: 2, noteCount: 4 }]),
      book(19, [
        { passageKey: 'Psalm 23:1', referenceCount: 5, noteCount: 1 },
        { passageKey: 'Psalm 1:1', referenceCount: 2, noteCount: 1 },
      ]),
    ];
    expect(deriveTopPassages(books, 5).map((p) => p.passageKey)).toEqual([
      'Psalm 23:1',
      'John 3:16',
      'Psalm 1:1',
    ]);
  });

  it('breaks full ties by canonical order and applies the limit', () => {
    const books = [
      book(43, [{ passageKey: 'John 1:1', referenceCount: 1, noteCount: 1 }]),
      book(1, [
        { passageKey: 'Genesis 1:3', chapter: 1, verseStart: 3, referenceCount: 1, noteCount: 1 },
        { passageKey: 'Genesis 1:1', chapter: 1, verseStart: 1, referenceCount: 1, noteCount: 1 },
      ]),
    ];
    expect(deriveTopPassages(books, 2).map((p) => p.passageKey)).toEqual([
      'Genesis 1:1',
      'Genesis 1:3',
    ]);
  });

  it('drops passages with zero references and zero notes', () => {
    const books = [book(1, [{ passageKey: 'Genesis 1:1', referenceCount: 0, noteCount: 0 }])];
    expect(deriveTopPassages(books, 5)).toEqual([]);
  });
});
