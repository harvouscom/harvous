import { describe, expect, it } from 'vitest';
import {
  cadenceLabel,
  cadenceShortLabel,
  isCadenceStale,
  parsePublishCadence,
  parsePublishCadenceInput,
  staffCadenceStaleHint,
} from '../channel-publish-cadence';

describe('parsePublishCadence', () => {
  it('accepts known values and rejects junk', () => {
    expect(parsePublishCadence('weekly')).toBe('weekly');
    expect(parsePublishCadence('WEEKLY')).toBe('weekly');
    expect(parsePublishCadence('')).toBeNull();
    expect(parsePublishCadence('hourly')).toBeNull();
  });
});

describe('parsePublishCadenceInput', () => {
  it('omits missing, clears empty, rejects invalid', () => {
    expect(parsePublishCadenceInput(null)).toEqual({ kind: 'omit' });
    expect(parsePublishCadenceInput('')).toEqual({ kind: 'set', value: null });
    expect(parsePublishCadenceInput('none')).toEqual({ kind: 'set', value: null });
    expect(parsePublishCadenceInput('monthly')).toEqual({ kind: 'set', value: 'monthly' });
    expect(parsePublishCadenceInput('bi-weekly')).toEqual({ kind: 'invalid' });
  });
});

describe('cadenceLabel', () => {
  it('returns display labels', () => {
    expect(cadenceLabel('weekly')).toBe('Updates weekly');
    expect(cadenceShortLabel('biweekly')).toBe('Every 2 weeks');
    expect(cadenceLabel(null)).toBeNull();
  });
});

describe('isCadenceStale', () => {
  const now = new Date('2026-07-22T12:00:00.000Z');

  it('is never stale for null, irregular, or empty channels', () => {
    expect(isCadenceStale(null, 'weekly', now)).toBe(false);
    expect(isCadenceStale('2026-01-01T00:00:00.000Z', 'irregular', now)).toBe(false);
    expect(isCadenceStale('2026-01-01T00:00:00.000Z', null, now)).toBe(false);
  });

  it('is not stale at or under 2× the interval', () => {
    // weekly → 14 days threshold; exactly 14 days is not > 2×
    expect(isCadenceStale('2026-07-08T12:00:00.000Z', 'weekly', now)).toBe(false);
    // just under
    expect(isCadenceStale('2026-07-08T12:00:01.000Z', 'weekly', now)).toBe(false);
  });

  it('is stale when lag exceeds 2× the interval', () => {
    expect(isCadenceStale('2026-07-08T11:59:59.000Z', 'weekly', now)).toBe(true);
    // monthly → 60 days
    expect(isCadenceStale('2026-05-22T11:00:00.000Z', 'monthly', now)).toBe(true);
    expect(isCadenceStale('2026-05-24T12:00:00.000Z', 'monthly', now)).toBe(false);
  });
});

describe('staffCadenceStaleHint', () => {
  it('names the declared cadence', () => {
    expect(staffCadenceStaleHint('weekly')).toContain('Weekly');
    expect(staffCadenceStaleHint('irregular')).toBeNull();
  });
});
