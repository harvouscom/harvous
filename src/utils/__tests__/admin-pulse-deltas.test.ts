import { describe, expect, it } from 'vitest';
import {
  attachRankDeltasToListedItems,
  buildPulseRightNowCopy,
  computeCoolingDeltas,
  computeRisingDeltas,
  formatRankDeltaBadge,
  pulseRightNowSegmentsToText,
  shouldShowRankDeltaPct,
  type PulseRightNowCopyInput,
} from '../admin-pulse-deltas';

const baseRightNowInput: PulseRightNowCopyInput = {
  days: 7,
  risingBooks: [],
  topPassage: null,
  topThemes: [],
  topTranslation: null,
  topCanonSection: null,
  topTone: null,
  topFolder: null,
  topDictionaryWord: null,
  threads: null,
};

describe('computeRisingDeltas', () => {
  it('ranks positive deltas descending', () => {
    const current = [
      { name: 'Psalms', count: 50 },
      { name: 'Romans', count: 30 },
      { name: 'John', count: 10 },
    ];
    const previous = [
      { name: 'Psalms', count: 40 },
      { name: 'Romans', count: 20 },
      { name: 'John', count: 15 },
    ];
    const rising = computeRisingDeltas(current, previous);
    expect(rising[0]?.name).toBe('Psalms');
    expect(rising[0]?.delta).toBe(10);
    expect(rising[0]?.deltaPct).toBe(25);
    expect(rising.some((r) => r.name === 'John')).toBe(false);
  });
});

describe('computeCoolingDeltas', () => {
  it('ranks negative deltas most negative first', () => {
    const current = [{ name: 'Genesis', count: 5 }];
    const previous = [
      { name: 'Genesis', count: 20 },
      { name: 'Exodus', count: 8 },
    ];
    const cooling = computeCoolingDeltas(current, previous);
    expect(cooling[0]?.name).toBe('Genesis');
    expect(cooling[0]?.delta).toBe(-15);
    expect(cooling[1]?.name).toBe('Exodus');
  });
});

describe('formatRankDeltaBadge', () => {
  it('hides % when prior baseline is too small', () => {
    expect(formatRankDeltaBadge({ delta: 17, previous: 1, deltaPct: 1700 })).toBe('+17');
    expect(formatRankDeltaBadge({ delta: 35, previous: 0, deltaPct: null })).toBe('+35');
  });

  it('shows % for stable baselines', () => {
    expect(formatRankDeltaBadge({ delta: 10, previous: 40, deltaPct: 25 })).toBe('+10 (25%)');
    expect(shouldShowRankDeltaPct(40, 25)).toBe(true);
    expect(shouldShowRankDeltaPct(1, 1700)).toBe(false);
  });
});

