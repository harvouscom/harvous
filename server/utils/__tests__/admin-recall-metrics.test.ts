import { describe, expect, it } from 'vitest';
import { recallAvgStabilityDays, pickRecallOpenTrendSource, recallSnoozeRatePct } from '../admin-usage-stats';
import { validateRecallEventInput } from '../record-recall-event';
import { collapseRecallHistory } from '../record-recall-event';

describe('recallSnoozeRatePct', () => {
  it('computes snooze rate as percent of opens', () => {
    expect(recallSnoozeRatePct(40, 10)).toBe(25);
    expect(recallSnoozeRatePct(0, 5)).toBe(0);
  });
});

describe('recallAvgStabilityDays', () => {
  it('rounds stability to one decimal', () => {
    expect(recallAvgStabilityDays(21.456)).toBe(21.5);
    expect(recallAvgStabilityDays(null)).toBe(0);
  });
});

describe('pickRecallOpenTrendSource', () => {
  it('uses RecallEvents when any opens exist', () => {
    const events = [{ date: '2026-06-29', count: 3 }];
    const legacy = [{ date: '2026-06-29', count: 12 }];
    expect(pickRecallOpenTrendSource(events, legacy)).toEqual(events);
  });

  it('falls back to fingerprint engagements when events are empty', () => {
    const legacy = [{ date: '2026-06-29', count: 12 }];
    expect(pickRecallOpenTrendSource([], legacy)).toEqual(legacy);
  });
});

describe('validateRecallEventInput', () => {
  it('accepts valid open events with optional noteId', () => {
    expect(
      validateRecallEventInput({
        opportunityId: 'note_abc',
        kind: 'revisitNote',
        action: 'open',
        noteId: 'note_abc',
      }),
    ).toEqual({
      opportunityId: 'note_abc',
      kind: 'revisitNote',
      action: 'open',
      noteId: 'note_abc',
    });
  });

  it('rejects invalid kind or action', () => {
    expect(
      validateRecallEventInput({ opportunityId: 'x', kind: 'invalid', action: 'open' }),
    ).toBeNull();
    expect(
      validateRecallEventInput({ opportunityId: 'x', kind: 'arc', action: 'dismiss' }),
    ).toBeNull();
  });
});

describe('collapseRecallHistory', () => {
  it('keeps only the most recent entry per opportunity and action', () => {
    // Rows arrive newest-first, so the first one seen for a pair wins.
    const collapsed = collapseRecallHistory([
      { opportunityId: 'a', action: 'open', createdAt: '2026-08-03T00:00:00.000Z' },
      { opportunityId: 'a', action: 'open', createdAt: '2026-07-01T00:00:00.000Z' },
    ]);
    expect(collapsed).toEqual([
      { opportunityId: 'a', action: 'open', createdAt: '2026-08-03T00:00:00.000Z' },
    ]);
  });

  it('treats open and snooze on the same card as separate entries', () => {
    // They have different suppression windows, so both matter.
    const collapsed = collapseRecallHistory([
      { opportunityId: 'a', action: 'open', createdAt: '2026-08-03T00:00:00.000Z' },
      { opportunityId: 'a', action: 'snooze', createdAt: '2026-08-02T00:00:00.000Z' },
    ]);
    expect(collapsed).toHaveLength(2);
  });

  it('carries completions through, so a finished loop suppresses across devices', () => {
    const collapsed = collapseRecallHistory([
      { opportunityId: 'a', action: 'complete', createdAt: '2026-08-03T00:00:00.000Z' },
    ]);
    expect(collapsed).toEqual([
      { opportunityId: 'a', action: 'complete', createdAt: '2026-08-03T00:00:00.000Z' },
    ]);
  });

  it('keeps a completion separate from the open that preceded it', () => {
    // Tapping the card and finishing what it asked for are two events with two windows.
    const collapsed = collapseRecallHistory([
      { opportunityId: 'a', action: 'complete', createdAt: '2026-08-03T00:00:00.000Z' },
      { opportunityId: 'a', action: 'open', createdAt: '2026-08-03T00:00:00.000Z' },
    ]);
    expect(collapsed).toHaveLength(2);
  });

  it('drops impressions, which say nothing about intent', () => {
    const collapsed = collapseRecallHistory([
      { opportunityId: 'a', action: 'impression', createdAt: '2026-08-03T00:00:00.000Z' },
    ]);
    expect(collapsed).toEqual([]);
  });

  it('normalizes Date columns to ISO strings', () => {
    const collapsed = collapseRecallHistory([
      { opportunityId: 'a', action: 'open', createdAt: new Date('2026-08-03T00:00:00.000Z') },
    ]);
    expect(collapsed[0].createdAt).toBe('2026-08-03T00:00:00.000Z');
  });

  it('skips rows with no id or no timestamp', () => {
    const collapsed = collapseRecallHistory([
      { opportunityId: '', action: 'open', createdAt: '2026-08-03T00:00:00.000Z' },
      { opportunityId: 'b', action: 'open', createdAt: null },
    ]);
    expect(collapsed).toEqual([]);
  });
});
