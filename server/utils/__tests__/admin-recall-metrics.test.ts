import { describe, expect, it } from 'vitest';
import { recallAvgStabilityDays, pickRecallOpenTrendSource, recallSnoozeRatePct } from '../admin-usage-stats';
import { validateRecallEventInput } from '../record-recall-event';

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
