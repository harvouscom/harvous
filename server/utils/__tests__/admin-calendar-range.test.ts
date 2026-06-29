import { describe, expect, it } from 'vitest';
import {
  adminCalendarMonthRange,
  adminCalendarYearRange,
  adminSeasonRange,
} from '../admin-calendar-range';

describe('adminCalendarMonthRange', () => {
  it('returns UTC half-open range for a month', () => {
    const { since, until } = adminCalendarMonthRange('2026-03');
    expect(since.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(until.toISOString()).toBe('2026-04-01T00:00:00.000Z');
  });

  it('handles December', () => {
    const { since, until } = adminCalendarMonthRange('2025-12');
    expect(since.toISOString()).toBe('2025-12-01T00:00:00.000Z');
    expect(until.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('adminSeasonRange', () => {
  it('spans winter months Dec–Feb', () => {
    const { since, until } = adminSeasonRange('winter-2025');
    expect(since.toISOString()).toBe('2025-12-01T00:00:00.000Z');
    expect(until.toISOString()).toBe('2026-03-01T00:00:00.000Z');
  });

  it('spans spring Mar–May', () => {
    const { since, until } = adminSeasonRange('spring-2026');
    expect(since.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(until.toISOString()).toBe('2026-06-01T00:00:00.000Z');
  });
});

describe('adminCalendarYearRange', () => {
  it('spans full calendar year in UTC', () => {
    const { since, until } = adminCalendarYearRange(2026);
    expect(since.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(until.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
});
