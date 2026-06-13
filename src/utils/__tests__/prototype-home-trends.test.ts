import { describe, expect, it } from 'vitest';
import {
  computeActivityRhythm,
  computeActivityStreak,
  deriveTopBooks,
  deriveTopPassages,
  deriveTopFolders,
  deriveTopTags,
  deriveTopThread,
  countLooseNotes,
  formatHomeActivityLeadSuffix,
  formatHomeActivityRhythmSuffix,
  formatHomeActivityStreakSuffix,
  formatHomeNoteCount,
  formatRhythmDaypart,
  greetingForHour,
  pickContinueNote,
  pickRevisitNote,
  pickSpotlightThread,
  homeBookGreetingTone,
  selectHomeLeadTheme,
  type HomeBookInput,
  type HomeBookTrendInput,
  type HomeTagInput,
  type HomeThreadInput,
  type HomeTopBook,
  type HomeTopFolder,
  type HomeTopPassage,
  type HomeTopTag,
  type HomeTopThread,
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

  it('prefers last edit over a more recent visit-only open', () => {
    const visitedLately = {
      id: 'a',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
      lastVisited: '2026-06-11T00:00:00Z',
    };
    const editedMoreRecently = {
      id: 'b',
      createdAt: '2026-05-01T00:00:00Z',
      updatedAt: '2026-06-10T00:00:00Z',
      lastVisited: null,
    };
    expect(pickContinueNote([visitedLately, editedMoreRecently])).toBe(editedMoreRecently);
  });

  it('ignores visit-only bumps when the edit is older', () => {
    const visitOnly = {
      id: 'a',
      createdAt: '2026-06-01T00:00:00Z',
      updatedAt: '2026-06-01T00:00:00Z',
      lastVisited: '2026-06-11T00:00:00Z',
    };
    const editedLater = {
      id: 'b',
      createdAt: '2026-06-05T00:00:00Z',
      updatedAt: '2026-06-08T00:00:00Z',
      lastVisited: '2026-06-06T00:00:00Z',
    };
    expect(pickContinueNote([visitOnly, editedLater])).toBe(editedLater);
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

describe('pickRevisitNote', () => {
  const NOW = Date.parse('2026-06-12T12:00:00Z');
  const DAY = 24 * 60 * 60 * 1000;
  const opts = { nowMs: NOW, minAgeMs: 14 * DAY };

  it('returns undefined when nothing is old enough', () => {
    const recent = { id: 'a', updatedAt: '2026-06-10T00:00:00Z' };
    expect(pickRevisitNote([recent], opts)).toBeUndefined();
  });

  it('picks the least-recently active note past the age threshold', () => {
    const old1 = { id: 'a', updatedAt: '2026-03-01T00:00:00Z' };
    const old2 = { id: 'b', updatedAt: '2026-01-01T00:00:00Z' };
    const recent = { id: 'c', updatedAt: '2026-06-11T00:00:00Z' };
    expect(pickRevisitNote([old1, old2, recent], opts)?.id).toBe('b');
  });

  it('excludes the continue note', () => {
    const oldest = { id: 'a', updatedAt: '2026-01-01T00:00:00Z' };
    const next = { id: 'b', updatedAt: '2026-02-01T00:00:00Z' };
    expect(pickRevisitNote([oldest, next], { ...opts, excludeId: 'a' })?.id).toBe('b');
  });

  it('uses last edit time when judging age, not visit-only opens', () => {
    const oldEditVisitedYesterday = {
      id: 'a',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      lastVisited: '2026-06-11T00:00:00Z',
    };
    expect(pickRevisitNote([oldEditVisitedYesterday], opts)?.id).toBe('a');
  });
});

describe('pickSpotlightThread', () => {
  const thread = (overrides: Partial<HomeThreadInput> & { id: string }): HomeThreadInput => ({
    title: null,
    suggestedTitle: 'A thread',
    hasCustomTitle: false,
    noteCount: 3,
    ...overrides,
  });

  it('returns the top titled cluster', () => {
    const top = pickSpotlightThread([
      thread({ id: 'a', suggestedTitle: 'Small', noteCount: 2 }),
      thread({ id: 'b', suggestedTitle: 'Big', noteCount: 6 }),
    ]);
    expect(top?.id).toBe('b');
  });

  it('skips the excluded (lead) thread', () => {
    const top = pickSpotlightThread(
      [
        thread({ id: 'a', suggestedTitle: 'Lead', noteCount: 6 }),
        thread({ id: 'b', suggestedTitle: 'Other', noteCount: 4 }),
      ],
      { excludeId: 'a' },
    );
    expect(top?.id).toBe('b');
  });

  it('returns undefined when only single-note or untitled clusters remain', () => {
    expect(pickSpotlightThread([thread({ id: 'a', noteCount: 1 })])).toBeUndefined();
  });
});

describe('countLooseNotes', () => {
  it('counts only notes with no folder membership', () => {
    const notes = [
      { primaryCollection: 'Sermons' },
      { primaryCollection: null },
      { primaryCollection: null, secondaryCollections: ['Prayer'] },
      { primaryCollection: null },
    ];
    expect(countLooseNotes(notes)).toBe(2);
  });

  it('returns 0 for an empty list', () => {
    expect(countLooseNotes([])).toBe(0);
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

describe('deriveTopThread', () => {
  const thread = (overrides: Partial<HomeThreadInput> & { id: string }): HomeThreadInput => ({
    title: null,
    suggestedTitle: 'Some thread',
    hasCustomTitle: false,
    noteCount: 3,
    ...overrides,
  });

  it('returns empty for no qualifying threads', () => {
    expect(deriveTopThread([])).toEqual([]);
    // single-note "thread" is not a real cluster
    expect(deriveTopThread([thread({ id: 'a', noteCount: 1 })])).toEqual([]);
  });

  it('skips threads without a usable title', () => {
    expect(deriveTopThread([thread({ id: 'a', suggestedTitle: '', hasCustomTitle: false })])).toEqual([]);
  });

  it('prefers a manual title when hasCustomTitle', () => {
    const [top] = deriveTopThread([
      thread({ id: 'a', title: 'Romans & Grace', suggestedTitle: 'Auto title', hasCustomTitle: true }),
    ]);
    expect(top).toEqual({ id: 'a', title: 'Romans & Grace', noteCount: 3 });
  });

  it('sorts by note count desc, then recency', () => {
    const [top] = deriveTopThread([
      thread({ id: 'a', suggestedTitle: 'Smaller', noteCount: 2 }),
      thread({ id: 'b', suggestedTitle: 'Bigger', noteCount: 5 }),
    ]);
    expect(top?.id).toBe('b');
  });
});

describe('selectHomeLeadTheme', () => {
  const thread: HomeTopThread = { id: 't1', title: 'Romans & Grace', noteCount: 4 };
  const returningBook: HomeTopBook = { bookOrder: 45, title: 'Romans', referenceCount: 5, noteCount: 4 };
  const onceBook: HomeTopBook = { ...returningBook, referenceCount: 1 };
  const folder: HomeTopFolder = { name: 'Sermons', noteCount: 6 };
  const tag: HomeTopTag = { id: 'g1', name: 'Grace', noteCount: 4 };
  const base = { noteCount: 20, hasMoreNotes: true, today: new Date(2026, 5, 10) };

  it('returns none when nothing is available', () => {
    expect(selectHomeLeadTheme(base)).toEqual({ kind: 'none' });
  });

  it('falls back to strict priority when fewer than two strong signals', () => {
    // only a weak (mentioned-once) book + weak folder/tag (noteCount 1)
    const result = selectHomeLeadTheme({
      ...base,
      book: onceBook,
      folder: { name: 'Misc', noteCount: 1 },
      tag: { id: 'x', name: 'misc', noteCount: 1 },
    });
    expect(result).toEqual({ kind: 'book', book: onceBook, tone: 'mentioned-once' });
  });

  it('always prefers a thread when it is the only strong signal', () => {
    expect(selectHomeLeadTheme({ ...base, thread, folder: { name: 'Misc', noteCount: 1 } })).toEqual({
      kind: 'thread',
      thread,
    });
  });

  it('rotates the lead across strong signals by calendar day', () => {
    const input = { ...base, thread, book: returningBook, folder, tag };
    // three strong candidates in priority order: thread, book, folder, tag → 4 strong here
    const day0 = selectHomeLeadTheme({ ...input, today: new Date(2026, 5, 8) }); // dayIndex % 4
    const day1 = selectHomeLeadTheme({ ...input, today: new Date(2026, 5, 9) });
    const day2 = selectHomeLeadTheme({ ...input, today: new Date(2026, 5, 10) });
    const day3 = selectHomeLeadTheme({ ...input, today: new Date(2026, 5, 11) });
    const kinds = [day0, day1, day2, day3].map((t) => t.kind);
    // four consecutive days cycle through the four strong kinds in order
    expect(new Set(kinds).size).toBe(4);
    // stable: same day → same pick
    expect(selectHomeLeadTheme({ ...input, today: new Date(2026, 5, 10) })).toEqual(day2);
  });

  it('surfaces the single-note book tone', () => {
    const result = selectHomeLeadTheme({
      noteCount: 1,
      hasMoreNotes: false,
      today: new Date(2026, 5, 10),
      book: onceBook,
    });
    expect(result).toEqual({ kind: 'book', book: onceBook, tone: 'single-note' });
  });
});

describe('greetingForHour', () => {
  it('maps hour boundaries to the right greeting', () => {
    expect(greetingForHour(0)).toBe('Up late');
    expect(greetingForHour(1)).toBe('Up late');
    expect(greetingForHour(2)).toBe('Almost morning');
    expect(greetingForHour(4)).toBe('Almost morning');
    expect(greetingForHour(5)).toBe('Good morning');
    expect(greetingForHour(11)).toBe('Good morning');
    expect(greetingForHour(12)).toBe('Good afternoon');
    expect(greetingForHour(17)).toBe('Good afternoon');
    expect(greetingForHour(18)).toBe('Good evening');
    expect(greetingForHour(21)).toBe('Good evening');
    expect(greetingForHour(22)).toBe('Up late');
    expect(greetingForHour(23)).toBe('Up late');
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

describe('formatRhythmDaypart', () => {
  it('maps hours to daypart labels', () => {
    expect(formatRhythmDaypart(4)).toBe('nights');
    expect(formatRhythmDaypart(5)).toBe('mornings');
    expect(formatRhythmDaypart(11)).toBe('mornings');
    expect(formatRhythmDaypart(12)).toBe('afternoons');
    expect(formatRhythmDaypart(17)).toBe('afternoons');
    expect(formatRhythmDaypart(18)).toBe('evenings');
    expect(formatRhythmDaypart(21)).toBe('evenings');
    expect(formatRhythmDaypart(22)).toBe('nights');
    expect(formatRhythmDaypart(0)).toBe('nights');
  });
});

describe('formatHomeActivityRhythmSuffix', () => {
  it('formats weekday and daypart labels', () => {
    expect(formatHomeActivityRhythmSuffix({ dayOfWeek: 6, hour: 9 })).toBe('mostly on Saturday mornings');
    expect(formatHomeActivityRhythmSuffix({ dayOfWeek: 2, hour: 19 })).toBe('mostly on Tuesday evenings');
    expect(formatHomeActivityRhythmSuffix({ dayOfWeek: 0, hour: 0 })).toBe('mostly on Sunday nights');
    expect(formatHomeActivityRhythmSuffix({ dayOfWeek: 0, hour: 12 })).toBe('mostly on Sunday afternoons');
  });
});

describe('formatHomeActivityStreakSuffix', () => {
  it('formats day and week streak labels', () => {
    expect(formatHomeActivityStreakSuffix({ unit: 'week', count: 3 })).toBe('3 weeks in a row');
    expect(formatHomeActivityStreakSuffix({ unit: 'day', count: 5 })).toBe('5 days in a row');
  });
});

describe('formatHomeActivityLeadSuffix', () => {
  it('prefers streak over rhythm when both exist', () => {
    expect(
      formatHomeActivityLeadSuffix({ dayOfWeek: 6, hour: 13 }, { unit: 'week', count: 3 }),
    ).toBe('3 weeks in a row');
  });

  it('returns rhythm suffix when streak is absent', () => {
    expect(formatHomeActivityLeadSuffix({ dayOfWeek: 2, hour: 19 }, null)).toBe(
      'mostly on Tuesday evenings',
    );
  });

  it('returns streak suffix when rhythm is absent', () => {
    expect(formatHomeActivityLeadSuffix(null, { unit: 'week', count: 3 })).toBe('3 weeks in a row');
    expect(formatHomeActivityLeadSuffix(null, { unit: 'day', count: 5 })).toBe('5 days in a row');
  });

  it('returns null when neither rhythm nor streak', () => {
    expect(formatHomeActivityLeadSuffix(null, null)).toBeNull();
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

describe('deriveTopBooks', () => {
  const book = (
    bookOrder: number,
    title: string,
    referenceCount: number,
    noteCount: number,
  ): HomeBookTrendInput => ({
    bookOrder,
    title,
    referenceCount,
    noteCount,
  });

  it('returns empty for empty input', () => {
    expect(deriveTopBooks([], 5)).toEqual([]);
  });

  it('sorts by referenceCount desc then noteCount desc', () => {
    const books = [
      book(43, 'John', 2, 4),
      book(19, 'Psalms', 5, 1),
      book(45, 'Romans', 3, 2),
    ];
    expect(deriveTopBooks(books, 5).map((b) => b.title)).toEqual(['Psalms', 'Romans', 'John']);
  });

  it('breaks full ties by canonical book order and applies the limit', () => {
    const books = [book(43, 'John', 1, 1), book(1, 'Genesis', 1, 1), book(19, 'Psalms', 1, 1)];
    expect(deriveTopBooks(books, 2).map((b) => b.title)).toEqual(['Genesis', 'Psalms']);
  });

  it('drops books with zero references and zero notes', () => {
    expect(deriveTopBooks([book(1, 'Genesis', 0, 0)], 5)).toEqual([]);
  });

  it('aggregates multiple passages in the same book into one returning signal', () => {
    const books: HomeBookInput[] = [
      {
        bookOrder: 45,
        passages: [
          {
            passageKey: '45:8:28:28',
            displayRef: 'Romans 8:28',
            bookOrder: 45,
            chapter: 8,
            verseStart: 28,
            referenceCount: 1,
            noteCount: 1,
          },
          {
            passageKey: '45:12:1:1',
            displayRef: 'Romans 12:1',
            bookOrder: 45,
            chapter: 12,
            verseStart: 1,
            referenceCount: 1,
            noteCount: 1,
          },
        ],
      },
    ];
    const topBook = deriveTopBooks(
      [{ bookOrder: 45, title: 'Romans', referenceCount: 2, noteCount: 2 }],
      1,
    )[0];
    const topPassage = deriveTopPassages(books, 1)[0];
    expect(topBook).toEqual({
      bookOrder: 45,
      title: 'Romans',
      referenceCount: 2,
      noteCount: 2,
    });
    expect(topPassage?.referenceCount).toBe(1);
    expect(
      selectHomeLeadTheme({
        noteCount: 4,
        hasMoreNotes: false,
        today: new Date(2026, 5, 10),
        book: topBook,
      }),
    ).toEqual({ kind: 'book', book: topBook, tone: 'returning' });
  });
});

describe('homeBookGreetingTone', () => {
  it('uses single-note tone for one note with no pagination', () => {
    expect(
      homeBookGreetingTone({ noteCount: 1, hasMoreNotes: false, referenceCount: 3 }),
    ).toBe('single-note');
  });

  it('uses mentioned-once when the book only appears once across notes', () => {
    expect(
      homeBookGreetingTone({ noteCount: 4, hasMoreNotes: false, referenceCount: 1 }),
    ).toBe('mentioned-once');
  });

  it('uses returning when the book is referenced more than once', () => {
    expect(
      homeBookGreetingTone({ noteCount: 4, hasMoreNotes: false, referenceCount: 2 }),
    ).toBe('returning');
  });

  it('does not treat 1+ notes as single-note', () => {
    expect(
      homeBookGreetingTone({ noteCount: 1, hasMoreNotes: true, referenceCount: 1 }),
    ).toBe('mentioned-once');
  });
});
