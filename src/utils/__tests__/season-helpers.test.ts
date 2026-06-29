import { describe, expect, it } from 'vitest';
import {
  formatMonthLabel,
  getSeasonDisplayName,
  getSeasonEnd,
  getSeasonForMonth,
  getSeasonMonths,
  getSeasonStart,
  isAdminReportMonthInCatalog,
  getAdminReportMonthStatus,
  listReportCatalogSeasonsForYear,
  listSeasonsForYear,
} from '../season-helpers';

describe('getSeasonForMonth', () => {
  it('maps calendar months to XP seasons', () => {
    expect(getSeasonForMonth('2026-03')).toBe('spring-2026');
    expect(getSeasonForMonth('2026-06')).toBe('summer-2026');
    expect(getSeasonForMonth('2026-09')).toBe('fall-2026');
    expect(getSeasonForMonth('2025-12')).toBe('winter-2025');
    expect(getSeasonForMonth('2026-01')).toBe('winter-2025');
    expect(getSeasonForMonth('2026-02')).toBe('winter-2025');
  });
});

describe('getSeasonMonths', () => {
  it('returns chronological month keys for each season', () => {
    expect(getSeasonMonths('spring-2026')).toEqual(['2026-03', '2026-04', '2026-05']);
    expect(getSeasonMonths('winter-2025')).toEqual(['2025-12', '2026-01', '2026-02']);
  });
});

describe('listSeasonsForYear', () => {
  it('lists four seasons for a calendar year', () => {
    expect(listSeasonsForYear(2026)).toEqual([
      'spring-2026',
      'summer-2026',
      'fall-2026',
      'winter-2026',
    ]);
  });
});

describe('admin reports catalog scope', () => {
  it('starts at June 2026', () => {
    expect(isAdminReportMonthInCatalog('2026-05')).toBe(false);
    expect(isAdminReportMonthInCatalog('2026-06')).toBe(true);
  });

  it('omits spring 2026 from catalog seasons', () => {
    expect(listReportCatalogSeasonsForYear(2026)).toEqual([
      'summer-2026',
      'fall-2026',
      'winter-2026',
    ]);
  });

  it('filters pre-launch months from summer 2026', () => {
    const months = getSeasonMonths('summer-2026').filter(isAdminReportMonthInCatalog);
    expect(months).toEqual(['2026-06', '2026-07', '2026-08']);
  });
});

describe('getAdminReportMonthStatus', () => {
  it('labels future months as upcoming', () => {
    const status = getAdminReportMonthStatus('2026-08', null, new Date('2026-06-15T12:00:00Z'));
    expect(status.kind).toBe('upcoming');
    expect(status.label).toBe('Upcoming');
  });

  it('labels the current month as in progress', () => {
    const status = getAdminReportMonthStatus('2026-06', null, new Date('2026-06-20T12:00:00Z'));
    expect(status.kind).toBe('collecting');
    expect(status.label).toBe('In progress');
    expect(status.title).toContain('Jul 1');
  });

  it('labels a past month before snapshot time as scheduled', () => {
    const status = getAdminReportMonthStatus('2026-06', null, new Date('2026-07-01T01:00:00Z'));
    expect(status.kind).toBe('scheduled');
    expect(status.label).toBe('Auto Jul 1 UTC');
  });

  it('labels an overdue month as missing', () => {
    const status = getAdminReportMonthStatus('2026-06', null, new Date('2026-07-02T12:00:00Z'));
    expect(status.kind).toBe('missing');
    expect(status.label).toBe('Backfill in Maintenance');
  });

  it('formats generated timestamps', () => {
    const status = getAdminReportMonthStatus('2026-06', '2026-07-01T02:05:00.000Z', new Date('2026-08-01T12:00:00Z'));
    expect(status.kind).toBe('generated');
    expect(status.label.length).toBeGreaterThan(0);
  });
});

describe('formatMonthLabel', () => {
  it('formats YYYY-MM for display', () => {
    expect(formatMonthLabel('2026-03')).toBe('Mar 2026');
    expect(formatMonthLabel('2025-12')).toBe('Dec 2025');
  });
});

describe('getSeasonDisplayName', () => {
  it('capitalizes season name with year', () => {
    expect(getSeasonDisplayName('winter-2025')).toBe('Winter 2025');
  });
});

describe('getSeasonStart and getSeasonEnd', () => {
  it('bounds spring locally', () => {
    expect(getSeasonStart('spring-2026')).toEqual(new Date(2026, 2, 1));
    expect(getSeasonEnd('spring-2026')).toEqual(new Date(2026, 4, 31));
  });

  it('bounds winter across calendar years', () => {
    expect(getSeasonStart('winter-2025')).toEqual(new Date(2025, 11, 1));
    expect(getSeasonEnd('winter-2025')).toEqual(new Date(2026, 1, 28));
  });
});