describe('buildPulseRightNowCopy', () => {
  it('builds comma-linked flowing copy with inline chips', () => {
    const segments = buildPulseRightNowCopy({
      ...baseRightNowInput,
      risingBooks: [{ name: 'Psalms', current: 50, previous: 30, delta: 20, deltaPct: 67 }],
      topPassage: { name: 'Romans 8:28', count: 12 },
      topThemes: [
        { name: 'grace', count: 6 },
        { name: 'hope', count: 5 },
        { name: 'rest', count: 3 },
      ],
    });
    const text = pulseRightNowSegmentsToText(segments);
    expect(segments.some((s) => s.type === 'chip' && s.label === 'Psalms')).toBe(true);
    expect(segments.some((s) => s.type === 'chip' && s.label === 'Romans 8:28')).toBe(true);
    expect(segments.some((s) => s.type === 'chip' && s.label === 'hope')).toBe(true);
    expect(segments.some((s) => s.type === 'chip' && s.label === 'grace')).toBe(false);
    expect(text).not.toContain('12 notes');
    expect(text).toContain('This week');
    expect(text).toContain(', up 67% from the prior period');
    expect(text).not.toContain(' — ');
    expect(text.endsWith('.')).toBe(true);
    expect(text.split('.').length - 1).toBe(1);
  });

  it('includes optional high-fit clauses when data is present', () => {
    const segments = buildPulseRightNowCopy({
      ...baseRightNowInput,
      risingBooks: [{ name: 'John', current: 50, previous: 30, delta: 20, deltaPct: 67 }],
      topPassage: { name: 'John 3:16', count: 11 },
      topThemes: [
        { name: "God's love", count: 5 },
        { name: 'faith in God', count: 4 },
        { name: "God's love for us", count: 3 },
      ],
      topTranslation: { name: 'NASB', count: 40 },
      topCanonSection: { label: 'Gospels', count: 22 },
      topTone: { name: 'Reflective', count: 8 },
      topFolder: { name: 'Romans study', count: 6 },
      topDictionaryWord: { name: 'propitiation', count: 4 },
    });
    const text = pulseRightNowSegmentsToText(segments);
    expect(text).not.toContain('11 notes');
    expect(text).not.toContain('unique passages');
    expect(text).not.toContain("God's love, faith in God");
    expect(text).toContain('with themes like faith in God, and God\'s love for us');
    expect(text).toContain('study clustered in the Gospels');
    expect(text).toContain('scripture mostly citing NASB');
    expect(text).toContain('notes reading reflective');
    expect(text).toContain('landing in Romans study');
    expect(text).toContain('and people pausing on propitiation');
  });

  it('skips optional clauses when counts are zero or inputs are null', () => {
    const segments = buildPulseRightNowCopy({
      ...baseRightNowInput,
      risingBooks: [{ name: 'John', current: 10, previous: 5, delta: 5, deltaPct: 100 }],
      topPassage: { name: 'John 3:16', count: 3 },
      topThemes: [
        { name: 'grace', count: 2 },
        { name: 'peace', count: 1 },
      ],
      topTranslation: { name: 'NASB', count: 0 },
      topCanonSection: { label: 'Gospels', count: 0 },
      topTone: null,
      topFolder: null,
      topDictionaryWord: null,
    });
    const text = pulseRightNowSegmentsToText(segments);
    expect(text).not.toContain('unique passages');
    expect(text).not.toContain('Gospels');
    expect(text).not.toContain('NASB');
    expect(text).not.toContain('notes reading');
    expect(text).not.toContain('landing in');
    expect(text).not.toContain('pausing on');
  });

  it('uses the 14-day window lead when days is not 7', () => {
    const segments = buildPulseRightNowCopy({
      ...baseRightNowInput,
      days: 14,
      topPassage: { name: 'John 3:16', count: 5 },
    });
    expect(pulseRightNowSegmentsToText(segments)).toContain('In the last 14 days');
  });

  it('skips the hero top theme and only surfaces additional themes', () => {
    const segments = buildPulseRightNowCopy({
      ...baseRightNowInput,
      topThemes: [
        { name: 'hope', count: 5 },
        { name: 'rest', count: 2 },
      ],
    });
    const text = pulseRightNowSegmentsToText(segments);
    expect(text).toContain('with theme rest trending');
    expect(text).not.toContain('hope');
  });

  it('omits the themes clause when only the hero theme exists', () => {
    const segments = buildPulseRightNowCopy({
      ...baseRightNowInput,
      topThemes: [{ name: 'hope', count: 2 }],
    });
    expect(pulseRightNowSegmentsToText(segments)).not.toContain('trending');
  });

  it('falls back to passage-only opener when rising book is absent', () => {
    const segments = buildPulseRightNowCopy({
      ...baseRightNowInput,
      topPassage: { name: 'Romans 8:28', count: 4 },
    });
    const text = pulseRightNowSegmentsToText(segments);
    expect(text).toMatch(/^This week, with Romans 8:28 the most-saved passage\.$/);
  });

  it('returns empty segments when no signals are available', () => {
    expect(buildPulseRightNowCopy(baseRightNowInput)).toEqual([]);
  });

  it('includes thread link activity and Home recall when present', () => {
    const segments = buildPulseRightNowCopy({
      ...baseRightNowInput,
      topPassage: { name: 'John 3:16', count: 4 },
      threads: {
        linksCreated: 2,
        threadsLinkedInWindow: 1,
        avgNotesPerThread: 3,
        topThreadTheme: { name: "God's love", count: 2 },
        recallImpressions: 5,
      },
    });
    const text = pulseRightNowSegmentsToText(segments);
    expect(text).toContain('with 2 note links across 1 thread');
    expect(text).toContain("connected threads exploring God's love");
    expect(text).toContain('Home surfacing 5 thread suggestions');
    expect(text).not.toContain('total threads');
  });

  it('skips thread theme when it matches the hero top theme', () => {
    const segments = buildPulseRightNowCopy({
      ...baseRightNowInput,
      topThemes: [{ name: 'Mission', count: 6 }],
      threads: {
        linksCreated: 0,
        threadsLinkedInWindow: 0,
        avgNotesPerThread: 3,
        topThreadTheme: { name: 'Mission', count: 2 },
        recallImpressions: 0,
      },
    });
    const text = pulseRightNowSegmentsToText(segments);
    expect(text).toContain('threads averaging 3 notes each');
    expect(text).not.toContain('connected threads exploring');
  });

  it('falls back to avg notes per thread when no links were created in the window', () => {
    const segments = buildPulseRightNowCopy({
      ...baseRightNowInput,
      risingBooks: [{ name: 'Romans', current: 10, previous: 5, delta: 5, deltaPct: 100 }],
      threads: {
        linksCreated: 0,
        threadsLinkedInWindow: 0,
        avgNotesPerThread: 4.2,
        topThreadTheme: null,
        recallImpressions: 0,
      },
    });
    expect(pulseRightNowSegmentsToText(segments)).toContain('threads averaging 4.2 notes each');
  });
});

describe('attachRankDeltasToListedItems', () => {
  it('attaches prior counts and deltas for each current item', () => {
    const current = [
      { name: 'Romans 8:28', count: 12 },
      { name: 'John 3:16', count: 8 },
    ];
    const previous = [
      { name: 'Romans 8:28', count: 9 },
      { name: 'Psalms 23', count: 5 },
    ];
    const items = attachRankDeltasToListedItems(current, previous);
    expect(items[0]).toEqual({
      name: 'Romans 8:28',
      count: 12,
      previous: 9,
      delta: 3,
      deltaPct: 33,
    });
    expect(items[1]).toEqual({
      name: 'John 3:16',
      count: 8,
      previous: 0,
      delta: 8,
      deltaPct: null,
    });
  });
});
