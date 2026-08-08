import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RERUN_COPY,
  buildRerunRows,
  rerunDatesFor,
  runLabelForDate,
} from '../church-series-rerun';

describe('rerunDatesFor', () => {
  it('preserves the source run’s shape rather than stepping weekly', () => {
    /*
      The Advent case, and the reason this is not `weeklyDatesAfter`. Four
      Sundays and a Christmas Eve: a rigid +7 would land the Thursday on a
      Sunday and flatten the one week the season is actually about.
    */
    const source = ['2026-11-29', '2026-12-06', '2026-12-13', '2026-12-20', '2026-12-24'];
    const dates = rerunDatesFor(source, '2027-11-28');
    expect(dates).toEqual([
      '2027-11-28',
      '2027-12-05',
      '2027-12-12',
      '2027-12-19',
      '2027-12-23',
    ]);
    // The 4-day gap between the last Sunday and Christmas Eve survives.
    const gap = (a: string, b: string) =>
      (Date.parse(b) - Date.parse(a)) / 86_400_000;
    expect(gap(dates![3], dates![4])).toBe(gap(source[3], source[4]));
  });

  it('handles the ordinary weekly run as a weekly run', () => {
    expect(rerunDatesFor(['2026-08-09', '2026-08-16', '2026-08-23'], '2027-08-08')).toEqual([
      '2027-08-08',
      '2027-08-15',
      '2027-08-22',
    ]);
  });

  it('sorts the source before measuring, so input order cannot skew offsets', () => {
    expect(rerunDatesFor(['2026-08-23', '2026-08-09'], '2027-01-03')).toEqual([
      '2027-01-03',
      '2027-01-17',
    ]);
  });

  it('drops undated backlog rows — there is no offset to preserve', () => {
    expect(rerunDatesFor([null, '2026-08-09', null, '2026-08-16'], '2027-08-08')).toEqual([
      '2027-08-08',
      '2027-08-15',
    ]);
  });

  it('returns null when the source has nothing dated, or the start is unreal', () => {
    expect(rerunDatesFor([null, null], '2027-08-08')).toBeNull();
    expect(rerunDatesFor(['2026-08-09'], '2027-02-31')).toBeNull();
    expect(rerunDatesFor(['2026-08-09'], 'nonsense')).toBeNull();
  });
});

describe('runLabelForDate', () => {
  it('is the year, derived rather than typed', () => {
    expect(runLabelForDate('2026-12-24')).toBe('2026');
    expect(runLabelForDate(null)).toBeNull();
  });
});

describe('buildRerunRows', () => {
  const source = [
    { serviceDate: '2026-12-06', title: 'Waiting', reference: 'Isaiah 40', starterTemplateId: 'ntpl_1', kind: 'gathering', serviceTime: '17:00' },
    { serviceDate: '2026-11-29', title: 'Longing', reference: 'Isaiah 64', starterTemplateId: null, kind: 'gathering', serviceTime: null },
  ] as never as Parameters<typeof buildRerunRows>[0]['source'];

  const base = {
    source,
    dates: ['2027-11-28', '2027-12-05'],
    seriesId: 'csrs_new',
    seriesTitle: 'Four kinds of waiting',
    churchId: 'chur_1',
    spaceId: null,
    userId: 'u1',
    now: new Date('2027-01-01T00:00:00Z'),
  };

  it('orders by the source date, not by input order', () => {
    const rows = buildRerunRows({ ...base, copy: DEFAULT_RERUN_COPY });
    expect(rows.map((r) => r.title)).toEqual(['Longing', 'Waiting']);
    expect(rows.map((r) => r.serviceDate)).toEqual(['2027-11-28', '2027-12-05']);
  });

  it('carries the study across by default, and never the one-off time', () => {
    const rows = buildRerunRows({ ...base, copy: DEFAULT_RERUN_COPY });
    expect(rows[1].reference).toBe('Isaiah 40');
    expect(rows[1].starterTemplateId).toBe('ntpl_1');
    // A 17:00 Christmas Eve is a fact about that year's date, not the season.
    expect(rows[1].serviceTime).toBeNull();
    // Resources are off by default — a handout with last year's dates on it.
    expect(DEFAULT_RERUN_COPY.resources).toBe(false);
  });

  it('falls back to the series name when titles are not copied', () => {
    const rows = buildRerunRows({
      ...base,
      copy: { ...DEFAULT_RERUN_COPY, titles: false, references: false, starterTemplate: false },
    });
    // `title` is NOT NULL, so blank was never available; a numbered "Week 3"
    // says something that could become false.
    expect(rows.every((r) => r.title === 'Four kinds of waiting')).toBe(true);
    expect(rows.every((r) => r.reference === null)).toBe(true);
    expect(rows.every((r) => r.starterTemplateId === null)).toBe(true);
  });

  it('points every row at the new series', () => {
    const rows = buildRerunRows({ ...base, copy: DEFAULT_RERUN_COPY });
    expect(rows.every((r) => r.seriesId === 'csrs_new')).toBe(true);
  });
});
