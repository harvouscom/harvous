import { describe, expect, it } from 'vitest';
import { UNIVERSAL_BIBLE_ENTITIES } from '@/utils/universal-bible-entities';
import {
  deriveStudyArcsFromNodes,
  computeActivityRhythm,
  computeLastActivityTime,
  countWeeklyActivityDays,
  deriveSubjectConnections,
  deriveCrossRefConnections,
  derivePassageConnections,
  deriveTopBooks,
  deriveTopPassages,
  deriveTopFolders,
  deriveTopTags,
  deriveTopThread,
  homeLeadDisplayName,
  excludeRecallCandidatesMatchingName,
  countLooseNotes,
  formatHomeActivityLeadSuffix,
  formatHomeActivityRhythmSuffix,
  formatHomeLastActivitySuffix,
  formatHomeWeeklyActivitySuffix,
  formatHomeNoteCount,
  formatRhythmDaypart,
  greetingForHour,
  homeBookGreetingTone,
  homeContinueCardEyebrow,
  homeFolderGreetingTone,
  homeLeadCopyLayout,
  homeSpotlightThreadEyebrow,
  homeTagGreetingTone,
  homeThreadGreetingTone,
  pickContinueNote,
  pickRevisitNote,
  librarySectionCountsFromById,
  recallSectionDiversityBoost,
  revisitTouchTimeMs,
  revisitReturnsBoost,
  REVISIT_RETURNS_MAX_BOOST,
  REVISIT_RETURNS_SATURATION,
  forgettingAwarePriority,
  deriveStudyArcs,
  deriveSectionArcs,
  sectionArcCopy,
  studyArcSinceLabel,
  studyArcToneLabel,
  selectRecallOpportunities,
  compareRecallUsefulness,
  orderRecallWithSoftVariety,
  recallKindTier,
  pickRecallTrend,
  recallTrendLine,
  deriveContinueBook,
  deriveRecurringPerson,
  pickBareHighlight,
  isHighlightUnannotated,
  isAnnotatableHighlight,
  deriveReferenceWordConnections,
  referenceWordKey,
  findUnannotatedHighlightForRef,
  findUnannotatedHighlightForChapter,
  findHighlightForRef,
  findHighlightForChapter,
  scriptureRefsMatch,
  highlightMatchesChapter,
  deriveReflectionPrompt,
  connectSuggestionRecallMeta,
  connectSuggestionRecallEyebrow,
  formatConnectSuggestionTitle,
  suggestConnectThreadName,
  continueBookRecallMeta,
  recurringPersonRecallMeta,
  crossRefGapRecallMeta,
  recallTrendGreetingParts,
  pickRevisitHighlight,
  pickSpotlightThread,
  stableStringHash,
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

  it('counts a measured read as where you left off', () => {
    const readLately = { id: 'a', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' };
    const editedEarlier = { id: 'b', createdAt: '2026-05-01T00:00:00Z', updatedAt: '2026-06-01T00:00:00Z' };
    expect(
      pickContinueNote([readLately, editedEarlier], {
        lastSubstantiveVisitAtById: { a: Date.parse('2026-06-10T00:00:00Z') },
      }),
    ).toBe(readLately);
  });

  /*
   * The distinction the docblock rests on. Both notes carry a recent `lastVisited`; only one
   * has a measured read. If this ever fails, the column and the map have been conflated and
   * the June 2026 fix has been undone from the other side.
   */
  it('still ignores lastVisited when the note has no measured read', () => {
    const bumpedOnly = {
      id: 'a',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
      lastVisited: '2026-06-20T00:00:00Z',
    };
    const editedEarlier = {
      id: 'b',
      createdAt: '2026-05-01T00:00:00Z',
      updatedAt: '2026-06-01T00:00:00Z',
      lastVisited: '2026-06-19T00:00:00Z',
    };
    expect(
      pickContinueNote([bumpedOnly, editedEarlier], { lastSubstantiveVisitAtById: {} }),
    ).toBe(editedEarlier);
  });

  it('leaves the answer alone when an empty visit map is passed', () => {
    const older = { id: 'a', updatedAt: '2026-06-01T00:00:00Z' };
    const newer = { id: 'b', updatedAt: '2026-06-09T00:00:00Z' };
    expect(pickContinueNote([older, newer], { lastSubstantiveVisitAtById: {} })).toBe(
      pickContinueNote([older, newer]),
    );
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

  it('skips excluded ids and returns the next most recently edited note', () => {
    const active = { id: 'active', updatedAt: '2026-06-11T10:00:00Z' };
    const previous = { id: 'previous', updatedAt: '2026-06-10T10:00:00Z' };
    expect(pickContinueNote([active, previous], { excludeIds: ['active'] })).toBe(previous);
    expect(pickContinueNote([active, previous], { excludeIds: ['active'] }).id).not.toBe('active');
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

  it('excludes multiple ids via excludeIds', () => {
    const oldest = { id: 'a', updatedAt: '2026-01-01T00:00:00Z' };
    const next = { id: 'b', updatedAt: '2026-02-01T00:00:00Z' };
    const third = { id: 'c', updatedAt: '2026-03-01T00:00:00Z' };
    expect(pickRevisitNote([oldest, next, third], { ...opts, excludeIds: ['a', 'b'] })?.id).toBe('c');
  });

  it('breaks a tie toward the note that keeps being returned to', () => {
    // Same age, same meaning weight — the returns count is the only thing separating them.
    const returnedTo = { id: 'a', updatedAt: '2026-01-01T00:00:00Z' };
    const readOnce = { id: 'b', updatedAt: '2026-01-01T00:00:00Z' };
    const picked = pickRevisitNote([readOnce, returnedTo], {
      ...opts,
      meaningWeightById: { a: 0.5, b: 0.5 },
      visitCountById: { a: 6, b: 1 },
    });
    expect(picked?.id).toBe('a');
  });

  it('cannot let returns overrule a note that is both more meaningful and more faded', () => {
    const oftenReturnedTo = { id: 'a', updatedAt: '2026-05-01T00:00:00Z' };
    const farMoreFaded = { id: 'b', updatedAt: '2026-01-01T00:00:00Z' };
    const picked = pickRevisitNote([oftenReturnedTo, farMoreFaded], {
      ...opts,
      meaningWeightById: { a: 0.4, b: 0.9 },
      visitCountById: { a: 20, b: 0 },
    });
    expect(picked?.id).toBe('b');
  });

  it('rotates daily among the stalest candidates', () => {
    const notes = [
      { id: 'a', updatedAt: '2026-01-01T00:00:00Z' },
      { id: 'b', updatedAt: '2026-02-01T00:00:00Z' },
      { id: 'c', updatedAt: '2026-03-01T00:00:00Z' },
    ];
    expect(pickRevisitNote(notes, { ...opts, rotationDayIndex: 0 })?.id).toBe('a');
    expect(pickRevisitNote(notes, { ...opts, rotationDayIndex: 1 })?.id).toBe('b');
    expect(pickRevisitNote(notes, { ...opts, rotationDayIndex: 2 })?.id).toBe('c');
    expect(pickRevisitNote(notes, { ...opts, rotationDayIndex: 3 })?.id).toBe('a');
  });

  it('floors the rotation pool at the five stalest notes for small spaces', () => {
    const notes = [
      { id: 'a', updatedAt: '2026-01-01T00:00:00Z' },
      { id: 'b', updatedAt: '2026-02-01T00:00:00Z' },
      { id: 'c', updatedAt: '2026-03-01T00:00:00Z' },
      { id: 'd', updatedAt: '2026-04-01T00:00:00Z' },
      { id: 'e', updatedAt: '2026-05-01T00:00:00Z' },
      { id: 'f', updatedAt: '2026-05-15T00:00:00Z' },
    ];
    // 6 candidates → pool floors at 5 → index 5 % 5 wraps back to the stalest.
    expect(pickRevisitNote(notes, { ...opts, rotationDayIndex: 5 })?.id).toBe('a');
  });

  it('grows the rotation pool with the backlog (~25%)', () => {
    // 40 thin notes, oldest first by month offset → pool = round(40*0.25) = 10.
    const notes = Array.from({ length: 40 }, (_, i) => ({
      id: `n${i}`,
      updatedAt: new Date(Date.parse('2026-01-01T00:00:00Z') + i * DAY).toISOString(),
    }));
    // The 10th-stalest note is reachable; an 11th index wraps back into the pool.
    expect(pickRevisitNote(notes, { ...opts, rotationDayIndex: 9 })?.id).toBe('n9');
    expect(pickRevisitNote(notes, { ...opts, rotationDayIndex: 10 })?.id).toBe('n0');
  });

  it('salts rotation so different spaces do not all land on the same pick', () => {
    const notes = [
      { id: 'a', updatedAt: '2026-01-01T00:00:00Z' },
      { id: 'b', updatedAt: '2026-02-01T00:00:00Z' },
      { id: 'c', updatedAt: '2026-03-01T00:00:00Z' },
    ];
    expect(pickRevisitNote(notes, { ...opts, rotationDayIndex: 0, rotationSalt: 0 })?.id).toBe('a');
    expect(pickRevisitNote(notes, { ...opts, rotationDayIndex: 0, rotationSalt: 1 })?.id).toBe('b');
    expect(pickRevisitNote(notes, { ...opts, rotationDayIndex: 0, rotationSalt: 2 })?.id).toBe('c');
  });

  it('prefers substantive study notes over older scratch notes', () => {
    const oldScratch = { id: 'scratch', updatedAt: '2026-01-01T00:00:00Z', content: '<p>hi</p>' };
    const scripture = { id: 'verse', updatedAt: '2026-02-01T00:00:00Z', noteType: 'scripture' };
    const filed = { id: 'filed', updatedAt: '2026-03-01T00:00:00Z', primaryCollection: 'Romans study' };
    const longBody = {
      id: 'essay',
      updatedAt: '2026-04-01T00:00:00Z',
      content: `<p>${'word '.repeat(40)}</p>`,
    };
    // Oldest overall is the scratch note, but the stalest *substantive* note wins.
    expect(pickRevisitNote([oldScratch, scripture, filed, longBody], opts)?.id).toBe('verse');
  });

  it('falls back to scratch notes only when no substantive ones qualify', () => {
    const scratchA = { id: 'a', updatedAt: '2026-01-01T00:00:00Z', content: '<p>ok</p>' };
    const scratchB = { id: 'b', updatedAt: '2026-02-01T00:00:00Z', content: '<p>ok</p>' };
    expect(pickRevisitNote([scratchA, scratchB], opts)?.id).toBe('a');
  });

  describe('fallbackMinAgeMs', () => {
    const fallbackOpts = { ...opts, fallbackMinAgeMs: DAY };

    it('uses fallback when the strict pool is empty', () => {
      const recent = { id: 'a', updatedAt: '2026-06-05T00:00:00Z', content: 'x'.repeat(120) };
      const older = { id: 'b', updatedAt: '2026-06-01T00:00:00Z', content: 'x'.repeat(120) };
      expect(pickRevisitNote([recent, older], fallbackOpts)?.id).toBe('b');
    });

    it('returns undefined when strict pool is empty and fallback is not configured', () => {
      const recent = { id: 'a', updatedAt: '2026-06-05T00:00:00Z' };
      expect(pickRevisitNote([recent], opts)).toBeUndefined();
    });

    it('prefers the strict tier when a 14d+ candidate exists', () => {
      const veryOld = { id: 'old', updatedAt: '2026-01-01T00:00:00Z', content: 'x'.repeat(120) };
      const weekOld = { id: 'week', updatedAt: '2026-06-05T00:00:00Z', content: 'x'.repeat(120) };
      expect(pickRevisitNote([veryOld, weekOld], fallbackOpts)?.id).toBe('old');
    });

    it('fallback respects excludeIds', () => {
      const a = { id: 'a', updatedAt: '2026-06-05T00:00:00Z', content: 'x'.repeat(120) };
      const b = { id: 'b', updatedAt: '2026-06-01T00:00:00Z', content: 'x'.repeat(120) };
      expect(pickRevisitNote([a, b], { ...fallbackOpts, excludeIds: ['b'] })?.id).toBe('a');
    });

    it('fallback prefers high-meaning note over an equally-aged thin one', () => {
      const notes = [
        { id: 'rich', updatedAt: '2026-06-05T00:00:00Z', content: 'x'.repeat(120) },
        { id: 'thin', updatedAt: '2026-06-05T00:00:00Z', content: 'hi' },
      ];
      expect(
        pickRevisitNote(notes, {
          ...fallbackOpts,
          meaningWeightById: { rich: 0.9, thin: 0.1 },
        })?.id,
      ).toBe('rich');
    });

    it('fallback ranks a 5-day-old note above a 2-hour-old note via forgetting curve', () => {
      const fresh = { id: 'fresh', updatedAt: '2026-06-12T10:00:00Z', content: 'x'.repeat(120) };
      const fading = { id: 'fading', updatedAt: '2026-06-07T12:00:00Z', content: 'x'.repeat(120) };
      expect(
        pickRevisitNote([fresh, fading], {
          ...fallbackOpts,
          meaningWeightById: { fresh: 0.9, fading: 0.9 },
        })?.id,
      ).toBe('fading');
    });

    it('tertiary tier surfaces a note when strict and fallback pools are empty', () => {
      const active = { id: 'active', updatedAt: '2026-06-12T10:00:00Z', content: 'x'.repeat(120) };
      const other = { id: 'other', updatedAt: '2026-06-12T08:00:00Z', content: 'x'.repeat(120) };
      expect(
        pickRevisitNote([active, other], {
          nowMs: NOW,
          minAgeMs: 14 * DAY,
          fallbackMinAgeMs: DAY,
          tertiaryMinAgeMs: 0,
          excludeIds: ['active'],
          meaningWeightById: { other: 0.8 },
        })?.id,
      ).toBe('other');
    });
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

describe('pickRevisitHighlight', () => {
  const recencyIso = (row: { id: string; iso?: string | null }) => row.iso;
  const rows = [
    { id: 'newest', iso: '2026-06-10T00:00:00Z' },
    { id: 'middle', iso: '2026-03-01T00:00:00Z' },
    { id: 'oldest', iso: '2026-01-01T00:00:00Z' },
  ];

  it('returns undefined for an empty list', () => {
    expect(pickRevisitHighlight([], { recencyIso })).toBeUndefined();
  });

  it('surfaces the OLDEST highlight, not the newest', () => {
    expect(pickRevisitHighlight(rows, { recencyIso })?.id).toBe('oldest');
  });

  it('prefers pinned highlights, oldest pinned first', () => {
    expect(pickRevisitHighlight(rows, { recencyIso, pinnedIds: ['newest'] })?.id).toBe('newest');
    expect(pickRevisitHighlight(rows, { recencyIso, pinnedIds: ['middle', 'newest'] })?.id).toBe('middle');
  });

  it('skips cooled-down highlights', () => {
    expect(pickRevisitHighlight(rows, { recencyIso, excludeIds: ['oldest'] })?.id).toBe('middle');
  });

  it('rotates daily and respects the salt', () => {
    expect(pickRevisitHighlight(rows, { recencyIso, rotationDayIndex: 0 })?.id).toBe('oldest');
    expect(pickRevisitHighlight(rows, { recencyIso, rotationDayIndex: 1 })?.id).toBe('middle');
    expect(pickRevisitHighlight(rows, { recencyIso, rotationDayIndex: 0, rotationSalt: 1 })?.id).toBe('middle');
  });
});

describe('stableStringHash', () => {
  it('is deterministic and non-negative', () => {
    expect(stableStringHash('space_abc')).toBe(stableStringHash('space_abc'));
    expect(stableStringHash('space_abc')).toBeGreaterThanOrEqual(0);
  });

  it('differs across distinct ids', () => {
    expect(stableStringHash('space_abc')).not.toBe(stableStringHash('space_xyz'));
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
      tone: 'returning',
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

describe('homeLeadDisplayName', () => {
  const book: HomeTopBook = { bookOrder: 45, title: 'Romans', referenceCount: 5, noteCount: 4 };
  const thread: HomeTopThread = { id: 't1', title: 'Romans & Grace', noteCount: 4 };
  const folder: HomeTopFolder = { name: 'Sermons', noteCount: 6 };
  const tag: HomeTopTag = { id: 'g1', name: 'Grace', noteCount: 4 };

  it('reads the display name for each lead kind', () => {
    expect(homeLeadDisplayName({ kind: 'book', book, tone: 'returning' })).toBe('Romans');
    expect(homeLeadDisplayName({ kind: 'thread', thread, tone: 'returning' })).toBe('Romans & Grace');
    expect(homeLeadDisplayName({ kind: 'folder', folder, tone: 'returning' })).toBe('Sermons');
    expect(homeLeadDisplayName({ kind: 'tag', tag, tone: 'returning' })).toBe('Grace');
    expect(homeLeadDisplayName({ kind: 'none' })).toBeNull();
  });
});

describe('excludeRecallCandidatesMatchingName', () => {
  const arcCandidate = { id: 'arc:romans', kind: 'arc' as const, score: 0.5, title: 'Romans' };
  const crossrefCandidate = {
    id: 'crossref:romans|john',
    kind: 'crossref' as const,
    score: 0.4,
    title: 'Romans 8 and John 3',
  };
  const subjectCandidate = { id: 'subject:grace', kind: 'subject' as const, score: 0.3, title: 'Grace' };

  it('drops a candidate whose title exactly matches the lead name', () => {
    const result = excludeRecallCandidatesMatchingName([arcCandidate, subjectCandidate], 'Romans');
    expect(result).toEqual([subjectCandidate]);
  });

  it('is case-insensitive and trims whitespace', () => {
    const result = excludeRecallCandidatesMatchingName([arcCandidate], '  romans  ');
    expect(result).toEqual([]);
  });

  it('checks each side of a crossref pair independently', () => {
    const result = excludeRecallCandidatesMatchingName([crossrefCandidate], 'Romans 8');
    expect(result).toEqual([]);
  });

  it('keeps everything when there is no lead name', () => {
    const result = excludeRecallCandidatesMatchingName([arcCandidate, subjectCandidate], null);
    expect(result).toEqual([arcCandidate, subjectCandidate]);
  });

  it('keeps candidates that do not match', () => {
    const result = excludeRecallCandidatesMatchingName([subjectCandidate], 'Romans');
    expect(result).toEqual([subjectCandidate]);
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
    // Singular stays "1 note" even when hasMore is true — "1+ notes" read awkwardly.
    expect(formatHomeNoteCount(1, true)).toBe('1 note');
  });
});

describe('countWeeklyActivityDays', () => {
  // Wednesday June 10, 2026, local noon — fixed anchor for day/week math.
  const now = new Date(2026, 5, 10, 12, 0, 0);
  const onDay = (daysAgo: number) => ({
    updatedAt: new Date(2026, 5, 10 - daysAgo, 9, 0, 0),
  });

  it('returns 0 for empty input and dateless notes', () => {
    expect(countWeeklyActivityDays([], now)).toBe(0);
    expect(countWeeklyActivityDays([{ updatedAt: null }], now)).toBe(0);
  });

  it('counts distinct activity days in the current calendar week only', () => {
    expect(countWeeklyActivityDays([onDay(0), onDay(2), onDay(3)], now)).toBe(3);
    expect(countWeeklyActivityDays([onDay(0), onDay(7)], now)).toBe(1);
    expect(countWeeklyActivityDays([onDay(7), onDay(8)], now)).toBe(0);
  });
});

describe('computeLastActivityTime', () => {
  it('returns null for empty input and dateless notes', () => {
    expect(computeLastActivityTime([])).toBeNull();
    expect(computeLastActivityTime([{ updatedAt: null }])).toBeNull();
  });

  it('returns the latest effective timestamp across notes', () => {
    const older = { updatedAt: new Date(2026, 5, 1, 9, 0, 0) };
    const newer = { updatedAt: new Date(2026, 5, 10, 9, 0, 0) };
    expect(computeLastActivityTime([older, newer])).toBe(newer.updatedAt.getTime());
  });

  it('prefers lastVisited over updatedAt when later', () => {
    const note = {
      updatedAt: new Date(2026, 5, 1, 9, 0, 0),
      lastVisited: new Date(2026, 5, 10, 9, 0, 0),
    };
    expect(computeLastActivityTime([note])).toBe(note.lastVisited.getTime());
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
  it('formats weekday and daypart labels with past framing', () => {
    expect(formatHomeActivityRhythmSuffix({ dayOfWeek: 6, hour: 9 })).toBe('often on Saturday mornings');
    expect(formatHomeActivityRhythmSuffix({ dayOfWeek: 2, hour: 19 })).toBe('often on Tuesday evenings');
    expect(formatHomeActivityRhythmSuffix({ dayOfWeek: 0, hour: 0 })).toBe('often on Sunday nights');
    expect(formatHomeActivityRhythmSuffix({ dayOfWeek: 0, hour: 12 })).toBe('often on Sunday afternoons');
  });
});

describe('formatHomeWeeklyActivitySuffix', () => {
  it('returns null below two days and formats plural counts', () => {
    expect(formatHomeWeeklyActivitySuffix(0)).toBeNull();
    expect(formatHomeWeeklyActivitySuffix(1)).toBeNull();
    expect(formatHomeWeeklyActivitySuffix(2)).toBe('twice this week');
    expect(formatHomeWeeklyActivitySuffix(3)).toBe('3 times this week');
  });
});

describe('formatHomeLastActivitySuffix', () => {
  const now = new Date(2026, 5, 10, 12, 0, 0);

  it('skips very recent visits and uses casual day buckets', () => {
    expect(formatHomeLastActivitySuffix(now.getTime(), now)).toBeNull();
    const earlierToday = new Date(2026, 5, 10, 9, 0, 0).getTime();
    expect(formatHomeLastActivitySuffix(earlierToday, now)).toBe('here earlier today');
    const yesterday = new Date(2026, 5, 9, 12, 0, 0).getTime();
    expect(formatHomeLastActivitySuffix(yesterday, now)).toBe('here yesterday');
    const fourDaysAgo = new Date(2026, 5, 6, 12, 0, 0).getTime();
    expect(formatHomeLastActivitySuffix(fourDaysAgo, now)).toBe('here earlier this week');
    const tenDaysAgo = new Date(2026, 5, 0, 12, 0, 0).getTime();
    expect(formatHomeLastActivitySuffix(tenDaysAgo, now)).toBe('here last week');
    const thirtyDaysAgo = new Date(2026, 4, 11, 12, 0, 0).getTime();
    expect(formatHomeLastActivitySuffix(thirtyDaysAgo, now)).toBe('been a while');
    const longGap = new Date(2026, 2, 1, 12, 0, 0).getTime();
    expect(formatHomeLastActivitySuffix(longGap, now)).toBe('been a long while');
  });
});

describe('formatHomeActivityLeadSuffix', () => {
  const now = new Date(2026, 5, 10, 12, 0, 0);
  const onDay = (daysAgo: number) => ({
    updatedAt: new Date(2026, 5, 10 - daysAgo, 9, 0, 0),
  });

  it('prefers rhythm over weekly count and last visit when the library is large enough', () => {
    expect(
      formatHomeActivityLeadSuffix({
        rhythm: { dayOfWeek: 6, hour: 13 },
        weeklyDays: 3,
        lastActivityMs: now.getTime(),
        now,
        totalNoteCount: 6,
      }),
    ).toBe('often on Saturday afternoons');
  });

  it('suppresses rhythm suffix for small libraries', () => {
    expect(
      formatHomeActivityLeadSuffix({
        rhythm: { dayOfWeek: 6, hour: 13 },
        weeklyDays: 3,
        lastActivityMs: now.getTime(),
        now,
        totalNoteCount: 4,
      }),
    ).toBe('3 times this week');
  });

  it('returns rhythm suffix when other signals are absent and the library is large enough', () => {
    expect(
      formatHomeActivityLeadSuffix({
        rhythm: { dayOfWeek: 2, hour: 19 },
        weeklyDays: 0,
        lastActivityMs: null,
        now,
        totalNoteCount: 6,
      }),
    ).toBe('often on Tuesday evenings');
  });

  it('returns weekly count when rhythm is weak and count is at least two', () => {
    expect(
      formatHomeActivityLeadSuffix({
        rhythm: null,
        weeklyDays: 2,
        lastActivityMs: now.getTime(),
        now,
      }),
    ).toBe('twice this week');
  });

  it('returns null when last visit is within a minute', () => {
    expect(
      formatHomeActivityLeadSuffix({
        rhythm: null,
        weeklyDays: 1,
        lastActivityMs: now.getTime(),
        now,
      }),
    ).toBeNull();
  });

  it('returns last visit when rhythm is weak and weekly count is under two', () => {
    const fourDaysAgo = new Date(2026, 5, 6, 12, 0, 0).getTime();
    expect(
      formatHomeActivityLeadSuffix({
        rhythm: null,
        weeklyDays: 1,
        lastActivityMs: fourDaysAgo,
        now,
      }),
    ).toBe('here earlier this week');
  });

  it('uses weekly copy when rhythm is weak and user was active twice this week', () => {
    const notes = [onDay(0), onDay(2)];
    expect(
      formatHomeActivityLeadSuffix({
        rhythm: computeActivityRhythm(notes),
        weeklyDays: countWeeklyActivityDays(notes, now),
        lastActivityMs: computeLastActivityTime(notes),
        now,
      }),
    ).toBe('twice this week');
  });

  it('returns null when no signal qualifies', () => {
    expect(
      formatHomeActivityLeadSuffix({
        rhythm: null,
        weeklyDays: 0,
        lastActivityMs: null,
        now,
      }),
    ).toBeNull();
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
        noteCount: 10,
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
      homeBookGreetingTone({
        noteCount: 1,
        hasMoreNotes: false,
        referenceCount: 3,
        bookNoteCount: 1,
      }),
    ).toBe('single-note');
  });

  it('uses mentioned-once when the book only appears once across notes', () => {
    expect(
      homeBookGreetingTone({
        noteCount: 4,
        hasMoreNotes: false,
        referenceCount: 1,
        bookNoteCount: 1,
      }),
    ).toBe('mentioned-once');
  });

  it('downgrades returning to mentioned-once for early users', () => {
    expect(
      homeBookGreetingTone({
        noteCount: 2,
        hasMoreNotes: false,
        referenceCount: 2,
        bookNoteCount: 2,
      }),
    ).toBe('mentioned-once');
  });

  it('uses returning when the book habit is established', () => {
    expect(
      homeBookGreetingTone({
        noteCount: 10,
        hasMoreNotes: false,
        referenceCount: 2,
        bookNoteCount: 2,
      }),
    ).toBe('returning');
  });

  it('does not treat 1+ notes as single-note', () => {
    expect(
      homeBookGreetingTone({
        noteCount: 1,
        hasMoreNotes: true,
        referenceCount: 1,
        bookNoteCount: 1,
      }),
    ).toBe('mentioned-once');
  });
});

describe('homeFolderGreetingTone', () => {
  it('maps folder note counts to tone tiers', () => {
    expect(homeFolderGreetingTone(1)).toBe('single');
    expect(homeFolderGreetingTone(2)).toBe('growing');
    expect(homeFolderGreetingTone(3)).toBe('returning');
  });
});

describe('homeTagGreetingTone', () => {
  it('maps tag note counts to tone tiers', () => {
    expect(homeTagGreetingTone(1)).toBe('single');
    expect(homeTagGreetingTone(2)).toBe('returning');
  });
});

describe('homeThreadGreetingTone', () => {
  it('maps thread note counts to tone tiers', () => {
    expect(homeThreadGreetingTone(2)).toBe('started');
    expect(homeThreadGreetingTone(3)).toBe('returning');
  });
});

describe('homeLeadCopyLayout', () => {
  it('uses softer copy for early scripture and folder signals', () => {
    expect(
      homeLeadCopyLayout({
        kind: 'book',
        book: { bookOrder: 45, title: 'Romans', referenceCount: 1, noteCount: 1 },
        tone: 'mentioned-once',
      }).afterChip,
    ).toBe(' is in your notes, with ');
    expect(
      homeLeadCopyLayout({
        kind: 'folder',
        folder: { name: 'Sermons', noteCount: 1 },
        tone: 'single',
      }).afterChip,
    ).toBe(' has a note in it, with ');
  });

  it('uses started thread copy for two-note clusters', () => {
    expect(
      homeLeadCopyLayout({
        kind: 'thread',
        thread: { id: 't1', title: 'Romans', noteCount: 2 },
        tone: 'started',
      }).beforeChip,
    ).toBe('You started ');
  });
});

describe('home card eyebrow helpers', () => {
  it('softens continue copy for small libraries', () => {
    expect(homeContinueCardEyebrow(1)).toBe('Your latest note');
    expect(homeContinueCardEyebrow(2)).toBe('Your latest note');
    expect(homeContinueCardEyebrow(3)).toBe('Pick up where you left off');
  });

  it('softens spotlight thread copy for two-note clusters', () => {
    expect(homeSpotlightThreadEyebrow(2)).toBe('A study taking shape');
    expect(homeSpotlightThreadEyebrow(4)).toBe('Pick a study back up');
  });
});

describe('deriveSubjectConnections', () => {
  it('connects notes across different passages that share a curated subject', () => {
    const out = deriveSubjectConnections(
      [
        { subjects: ['New Birth', 'Salvation'], notes: [{ id: 'a', updatedAt: '2026-06-01T00:00:00Z' }] },
        { subjects: ['New Birth', 'Holy Spirit'], notes: [{ id: 'b', updatedAt: '2026-06-03T00:00:00Z' }] },
        { subjects: ['New Birth'], notes: [{ id: 'c', updatedAt: '2026-06-02T00:00:00Z' }] },
      ],
      { limit: 5 },
    );
    const newBirth = out.find((c) => c.subject === 'New Birth');
    expect(newBirth?.noteCount).toBe(3);
    // most-recently-edited note leads
    expect(newBirth?.notes.map((n) => n.id)).toEqual(['b', 'c', 'a']);
  });

  it('excludes subjects touched by only one note', () => {
    const out = deriveSubjectConnections(
      [
        { subjects: ['Salvation'], notes: [{ id: 'a' }] },
        { subjects: ['New Birth'], notes: [{ id: 'a' }, { id: 'b' }] },
      ],
      { limit: 5 },
    );
    expect(out.map((c) => c.subject)).toEqual(['New Birth']);
  });

  it('counts a note once even when it cites two passages with the same subject', () => {
    const out = deriveSubjectConnections(
      [
        { subjects: ['Faith'], notes: [{ id: 'a' }, { id: 'b' }] },
        { subjects: ['Faith'], notes: [{ id: 'a' }] }, // same note, another passage
      ],
      { limit: 5 },
    );
    expect(out[0]?.noteCount).toBe(2);
  });

  it('ranks connections by reach (note count) and respects the limit', () => {
    const out = deriveSubjectConnections(
      [
        { subjects: ['Faith'], notes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] },
        { subjects: ['Grace'], notes: [{ id: 'd' }, { id: 'e' }] },
      ],
      { limit: 1 },
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.subject).toBe('Faith');
  });
});

describe('deriveCrossRefConnections', () => {
  const gen = { passageKey: '1:22:1:1', displayRef: 'Genesis 22:1', bookOrder: 1, notes: [{ id: 'a', updatedAt: '2026-06-01T00:00:00Z' }] };
  const heb = { passageKey: '58:11:17:17', displayRef: 'Hebrews 11:17', bookOrder: 58, notes: [{ id: 'b', updatedAt: '2026-06-03T00:00:00Z' }] };
  const rom = { passageKey: '45:4:3:3', displayRef: 'Romans 4:3', bookOrder: 45, notes: [{ id: 'c', updatedAt: '2026-06-02T00:00:00Z' }] };

  it('connects notes on TSK-linked passages', () => {
    const out = deriveCrossRefConnections(
      [gen, heb],
      [{ fromKey: gen.passageKey, toKey: heb.passageKey, votes: 12 }],
      { limit: 5 },
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.from.displayRef).toBe('Genesis 22:1');
    expect(out[0]?.to.displayRef).toBe('Hebrews 11:17');
    expect(out[0]?.noteCount).toBe(2);
    expect(out[0]?.votes).toBe(12);
    expect(out[0]?.notes.map((n) => n.id)).toEqual(['b', 'a']);
  });

  it('excludes pairs touching fewer than minNotes distinct notes', () => {
    const solo = { ...gen, notes: [{ id: 'a' }] };
    const alsoA = { ...heb, notes: [{ id: 'a' }] };
    const out = deriveCrossRefConnections(
      [solo, alsoA],
      [{ fromKey: solo.passageKey, toKey: alsoA.passageKey, votes: 5 }],
      { limit: 5, minNotes: 2 },
    );
    expect(out).toEqual([]);
  });

  it('aggregates votes across multiple TSK edges for the same pair', () => {
    const out = deriveCrossRefConnections(
      [gen, heb],
      [
        { fromKey: gen.passageKey, toKey: heb.passageKey, votes: 3 },
        { fromKey: heb.passageKey, toKey: gen.passageKey, votes: 7 },
      ],
      { limit: 5 },
    );
    expect(out[0]?.votes).toBe(10);
  });

  it('ranks by combined votes and respects the limit', () => {
    const out = deriveCrossRefConnections(
      [gen, heb, rom],
      [
        { fromKey: gen.passageKey, toKey: heb.passageKey, votes: 20 },
        { fromKey: gen.passageKey, toKey: rom.passageKey, votes: 5 },
      ],
      { limit: 1 },
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.to.displayRef).toBe('Hebrews 11:17');
  });

  it('ignores self-referential and unknown passage keys', () => {
    const out = deriveCrossRefConnections(
      [gen],
      [
        { fromKey: gen.passageKey, toKey: gen.passageKey, votes: 99 },
        { fromKey: gen.passageKey, toKey: 'missing', votes: 99 },
      ],
      { limit: 5 },
    );
    expect(out).toEqual([]);
  });

  it('counts a note once when it cites both passages in the pair', () => {
    const both = { ...gen, notes: [{ id: 'a' }, { id: 'shared' }] };
    const other = { ...heb, notes: [{ id: 'shared' }] };
    const out = deriveCrossRefConnections(
      [both, other],
      [{ fromKey: both.passageKey, toKey: other.passageKey, votes: 4 }],
      { limit: 5, minNotes: 2 },
    );
    expect(out[0]?.noteCount).toBe(2);
  });
});

describe('derivePassageConnections', () => {
  const rom828 = {
    passageKey: '45:8:28:28',
    displayRef: 'Romans 8:28',
    bookOrder: 45,
    chapter: 8,
    verseStart: 28,
    notes: [
      { id: 'a', updatedAt: '2026-06-01T00:00:00Z' },
      { id: 'b', updatedAt: '2026-06-03T00:00:00Z' },
      { id: 'c', updatedAt: '2026-06-02T00:00:00Z' },
    ],
  };
  const john316 = {
    passageKey: '43:3:16:16',
    displayRef: 'John 3:16',
    bookOrder: 43,
    chapter: 3,
    verseStart: 16,
    notes: [
      { id: 'd', updatedAt: '2026-06-04T00:00:00Z' },
      { id: 'e', updatedAt: '2026-06-05T00:00:00Z' },
    ],
  };

  it('surfaces passages cited by multiple distinct notes', () => {
    const out = derivePassageConnections([rom828, john316], { limit: 5 });
    expect(out).toHaveLength(2);
    expect(out[0]?.displayRef).toBe('Romans 8:28');
    expect(out[0]?.noteCount).toBe(3);
    expect(out[0]?.notes.map((n) => n.id)).toEqual(['b', 'c', 'a']);
  });

  it('excludes passages cited by fewer than minNotes distinct notes', () => {
    const solo = { ...john316, notes: [{ id: 'd' }] };
    const out = derivePassageConnections([solo, rom828], { limit: 5, minNotes: 2 });
    expect(out.map((p) => p.displayRef)).toEqual(['Romans 8:28']);
  });

  it('dedupes the same note when it appears twice on one passage', () => {
    const dup = {
      ...rom828,
      notes: [
        { id: 'a', updatedAt: '2026-06-01T00:00:00Z' },
        { id: 'a', updatedAt: '2026-06-04T00:00:00Z' },
        { id: 'b', updatedAt: '2026-06-02T00:00:00Z' },
      ],
    };
    const out = derivePassageConnections([dup], { limit: 5 });
    expect(out[0]?.noteCount).toBe(2);
    expect(out[0]?.notes[0]?.id).toBe('a');
  });

  it('ranks by note count and respects the limit', () => {
    const out = derivePassageConnections([rom828, john316], { limit: 1 });
    expect(out).toHaveLength(1);
    expect(out[0]?.displayRef).toBe('Romans 8:28');
  });

  it('breaks ties by canonical book/chapter/verse order', () => {
    const ps23 = {
      passageKey: '19:23:1:1',
      displayRef: 'Psalm 23:1',
      bookOrder: 19,
      chapter: 23,
      verseStart: 1,
      notes: [{ id: 'x' }, { id: 'y' }],
    };
    const johnSameReach = { ...john316, notes: [{ id: 'p' }, { id: 'q' }] };
    const out = derivePassageConnections([johnSameReach, ps23], { limit: 5 });
    expect(out[0]?.displayRef).toBe('Psalm 23:1');
    expect(out[1]?.displayRef).toBe('John 3:16');
  });
});

describe('forgettingAwarePriority', () => {
  it('is ~0 for a freshly-touched note (high retrievability)', () => {
    expect(forgettingAwarePriority(1, 0, 10)).toBeCloseTo(0, 5);
  });

  it('rises toward meaningWeight as a note fades', () => {
    const faded = forgettingAwarePriority(0.8, 60, 10); // Δt >> stability → R≈0
    expect(faded).toBeGreaterThan(0.7);
    expect(faded).toBeLessThanOrEqual(0.8);
  });

  it('ranks a meaningful faded note above a thin one at the same age', () => {
    const meaningful = forgettingAwarePriority(0.9, 30, 10);
    const thin = forgettingAwarePriority(0.2, 30, 10);
    expect(meaningful).toBeGreaterThan(thin);
  });

  it('longer stability lowers priority (recently re-engaged notes wait longer)', () => {
    const shortStability = forgettingAwarePriority(0.8, 30, 10);
    const longStability = forgettingAwarePriority(0.8, 30, 90);
    expect(shortStability).toBeGreaterThan(longStability);
  });

  it('clamps meaningWeight into [0,1]', () => {
    expect(forgettingAwarePriority(5, 100, 10)).toBeLessThanOrEqual(1);
    expect(forgettingAwarePriority(-5, 100, 10)).toBe(0);
  });
});

describe('pickRevisitNote forgetting-aware mode', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const note = (id: string, ageDays: number, content = 'x'.repeat(120)) => ({
    id,
    content,
    updatedAt: new Date(now - ageDays * DAY),
  });

  it('prefers the high-meaning note over an equally-aged thin one', () => {
    const notes = [note('rich', 30), note('thin', 30)];
    const pick = pickRevisitNote(notes, {
      nowMs: now,
      minAgeMs: 14 * DAY,
      meaningWeightById: { rich: 0.9, thin: 0.1 },
    });
    expect(pick?.id).toBe('rich');
  });

  it('falls back to substance-based meaning when a note has no fingerprint entry', () => {
    const notes = [note('substantive', 30, 'x'.repeat(200)), note('scratch', 30, 'hi')];
    const pick = pickRevisitNote(notes, {
      nowMs: now,
      minAgeMs: 14 * DAY,
      meaningWeightById: {}, // empty → both use fallback; substantive (0.5) beats scratch (0.25)
    });
    expect(pick?.id).toBe('substantive');
  });

  it('still respects the minimum-age gate', () => {
    const notes = [note('fresh', 2)];
    const pick = pickRevisitNote(notes, {
      nowMs: now,
      minAgeMs: 14 * DAY,
      meaningWeightById: { fresh: 1 },
    });
    expect(pick).toBeUndefined();
  });

  it('prefers lastRecallEngagedAt over a more recent edit for fading priority', () => {
    const editedRecently = {
      id: 'a',
      content: 'x'.repeat(120),
      updatedAt: new Date(now - 1 * DAY),
    };
    const recallMs = now - 20 * DAY;
    const pick = pickRevisitNote([editedRecently], {
      nowMs: now,
      minAgeMs: 14 * DAY,
      meaningWeightById: { a: 0.9 },
      lastRecallEngagedAtById: { a: recallMs },
    });
    expect(pick?.id).toBe('a');
  });

  it('nudges toward under-recalled canon sections when meaning is comparable', () => {
    const notes = [
      note('paul', 30),
      note('gospels', 30),
    ];
    const pick = pickRevisitNote(notes, {
      nowMs: now,
      minAgeMs: 14 * DAY,
      meaningWeightById: { paul: 0.7, gospels: 0.7 },
      canonSectionById: { paul: 'paul', gospels: 'gospels' },
      librarySectionCounts: { paul: 8, gospels: 2 },
      recentRecallSectionCounts: { paul: 6, gospels: 0 },
      rotationDayIndex: 0,
    });
    expect(pick?.id).toBe('gospels');
  });
});

describe('recallSectionDiversityBoost', () => {
  it('returns 0 when recall history is empty', () => {
    expect(recallSectionDiversityBoost('gospels', { paul: 5, gospels: 2 }, {})).toBe(0);
  });

  it('boosts under-recalled sections', () => {
    const boost = recallSectionDiversityBoost(
      'gospels',
      { paul: 8, gospels: 2 },
      { paul: 6, gospels: 0 },
    );
    expect(boost).toBeGreaterThan(0);
    expect(boost).toBeLessThanOrEqual(0.1);
  });
});

describe('revisitTouchTimeMs', () => {
  it('prefers lastRecallEngagedAt when set', () => {
    const note = { id: 'a', updatedAt: '2026-06-12T00:00:00Z' };
    const recallMs = Date.parse('2026-01-01T00:00:00Z');
    expect(revisitTouchTimeMs(note, { a: recallMs })).toBe(recallMs);
  });

  it('falls back to last edit when recall time is absent', () => {
    const note = { id: 'a', updatedAt: '2026-06-01T00:00:00Z' };
    expect(revisitTouchTimeMs(note)).toBe(Date.parse('2026-06-01T00:00:00Z'));
  });

  it('counts a substantive visit as engagement, beating an older edit', () => {
    const note = { id: 'a', updatedAt: '2026-06-01T00:00:00Z' };
    const visitMs = Date.parse('2026-06-20T00:00:00Z');
    expect(revisitTouchTimeMs(note, undefined, { a: visitMs })).toBe(visitMs);
  });

  it('takes the later of a recall open and a visit', () => {
    const note = { id: 'a', updatedAt: '2026-01-01T00:00:00Z' };
    const recallMs = Date.parse('2026-05-01T00:00:00Z');
    const visitMs = Date.parse('2026-06-01T00:00:00Z');
    expect(revisitTouchTimeMs(note, { a: recallMs }, { a: visitMs })).toBe(visitMs);
    expect(revisitTouchTimeMs(note, { a: visitMs }, { a: recallMs })).toBe(visitMs);
  });

  // The rule the whole function exists for: `updatedAt` is bumped by writes that are not
  // engagement, so an edit after an engagement must not push the clock forward.
  it('still ignores an edit that came after an engagement', () => {
    const note = { id: 'a', updatedAt: '2026-06-30T00:00:00Z' };
    const visitMs = Date.parse('2026-06-01T00:00:00Z');
    expect(revisitTouchTimeMs(note, undefined, { a: visitMs })).toBe(visitMs);
  });

  it('is unchanged when no visit map is passed at all', () => {
    const note = { id: 'a', updatedAt: '2026-06-01T00:00:00Z' };
    expect(revisitTouchTimeMs(note, {}, {})).toBe(Date.parse('2026-06-01T00:00:00Z'));
  });
});

describe('revisitReturnsBoost', () => {
  it('is zero for a note read once or never', () => {
    expect(revisitReturnsBoost(undefined)).toBe(0);
    expect(revisitReturnsBoost(0)).toBe(0);
    expect(revisitReturnsBoost(1)).toBe(0);
  });

  it('grows with returns and never exceeds the cap', () => {
    const two = revisitReturnsBoost(2);
    const four = revisitReturnsBoost(4);
    expect(two).toBeGreaterThan(0);
    expect(four).toBeGreaterThan(two);
    expect(revisitReturnsBoost(1000)).toBeLessThanOrEqual(REVISIT_RETURNS_MAX_BOOST);
  });

  it('flattens past saturation, so a heavily opened note cannot run away', () => {
    const atSaturation = revisitReturnsBoost(REVISIT_RETURNS_SATURATION + 1);
    expect(revisitReturnsBoost(50)).toBe(atSaturation);
    expect(atSaturation).toBeCloseTo(REVISIT_RETURNS_MAX_BOOST, 10);
  });

  it('rises fastest at the start — the second return says more than the ninth', () => {
    const first = revisitReturnsBoost(2) - revisitReturnsBoost(1);
    const later = revisitReturnsBoost(5) - revisitReturnsBoost(4);
    expect(first).toBeGreaterThan(later);
  });

  it('ignores a nonsense count', () => {
    expect(revisitReturnsBoost(Number.NaN)).toBe(0);
  });
});

describe('deriveStudyArcs', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const NOW = Date.parse('2026-06-30T12:00:00Z');
  const daysAgo = (n: number) => new Date(NOW - n * DAY).toISOString();
  const note = (id: string, ageDays: number, themes: string[], emotionalTone: string | null = null) => ({
    id,
    createdAt: daysAgo(ageDays),
    themes,
    emotionalTone,
  });

  it('returns nothing when no theme recurs enough', () => {
    const notes = [note('a', 10, ['Hope']), note('b', 40, ['Grace'])];
    expect(deriveStudyArcs(notes, { nowMs: NOW })).toEqual([]);
  });

  it('surfaces a theme that recurs across notes and time', () => {
    const notes = [
      note('a', 150, ['Suffering', 'Romans']),
      note('b', 90, ['Suffering']),
      note('c', 20, ['Suffering', 'Hope']),
    ];
    const [arc] = deriveStudyArcs(notes, { nowMs: NOW });
    expect(arc.theme).toBe('Suffering');
    expect(arc.noteCount).toBe(3);
    expect(arc.noteIds).toEqual(['a', 'b', 'c']); // ordered earliest → latest
    expect(arc.spanDays).toBeGreaterThan(21);
  });

  it('ignores a theme confined to a single sitting (span below threshold)', () => {
    const notes = [
      note('a', 30, ['Obedience']),
      note('b', 29, ['Obedience']),
      note('c', 28, ['Obedience']),
    ];
    expect(deriveStudyArcs(notes, { nowMs: NOW })).toEqual([]);
  });

  it('excludes universal denylist themes', () => {
    const notes = [note('a', 150, ['Jesus']), note('b', 80, ['Jesus']), note('c', 10, ['Jesus'])];
    expect(deriveStudyArcs(notes, { nowMs: NOW })).toEqual([]);
  });

  it('reports the dominant emotional tone across the arc', () => {
    const notes = [
      note('a', 150, ['Suffering'], 'lament'),
      note('b', 90, ['Suffering'], 'lament'),
      note('c', 20, ['Suffering'], 'hope'),
    ];
    const [arc] = deriveStudyArcs(notes, { nowMs: NOW });
    expect(arc.dominantTone).toBe('lament');
  });

  it('respects the recency window', () => {
    const notes = [
      note('old', 400, ['Mercy']),
      note('a', 150, ['Mercy']),
      note('b', 80, ['Mercy']),
      note('c', 20, ['Mercy']),
    ];
    const [arc] = deriveStudyArcs(notes, { nowMs: NOW });
    expect(arc.noteCount).toBe(3); // the 400-day-old note is outside the 180-day window
    expect(arc.noteIds).toEqual(['a', 'b', 'c']);
  });
});

describe('deriveSectionArcs', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const NOW = Date.parse('2026-06-30T12:00:00Z');
  const daysAgo = (n: number) => new Date(NOW - n * DAY).toISOString();
  const note = (
    id: string,
    ageDays: number,
    canonSection: string | null,
    canonSectionLabel?: string | null,
  ) => ({
    id,
    createdAt: daysAgo(ageDays),
    canonSection,
    canonSectionLabel: canonSectionLabel ?? null,
    testament: canonSection === 'gospels' ? ('nt' as const) : null,
  });

  it('returns nothing when a section does not recur enough', () => {
    const notes = [note('a', 10, 'gospels'), note('b', 40, 'paul')];
    expect(deriveSectionArcs(notes, { nowMs: NOW })).toEqual([]);
  });

  it('surfaces a canon section that recurs across notes and time', () => {
    const notes = [
      note('a', 150, 'gospels', 'Gospels'),
      note('b', 90, 'gospels', 'Gospels'),
      note('c', 20, 'gospels', 'Gospels'),
    ];
    const [arc] = deriveSectionArcs(notes, { nowMs: NOW });
    expect(arc.sectionId).toBe('gospels');
    expect(arc.sectionLabel).toBe('Gospels');
    expect(arc.noteCount).toBe(3);
    expect(arc.noteIds).toEqual(['a', 'b', 'c']);
    expect(arc.spanDays).toBeGreaterThan(21);
  });

  it('skips notes without a canon section', () => {
    const notes = [note('a', 150, null), note('b', 90, 'paul', "Paul's letters"), note('c', 20, 'paul', "Paul's letters")];
    expect(deriveSectionArcs(notes, { nowMs: NOW })).toEqual([]);
  });
});

describe('sectionArcCopy', () => {
  const NOW = Date.parse('2026-06-30T12:00:00Z');

  it('formats section arc copy', () => {
    const copy = sectionArcCopy(
      {
        sectionId: 'gospels',
        sectionLabel: 'Gospels',
        testament: 'nt',
        noteCount: 5,
        firstMs: Date.parse('2026-01-15T00:00:00Z'),
        lastMs: Date.parse('2026-06-01T00:00:00Z'),
        spanDays: 137,
        noteIds: ['a', 'b', 'c', 'd', 'e'],
      },
      NOW,
    );
    expect(copy).toBe('Across 5 notes in Gospels since January');
  });
});

describe('study arc formatters', () => {
  const NOW = Date.parse('2026-06-30T12:00:00Z');
  it('labels the start month within the same year', () => {
    expect(studyArcSinceLabel(Date.parse('2026-01-15T00:00:00Z'), NOW)).toBe('January');
  });
  it('includes the year for an earlier-year start', () => {
    expect(studyArcSinceLabel(Date.parse('2025-11-15T00:00:00Z'), NOW)).toBe('November 2025');
  });
  it('maps tone to a human through-line phrase', () => {
    expect(studyArcToneLabel('lament')).toBe('often in lament');
    expect(studyArcToneLabel(null)).toBeNull();
    expect(studyArcToneLabel('unknown')).toBeNull();
  });
});

describe('selectRecallOpportunities', () => {
  type C = { id: string; kind: any; score: number };
  const c = (id: string, kind: string, score: number): C => ({ id, kind, score });

  it('returns empty for no candidates', () => {
    expect(selectRecallOpportunities([])).toEqual([]);
  });

  it('drops snoozed ids', () => {
    const out = selectRecallOpportunities([c('a', 'highlight', 0.9), c('b', 'arc', 0.8)], {
      snoozedIds: ['a'],
    });
    expect(out.map((o) => o.id)).toEqual(['b']);
  });

  it('orders by usefulness tier before score', () => {
    /*
     * The pair is unchanged and the expectation is reversed, which is the point: this is the
     * written record of `RECALL_KIND_TIER`, and the Aug 2026 re-tier moved `crossrefGap`
     * above `annotateHighlight` on sixty days of measured open rates (17.9% against 10.8%,
     * with the positional confound flattering the one that lost). A higher score still does
     * not beat a better tier — only which kinds hold which tier changed.
     */
    const cands = [
      c('gap', 'crossrefGap', 0.95),
      c('anno', 'annotateHighlight', 0.5),
    ];
    expect(selectRecallOpportunities(cands).map((o) => o.id)).toEqual(['gap', 'anno']);
  });

  it('soft-varies the tail when mixed tiers exist', () => {
    const cands = [
      c('n1', 'revisitNote', 0.9),
      c('n2', 'revisitNote', 0.85),
      c('h1', 'highlight', 0.8),
      c('gap', 'crossrefGap', 0.7),
    ];
    /* `gap` now leads on tier despite carrying the lowest score — it moved from tier 1 to
       tier 0 in the Aug 2026 re-tier, and the three others moved down to 1 together. The tail
       below it is unchanged. */
    expect(selectRecallOpportunities(cands).map((o) => o.id)).toEqual(['gap', 'n1', 'n2', 'h1']);
  });

  it('caps at the limit', () => {
    const cands = [c('a', 'arc', 0.9), c('p', 'passage', 0.8), c('x', 'crossref', 0.7)];
    expect(selectRecallOpportunities(cands, { limit: 2 })).toHaveLength(2);
  });

  it('rotates the tail daily but pins the lead and stays stable within a day', () => {
    const cands = [c('a', 'arc', 0.9), c('p', 'passage', 0.8), c('x', 'crossref', 0.7)];
    const day0 = selectRecallOpportunities(cands, { dayIndex: 0 }).map((o) => o.id);
    const day0again = selectRecallOpportunities(cands, { dayIndex: 0 }).map((o) => o.id);
    const day1 = selectRecallOpportunities(cands, { dayIndex: 1 }).map((o) => o.id);
    expect(day0).toEqual(day0again);
    expect(day0[0]).toBe('a');
    expect(day1[0]).toBe('a');
    expect(day1).not.toEqual(day0);
  });

  it('surfaces a newly-qualifying candidate as soon as it is included', () => {
    const before = selectRecallOpportunities([c('a', 'arc', 0.9)]).map((o) => o.id);
    const after = selectRecallOpportunities([c('a', 'arc', 0.9), c('new', 'passage', 0.95)]).map((o) => o.id);
    expect(before).toEqual(['a']);
    expect(after[0]).toBe('new');
  });

  /**
   * Home assembles candidates from a dozen independent push sites and several can reach the
   * same underlying row. The one that actually shipped: the spotlight highlight was pushed
   * inline without registering in `usedHighlightIds`, so whenever it also matched the
   * continue-book chapter lookup it came through twice with a byte-identical id — a card the
   * reader saw twice, and a React duplicate-key error. Both are guarded here, at the one point
   * every push site funnels through.
   */
  it('never returns the same id twice', () => {
    const dupe = [
      c('h1', 'highlight', 0.55),
      c('a', 'arc', 0.9),
      c('h1', 'highlight', 0.55),
    ];
    const ids = selectRecallOpportunities(dupe).map((o) => o.id);
    expect(ids).toEqual([...new Set(ids)]);
    expect(ids.filter((id) => id === 'h1')).toHaveLength(1);
  });

  it('keeps the first occurrence when a duplicate id appears', () => {
    const first = { ...c('h1', 'highlight', 0.55), eyebrow: 'first' } as any;
    const second = { ...c('h1', 'highlight', 0.55), eyebrow: 'second' } as any;
    const out = selectRecallOpportunities([first, second]);
    expect(out).toHaveLength(1);
    expect(out[0]!.eyebrow).toBe('first');
  });

  it('dedupes before the limit, so a duplicate cannot displace a real card', () => {
    const cands = [
      c('a', 'arc', 0.9),
      c('a', 'arc', 0.9),
      c('p', 'passage', 0.8),
    ];
    expect(selectRecallOpportunities(cands, { limit: 2 }).map((o) => o.id)).toEqual(['a', 'p']);
  });
});

describe('pickRecallTrend + recallTrendLine', () => {
  type C = { id: string; kind: any; score: number };
  it('picks the strongest trend kind, ignoring non-trend kinds', () => {
    const cands: C[] = [
      { id: 'n', kind: 'revisitNote', score: 0.99 },
      { id: 'arc:grace', kind: 'arc', score: 0.6 },
      { id: 'passage:John 3', kind: 'passage', score: 0.8 },
    ];
    expect(pickRecallTrend(cands)?.id).toBe('passage:John 3');
  });

  it('includes referenceWord as a trend kind', () => {
    const cands: C[] = [
      { id: 'ref:grace', kind: 'referenceWord', score: 0.9 },
      { id: 'passage:John 3', kind: 'passage', score: 0.5 },
    ];
    expect(pickRecallTrend(cands)?.id).toBe('ref:grace');
  });

  it('returns undefined when there are no trend candidates', () => {
    expect(pickRecallTrend([{ id: 'n', kind: 'revisitNote' as any, score: 1 }])).toBeUndefined();
  });

  it('formats an arc trend line with theme, span, and tone', () => {
    expect(
      recallTrendLine({ kind: 'arc', theme: 'Grace', noteCount: 9, since: 'January', toneLabel: 'often in lament' }),
    ).toBe('Lately you keep returning to Grace — across 9 notes since January, often in lament.');
  });

  it('formats passage and crossref trend lines', () => {
    expect(recallTrendLine({ kind: 'passage', passageRef: 'Romans 8:28' })).toBe(
      'You keep returning to Romans 8:28.',
    );
    expect(recallTrendLine({ kind: 'crossref', fromRef: 'Romans 3:21', toRef: 'Leviticus 14:4' })).toBe(
      'Romans 3:21 and Leviticus 14:4 keep surfacing together in your notes.',
    );
    expect(recallTrendLine({ kind: 'referenceWord', referenceWord: 'Grace' })).toBe(
      'You keep looking up Grace across your notes.',
    );
  });
});

describe('recallTrendGreetingParts', () => {
  it('returns compact inline fragments without note counts', () => {
    expect(recallTrendGreetingParts({ kind: 'arc', theme: 'John' })).toEqual({
      prefix: ', lately returning to ',
      labels: ['John'],
      suffix: '',
    });
    expect(recallTrendGreetingParts({ kind: 'subject', subject: 'Grace' })).toEqual({
      prefix: ', ',
      labels: ['Grace'],
      suffix: ' keeps taking shape',
    });
    expect(recallTrendGreetingParts({ kind: 'passage', passageRef: 'Romans 8:28' })).toEqual({
      prefix: ', often back at ',
      labels: ['Romans 8:28'],
      suffix: '',
    });
    expect(
      recallTrendGreetingParts({ kind: 'crossref', fromRef: 'Romans 3:21', toRef: 'Leviticus 14:4' }),
    ).toEqual({
      prefix: ', lately ',
      labels: ['Romans 3:21', 'Leviticus 14:4'],
      suffix: ' keep surfacing together',
    });
    expect(recallTrendGreetingParts({ kind: 'referenceWord', referenceWord: 'Grace' })).toEqual({
      prefix: ', often looking up ',
      labels: ['Grace'],
      suffix: '',
    });
  });

  it('returns null when required labels are missing', () => {
    expect(recallTrendGreetingParts({ kind: 'arc', theme: '' })).toBeNull();
    expect(recallTrendGreetingParts({ kind: 'crossref', fromRef: 'A', toRef: '' })).toBeNull();
  });
});

describe('connectSuggestionRecallMeta', () => {
  it('maps API connect reasons to factual recall carousel meta', () => {
    expect(connectSuggestionRecallMeta('Shared passage')).toBe('Both cite the same passage');
    expect(connectSuggestionRecallMeta('Cross-reference')).toBe('You cross-referenced these');
    expect(connectSuggestionRecallMeta('Shared theme')).toBe('Same theme in both');
  });

  it('falls back for unknown reasons', () => {
    expect(connectSuggestionRecallMeta('Something else')).toBe('These notes fit together');
  });

  it('names the shared subject when the server identified one', () => {
    // "Both cite the same passage" is a riddle; "Both cite Romans 8" is a reason to tap.
    expect(connectSuggestionRecallMeta('Shared passage', 'Romans 8')).toBe('Both cite Romans 8');
    expect(connectSuggestionRecallMeta('Cross-reference', 'Psalm 73')).toBe(
      'Cross-referenced through Psalm 73',
    );
    expect(connectSuggestionRecallMeta('Shared theme', 'Perseverance')).toBe(
      'Both on Perseverance',
    );
  });

  it('ignores a blank subject rather than printing a dangling phrase', () => {
    expect(connectSuggestionRecallMeta('Shared passage', '   ')).toBe('Both cite the same passage');
  });
});

describe('connect suggestion recall copy helpers', () => {
  it('uses a thread-oriented eyebrow', () => {
    expect(connectSuggestionRecallEyebrow()).toBe('Thread these notes');
  });

  it('formats titles with and instead of ampersand', () => {
    expect(formatConnectSuggestionTitle('Table of Evangelism', 'What Now?')).toBe(
      'Table of Evangelism and What Now?',
    );
  });

  it('truncates very long connect suggestion titles', () => {
    const longA = 'A'.repeat(50);
    const longB = 'B'.repeat(50);
    const out = formatConnectSuggestionTitle(longA, longB);
    expect(out.length).toBeLessThanOrEqual(72);
    expect(out.endsWith('…')).toBe(true);
  });

  it('suggests a thread name from note titles', () => {
    expect(suggestConnectThreadName('Evangelism', 'What Now?', 'Cross-reference')).toBe(
      'Evangelism and What Now?',
    );
  });

  it('falls back to reason-based thread names when titles are too long', () => {
    expect(suggestConnectThreadName('A'.repeat(50), 'B'.repeat(50), 'Shared passage')).toBe('Shared passage');
  });

  it('names the thread after what the notes share, not what they are called', () => {
    // A thread over two notes both working through Romans 8 should arrive called
    // "Romans 8" — a name someone would keep — rather than a description of the pair.
    expect(
      suggestConnectThreadName('My journey', 'Adoption', 'Shared passage', 'Romans 8'),
    ).toBe('Romans 8');
  });

  it('prefers the shared subject even when the joined titles would have fitted', () => {
    expect(suggestConnectThreadName('A', 'B', 'Shared theme', 'Perseverance')).toBe('Perseverance');
  });

  it('titles a lowercase topic label, since this becomes a name and not a sentence', () => {
    // Topic labels are stored lowercase, which suits the meta line ("Both on assurance")
    // and not the thread it is naming.
    expect(suggestConnectThreadName('A', 'B', 'Shared theme', 'assurance')).toBe('Assurance');
    // A passage subject is already capitalised and must come through untouched.
    expect(suggestConnectThreadName('A', 'B', 'Shared passage', 'Genesis 1')).toBe('Genesis 1');
  });

  it('still joins the titles when the server could not name the overlap', () => {
    expect(suggestConnectThreadName('Evangelism', 'What Now?', 'Cross-reference', undefined)).toBe(
      'Evangelism and What Now?',
    );
  });
});

describe('continueBookRecallMeta', () => {
  it('names the next chapter plainly', () => {
    expect(continueBookRecallMeta('Romans', 8)).toBe('Pick up at Romans 8');
  });
});

describe('recurringPersonRecallMeta', () => {
  it('uses singular note count', () => {
    expect(recurringPersonRecallMeta(1)).toBe('Showed up in 1 note');
  });

  it('uses plural note count', () => {
    expect(recurringPersonRecallMeta(3)).toBe('Showed up in 3 notes');
  });
});

describe('crossRefGapRecallMeta', () => {
  it('shortens cross-ref gap meta', () => {
    expect(crossRefGapRecallMeta('Lamentations 3:22', 'Psalms 86:15')).toBe(
      'From Lamentations 3:22 · explore Psalms 86:15',
    );
  });
});

describe('deriveContinueBook', () => {
  const counts = new Map<string, number>([['Romans', 16], ['Jude', 1], ['Matthew', 28]]);

  it('suggests the next chapter after a contiguous run', () => {
    const out = deriveContinueBook([{ book: 'Romans', bookOrder: 45, citedChapters: [1, 2, 3, 4, 5, 6, 7] }], counts);
    expect(out[0]).toMatchObject({ book: 'Romans', nextChapter: 8, citedCount: 7 });
  });

  it('fills the first gap when the user skipped a chapter', () => {
    const out = deriveContinueBook([{ book: 'Romans', bookOrder: 45, citedChapters: [1, 3, 5] }], counts);
    expect(out[0].nextChapter).toBe(2);
  });

  it('skips a fully-cited book and an unknown book', () => {
    const out = deriveContinueBook(
      [
        { book: 'Jude', bookOrder: 65, citedChapters: [1] },
        { book: 'Nonsense', bookOrder: 99, citedChapters: [1] },
      ],
      counts,
    );
    expect(out).toEqual([]);
  });

  it('ranks the most-studied book first', () => {
    const out = deriveContinueBook(
      [
        { book: 'Matthew', bookOrder: 40, citedChapters: [1, 2] },
        { book: 'Romans', bookOrder: 45, citedChapters: [1, 2, 3, 4] },
      ],
      counts,
    );
    expect(out.map((s) => s.book)).toEqual(['Romans', 'Matthew']);
  });
});

describe('deriveRecurringPerson', () => {
  it('suggests a person in enough notes with no note about them', () => {
    const out = deriveRecurringPerson([
      { noteId: 'a', title: 'Exodus thoughts', people: ['Moses', 'Aaron'] },
      { noteId: 'b', title: 'The plagues', people: ['Moses', 'Pharaoh'] },
      { noteId: 'c', title: 'Red Sea', people: ['Moses'] },
    ]);
    expect(out[0]).toMatchObject({ name: 'Moses', noteCount: 3 });
  });

  it('excludes a person who already has a note titled after them', () => {
    const out = deriveRecurringPerson([
      { noteId: 'a', title: 'Moses the deliverer', people: ['Moses'] },
      { noteId: 'b', title: 'x', people: ['Moses'] },
      { noteId: 'c', title: 'y', people: ['Moses'] },
    ]);
    expect(out).toEqual([]);
  });

  it('excludes universal names and below-threshold people', () => {
    const out = deriveRecurringPerson([
      { noteId: 'a', title: '', people: ['Jesus', 'Lydia'] },
      { noteId: 'b', title: '', people: ['Jesus'] },
      { noteId: 'c', title: '', people: ['Jesus'] },
    ]);
    expect(out).toEqual([]); // Jesus denylisted, Lydia only in 1 note
  });
});

describe('pickBareHighlight', () => {
  it('picks the oldest unannotated highlight', () => {
    const out = pickBareHighlight([
      { id: 'annotated', entryKind: 'miniNote', miniNoteBody: 'a thought', recencyMs: 1 },
      { id: 'bare-new', entryKind: 'miniNote', miniNoteBody: '', notesBody: '', recencyMs: 100 },
      { id: 'bare-old', entryKind: 'scriptureLink', miniNoteBody: null, notesBody: '  ', recencyMs: 50 },
    ]);
    expect(out?.id).toBe('bare-old');
  });

  it('returns undefined when every highlight is annotated', () => {
    expect(pickBareHighlight([{ id: 'x', entryKind: 'miniNote', notesBody: 'reflection' }])).toBeUndefined();
  });

  it('skips reference, linkedNote, and workspace rows', () => {
    const out = pickBareHighlight([
      { id: 'ref', entryKind: 'reference', recencyMs: 1 },
      { id: 'linked', entryKind: 'linkedNote', recencyMs: 2 },
      { id: 'workspace', entryKind: 'workspace', recencyMs: 3 },
      { id: 'mini', entryKind: 'miniNote', recencyMs: 10 },
    ]);
    expect(out?.id).toBe('mini');
  });
});

describe('isAnnotatableHighlight', () => {
  it('allows miniNote and scriptureLink only', () => {
    expect(isAnnotatableHighlight({ id: 'a', entryKind: 'miniNote' })).toBe(true);
    expect(isAnnotatableHighlight({ id: 'b', entryKind: 'scriptureLink' })).toBe(true);
    expect(isAnnotatableHighlight({ id: 'c', entryKind: 'reference' })).toBe(false);
    expect(isAnnotatableHighlight({ id: 'd', entryKind: 'linkedNote' })).toBe(false);
    expect(isAnnotatableHighlight({ id: 'e', entryKind: 'workspace' })).toBe(false);
  });
});

describe('deriveReferenceWordConnections', () => {
  it('groups the same word across distinct notes', () => {
    const out = deriveReferenceWordConnections(
      [
        { id: 'r1', entryKind: 'reference', sourceSnippet: 'Grace', parentNoteId: 'n1', recencyMs: 100 },
        { id: 'r2', entryKind: 'reference', sourceSnippet: 'grace', parentNoteId: 'n2', recencyMs: 200 },
        { id: 'r3', entryKind: 'reference', sourceSnippet: 'Faith', parentNoteId: 'n3', recencyMs: 50 },
      ],
      { limit: 3, minNotes: 2 },
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.displayWord).toBe('grace');
    expect(out[0]?.noteCount).toBe(2);
    expect(out[0]?.latestRowId).toBe('r2');
  });

  it('returns nothing when a word appears in only one note', () => {
    const out = deriveReferenceWordConnections(
      [{ id: 'r1', entryKind: 'reference', sourceSnippet: 'Aaron', parentNoteId: 'n1', recencyMs: 100 }],
      { limit: 1, minNotes: 2 },
    );
    expect(out).toEqual([]);
  });

  it('dedupes duplicate saves in the same note', () => {
    const out = deriveReferenceWordConnections(
      [
        { id: 'r1', entryKind: 'reference', sourceSnippet: 'Mercy', parentNoteId: 'n1', recencyMs: 100 },
        { id: 'r2', entryKind: 'reference', sourceSnippet: 'Mercy', parentNoteId: 'n1', recencyMs: 200 },
        { id: 'r3', entryKind: 'reference', sourceSnippet: 'Mercy', parentNoteId: 'n2', recencyMs: 150 },
      ],
      { limit: 1, minNotes: 2 },
    );
    expect(out[0]?.noteCount).toBe(2);
  });

  it('normalizes referenceWordKey case-insensitively', () => {
    expect(referenceWordKey({ sourceSnippet: '  Grace  ' })).toBe('grace');
  });
});

describe('highlight ref matching for recall', () => {
  it('scriptureRefsMatch normalizes case and spacing', () => {
    expect(scriptureRefsMatch('romans 8:28', 'Romans 8:28')).toBe(true);
    expect(scriptureRefsMatch('Romans 8:28', 'John 3:16')).toBe(false);
  });

  it('findUnannotatedHighlightForRef picks oldest matching unannotated row', () => {
    const out = findUnannotatedHighlightForRef(
      [
        { id: 'annotated', entryKind: 'miniNote', scriptureReference: 'Romans 8:28', miniNoteBody: 'done', recencyMs: 1 },
        { id: 'newer', entryKind: 'miniNote', scriptureReference: 'Romans 8:28', recencyMs: 200 },
        { id: 'older', entryKind: 'miniNote', scriptureReference: 'Romans 8:28', recencyMs: 50 },
        { id: 'other', entryKind: 'miniNote', scriptureReference: 'John 3:16', recencyMs: 10 },
        { id: 'ref', entryKind: 'reference', scriptureReference: 'Romans 8:28', recencyMs: 5 },
      ],
      'Romans 8:28',
    );
    expect(out?.id).toBe('older');
  });

  it('findUnannotatedHighlightForChapter matches book and chapter', () => {
    const out = findUnannotatedHighlightForChapter(
      [
        { id: 'v1', entryKind: 'scriptureLink', scriptureReference: 'Romans 9:14', recencyMs: 100 },
        { id: 'v2', entryKind: 'scriptureLink', scriptureReference: 'Romans 8:1', recencyMs: 50 },
      ],
      'Romans',
      9,
    );
    expect(out?.id).toBe('v1');
  });

  it('highlightMatchesChapter rejects wrong chapter', () => {
    expect(
      highlightMatchesChapter({ id: 'x', scriptureReference: 'Romans 8:28' }, 'Romans', 9),
    ).toBe(false);
  });

  it('findHighlightForRef includes annotated highlights', () => {
    const out = findHighlightForRef(
      [
        { id: 'annotated', scriptureReference: 'Romans 8:28', miniNoteBody: 'done', recencyMs: 1 },
        { id: 'older', scriptureReference: 'Romans 8:28', recencyMs: 50 },
      ],
      'Romans 8:28',
    );
    expect(out?.id).toBe('annotated');
  });

  it('findHighlightForChapter includes annotated highlights', () => {
    const out = findHighlightForChapter(
      [{ id: 'v1', scriptureReference: 'Romans 9:14', miniNoteBody: 'note', recencyMs: 100 }],
      'Romans',
      9,
    );
    expect(out?.id).toBe('v1');
  });
});

describe('deriveReflectionPrompt', () => {
  it('prefers the liturgical season when present', () => {
    expect(deriveReflectionPrompt({ seasonLabel: 'Advent', arcTheme: 'Suffering' })).toEqual({
      source: 'season',
      title: 'Advent reflection',
      label: 'Advent',
    });
  });

  it('falls back to a prayer on the current theme', () => {
    expect(deriveReflectionPrompt({ arcTheme: 'Suffering' })).toEqual({
      source: 'theme',
      title: 'Prayer on Suffering',
      label: 'Suffering',
    });
  });

  it('returns undefined with no season or theme', () => {
    expect(deriveReflectionPrompt({})).toBeUndefined();
  });
});

describe('deriveStudyArcsFromNodes', () => {
  const NOW = new Date('2026-09-01T12:00:00Z').getTime();
  const daysAgo = (days: number) => new Date(NOW - days * 86400000).toISOString();

  const themeNode = (label: string, overrides: Partial<Parameters<typeof deriveStudyArcsFromNodes>[0][number]> = {}) => ({
    label,
    exposureCount: 5,
    expansionCount: 2,
    firstStudiedAt: daysAgo(60),
    lastSeenAt: daysAgo(2),
    ...overrides,
  });

  it('answers for a reader whose notes are paginated, which the note-side derive cannot', () => {
    const arcs = deriveStudyArcsFromNodes([themeNode('Adoption')], { nowMs: NOW, limit: 1 });
    expect(arcs[0]?.theme).toBe('Adoption');
  });

  it('never claims a note count, because it counts touches and not notes', () => {
    // One note citing five verses that share a theme gives that theme five exposures.
    // "Across 5 notes" would be false, so the node path reports no count at all.
    const arcs = deriveStudyArcsFromNodes([themeNode('Adoption')], { nowMs: NOW });
    expect(arcs[0]?.noteCount).toBe(0);
  });

  it('holds the same thresholds as the note-side derive', () => {
    // Two touches in total is below minNotes, however they were earned.
    expect(deriveStudyArcsFromNodes([themeNode('Adoption', { exposureCount: 0, expansionCount: 2 })], { nowMs: NOW })).toEqual([]);
    expect(
      deriveStudyArcsFromNodes([themeNode('Adoption', { firstStudiedAt: daysAgo(4) })], { nowMs: NOW }),
    ).toEqual([]);
  });

  it('refuses a theme that was only ever met while reading', () => {
    // The topic layer tags broadly; exposure alone put "water" and "life" forward as arcs.
    const met = themeNode('Water', { exposureCount: 9, expansionCount: 0 });
    expect(deriveStudyArcsFromNodes([met], { nowMs: NOW })).toEqual([]);
  });

  it('restores the apostrophe the curated topic data drops', () => {
    // All 6,738 ScriptureTopics rows are lowercase and apostrophe-free; 37 are possessives.
    expect(deriveStudyArcsFromNodes([themeNode('gods love')], { nowMs: NOW })[0]?.theme).toBe(
      "God's love",
    );
    expect(deriveStudyArcsFromNodes([themeNode('the meaning of life')], { nowMs: NOW })[0]?.theme).toBe(
      'The meaning of life',
    );
  });

  it('ranks by what the reader wrote, never by how broadly the topic layer tags', () => {
    const written = themeNode('Covenant', { exposureCount: 1, expansionCount: 5 });
    const cited = themeNode('Kingdom', { exposureCount: 80, expansionCount: 2 });
    const arcs = deriveStudyArcsFromNodes([cited, written], { nowMs: NOW, limit: 2 });
    expect(arcs[0]?.theme).toBe('Covenant');
  });

  it('drops the universal entities the note-side derive drops', () => {
    const denied = [...UNIVERSAL_BIBLE_ENTITIES][0];
    expect(deriveStudyArcsFromNodes([themeNode(denied)], { nowMs: NOW })).toEqual([]);
  });

  it('ignores a theme not touched inside the window', () => {
    const stale = themeNode('Adoption', { firstStudiedAt: daysAgo(900), lastSeenAt: daysAgo(700) });
    expect(deriveStudyArcsFromNodes([stale], { nowMs: NOW })).toEqual([]);
  });
});
