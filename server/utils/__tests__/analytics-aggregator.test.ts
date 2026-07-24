import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getCurrentMonth, getPreviousMonth } from '../analytics-aggregator';
import { adminCalendarMonthRange } from '../admin-calendar-range';

describe('getCurrentMonth', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns UTC month key', () => {
    vi.setSystemTime(new Date('2026-07-03T12:00:00.000Z'));
    expect(getCurrentMonth()).toBe('2026-07');
  });
});

describe('getPreviousMonth', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns prior UTC month', () => {
    vi.setSystemTime(new Date('2026-07-03T12:00:00.000Z'));
    expect(getPreviousMonth()).toBe('2026-06');
  });

  it('rolls back across year boundary', () => {
    vi.setSystemTime(new Date('2026-01-15T12:00:00.000Z'));
    expect(getPreviousMonth()).toBe('2025-12');
  });
});

describe('aggregateMonthlyAnalytics implementation', () => {
  const src = readFileSync(join(__dirname, '../analytics-aggregator.ts'), 'utf8');

  it('uses UTC adminCalendarMonthRange for query bounds', () => {
    expect(src).toContain('adminCalendarMonthRange(month)');
    expect(src).not.toMatch(/new Date\(year, monthNum - 1, 1\)\.toISOString\(\)/);
  });

  it('filters with Date objects not ISO strings', () => {
    expect(src).toContain('gte(ScriptureMetadata.createdAt, monthStart)');
    expect(src).toContain('lt(ScriptureMetadata.createdAt, monthEnd)');
  });

  it('deletes stale MonthlyAnalytics rows on re-run', () => {
    expect(src).toContain('delete(MonthlyAnalytics)');
    expect(src).toContain('insert(MonthlyAnalytics)');
  });
});

describe('admin pulse threads report summary', () => {
  const src = readFileSync(join(__dirname, '../admin-pulse-threads-stats.ts'), 'utf8');

  it('uses window-scoped SQL counts for monthly reports', () => {
    const reportFn = src.slice(src.indexOf('getAdminPulseThreadsSummaryForReport'));
    expect(reportFn).toContain('users_with_links');
    expect(reportFn).not.toMatch(/fetchPlatformThreadSnapshot\(\)/);
  });
});

describe('adminCalendarMonthRange alignment', () => {
  it('matches June 2026 UTC half-open interval', () => {
    const { since, until } = adminCalendarMonthRange('2026-06');
    expect(since.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(until.toISOString()).toBe('2026-07-01T00:00:00.000Z');
  });
});
