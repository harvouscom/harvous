import { describe, expect, it } from 'vitest';
import {
  computeActivityRhythm,
  computeActivityStreak,
  deriveTopPassages,
  deriveTopFolders,
  deriveTopTags,
  formatActivityRhythm,
  formatHomeNoteCount,
  formatRhythmHour,
  greetingForHour,
  pickContinueNote,
  pickHomeEncouragement,
  homePassageGreetingTone,
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
      tag({ id: '2', name: 'Grace', isSystem: true, noteCount: 9 }),
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

describe('deriveTopFolders', () => {
  it('returns empty for notes without folders', () => {
    expect(deriveTopFolders([{ primaryCollection: null }], 5)).toEqual([]);
  });

  it('counts folder membership and skips My Pile', () => {
    expect(
      deriveTopFolders(
        [
          { primaryCollection: 'Salvation', secondaryCollections: ['Grace'] },
          { primaryCollection: 'Salvation' },
          { primaryCollection: 'My Pile' },
        ],
        5,
      ),
    ).toEqual([
      { name: 'Salvation', noteCount: 2 },
      { name: 'Grace', noteCount: 1 },
    ]);
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

describe('computeActivityRhythm', () => {
  const tuesday7pm = (weekOffset = 0) => ({
    updatedAt: new Date(2026, 5, 9 + weekOffset * 7, 19, 0, 0),
  });

  it('returns null for empty input and dateless notes', () => {
    expect(computeActivityRhythm([])).toBeNull();
    expect(computeActivityRhythm([{ updatedAt: null }])).toBeNull();
  });

  it('returns null when there are fewer than four samples', () => {
    expect(computeActivityRhythm([tuesday7pm(), tuesday7pm(), tuesday7pm()])).toBeNull();
  });

  it('returns null when no day or hour reaches the winner threshold', () => {
    const notes = [
      { updatedAt: new Date(2026, 5, 9, 19, 0, 0) },
      { updatedAt: new Date(2026, 5, 10, 9, 0, 0) },
      { updatedAt: new Date(2026, 5, 11, 14, 0, 0) },
      { updatedAt: new Date(2026, 5, 12, 20, 0, 0) },
    ];
    expect(computeActivityRhythm(notes)).toBeNull();
  });

  it('picks the most common weekday and hour when both clear', () => {
    const notes = [tuesday7pm(), tuesday7pm(1), tuesday7pm(2), { updatedAt: new Date(2026, 5, 10, 9, 0, 0) }];
    expect(computeActivityRhythm(notes)).toEqual({ dayOfWeek: 2, hour: 19 });
  });

  it('breaks day ties by most recent activity', () => {
    const notes = [
      { updatedAt: new Date(2026, 5, 9, 19, 0, 0) },
      { updatedAt: new Date(2026, 5, 16, 19, 0, 0) },
      { updatedAt: new Date(2026, 5, 10, 19, 0, 0) },
      { updatedAt: new Date(2026, 5, 17, 19, 0, 0) },
    ];
    expect(computeActivityRhythm(notes)).toEqual({ dayOfWeek: 3, hour: 19 });
  });
});

describe('formatRhythmHour', () => {
  it('maps 24h to 12h labels', () => {
    expect(formatRhythmHour(0)).toBe('12 AM');
    expect(formatRhythmHour(12)).toBe('12 PM');
    expect(formatRhythmHour(19)).toBe('7 PM');
  });
});

describe('formatActivityRhythm', () => {
  it('formats weekday plural and hour labels', () => {
    expect(formatActivityRhythm({ dayOfWeek: 2, hour: 19 })).toBe('usually study on Tuesdays, around 7 PM');
    expect(formatActivityRhythm({ dayOfWeek: 0, hour: 0 })).toBe('usually study on Sundays, around 12 AM');
    expect(formatActivityRhythm({ dayOfWeek: 0, hour: 12 })).toBe('usually study on Sundays, around 12 PM');
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

describe('homePassageGreetingTone', () => {
  it('uses single-note tone for one note with no pagination', () => {
    expect(
      homePassageGreetingTone({ noteCount: 1, hasMoreNotes: false, referenceCount: 3 }),
    ).toBe('single-note');
  });

  it('uses mentioned-once when the passage only appears once across notes', () => {
    expect(
      homePassageGreetingTone({ noteCount: 4, hasMoreNotes: false, referenceCount: 1 }),
    ).toBe('mentioned-once');
  });

  it('uses returning when the passage is referenced more than once', () => {
    expect(
      homePassageGreetingTone({ noteCount: 4, hasMoreNotes: false, referenceCount: 2 }),
    ).toBe('returning');
  });

  it('does not treat 1+ notes as single-note', () => {
    expect(
      homePassageGreetingTone({ noteCount: 1, hasMoreNotes: true, referenceCount: 1 }),
    ).toBe('mentioned-once');
  });
});

describe('pickHomeEncouragement', () => {
  const today = new Date(2026, 5, 10, 12, 0, 0);

  const base = {
    noteCount: 5,
    hasMoreNotes: false,
    streak: null as { unit: 'day' | 'week'; count: number } | null,
    hasTopPassage: false,
    hour: 14,
    today,
  };

  it('returns the first-note closer for a single note with no pagination', () => {
    expect(pickHomeEncouragement({ ...base, noteCount: 1 })).toBe('It\'s a start.');
  });

  it('does not treat 1+ notes as first-note', () => {
    expect(pickHomeEncouragement({ ...base, noteCount: 1, hasMoreNotes: true })).not.toBe(
      'It\'s a start.',
    );
  });

  it('returns week-streak closers by tier when streak is not in the greeting body', () => {
    expect(pickHomeEncouragement({ ...base, streak: { unit: 'week', count: 2 } })).toBe(
      'Two weeks now. That adds up.',
    );
    expect(pickHomeEncouragement({ ...base, streak: { unit: 'week', count: 3 } })).toBe(
      'Week after week. That adds up.',
    );
    expect(pickHomeEncouragement({ ...base, streak: { unit: 'week', count: 5 } })).toBe(
      'Week after week. That adds up.',
    );
  });

  it('returns day-streak closers by tier when streak is not in the greeting body', () => {
    expect(pickHomeEncouragement({ ...base, streak: { unit: 'day', count: 2 } })).toBe(
      'Good to see you keeping at it.',
    );
    expect(pickHomeEncouragement({ ...base, streak: { unit: 'day', count: 6 } })).toBe(
      'Good to see you keeping at it.',
    );
    expect(pickHomeEncouragement({ ...base, streak: { unit: 'day', count: 7 } })).toBe('Day after day. That adds up.');
  });

  it('skips streak closers when streak is already shown in the greeting body', () => {
    expect(
      pickHomeEncouragement({
        ...base,
        streak: { unit: 'week', count: 3 },
        streakShownInGreeting: true,
        hasTopPassage: true,
      }),
    ).toBe('Those are worth sitting with.');
    expect(
      pickHomeEncouragement({
        ...base,
        streak: { unit: 'day', count: 5 },
        streakShownInGreeting: true,
        hour: 18,
      }),
    ).toBe('Good place to stop for tonight.');
  });

  it('returns the passage closer when there is no streak', () => {
    expect(pickHomeEncouragement({ ...base, hasTopPassage: true })).toBe(
      'Those are worth sitting with.',
    );
  });

  it('returns evening and morning closers when there is no streak or passage', () => {
    expect(pickHomeEncouragement({ ...base, hour: 18 })).toBe('Good place to stop for tonight.');
    expect(pickHomeEncouragement({ ...base, hour: 23 })).toBe('Good place to stop for tonight.');
    expect(pickHomeEncouragement({ ...base, hour: 11 })).toBe('Nice way to open the day.');
  });

  it('prefers streak over time-of-day and passage', () => {
    expect(
      pickHomeEncouragement({
        ...base,
        streak: { unit: 'day', count: 3 },
        hasTopPassage: true,
        hour: 18,
      }),
    ).toBe('Good to see you keeping at it.');
  });

  it('prefers first note over streak', () => {
    expect(
      pickHomeEncouragement({
        ...base,
        noteCount: 1,
        streak: { unit: 'week', count: 4 },
      }),
    ).toBe('It\'s a start.');
  });

  it('returns a stable daily pool pick for generic afternoon context', () => {
    const pool = [
      'Glad you\'re here.',
      'It\'ll be here when you need it.',
      'Keep at your own pace.',
      'One thought at a time.',
      'Worth coming back to.',
      'Whenever you\'re ready.',
    ];
    const a = pickHomeEncouragement({ ...base, hour: 14, today: new Date(2026, 5, 10, 12, 0, 0) });
    const b = pickHomeEncouragement({ ...base, hour: 15, today: new Date(2026, 5, 10, 18, 0, 0) });
    expect(a).toBe(b);
    expect(pool).toContain(a);
  });

  it('can change the pool pick on a different calendar day', () => {
    const dayA = pickHomeEncouragement({ ...base, hour: 14, today: new Date(2026, 5, 10, 12, 0, 0) });
    const dayB = pickHomeEncouragement({ ...base, hour: 14, today: new Date(2026, 5, 11, 12, 0, 0) });
    expect(dayA).not.toBe(dayB);
  });
});
