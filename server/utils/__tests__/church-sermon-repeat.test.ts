import { describe, expect, it } from 'vitest';
import {
  REPEAT_MAX_WEEKS,
  repeatTitleFor,
  weeklyDatesAfter,
} from '../church-sermon-repeat';

describe('weeklyDatesAfter', () => {
  it('steps forward a week at a time, excluding the seed', () => {
    expect(weeklyDatesAfter('2026-09-06', 3)).toEqual(['2026-09-13', '2026-09-20', '2026-09-27']);
  });

  it('crosses a month and a year without drifting', () => {
    expect(weeklyDatesAfter('2026-12-20', 3)).toEqual(['2026-12-27', '2027-01-03', '2027-01-10']);
  });

  /*
    The reason this is UTC arithmetic. US DST ends Nov 1 2026; adding days to a
    local Date across that boundary gives a 25-hour day, and "every Sunday"
    silently becomes a Saturday.
  */
  it('stays on the same weekday across a DST boundary', () => {
    const dates = weeklyDatesAfter('2026-10-25', 3);
    expect(dates).toEqual(['2026-11-01', '2026-11-08', '2026-11-15']);
    for (const date of dates) {
      expect(new Date(`${date}T00:00:00Z`).getUTCDay()).toBe(0);
    }
  });

  it('handles a leap day seed', () => {
    expect(weeklyDatesAfter('2028-02-29', 2)).toEqual(['2028-03-07', '2028-03-14']);
  });

  it('caps at the quarter, however many are asked for', () => {
    expect(weeklyDatesAfter('2026-09-06', 500)).toHaveLength(REPEAT_MAX_WEEKS);
  });

  it('generates nothing rather than throwing on bad input', () => {
    expect(weeklyDatesAfter('2026-09-06', 0)).toEqual([]);
    expect(weeklyDatesAfter('2026-09-06', -4)).toEqual([]);
    expect(weeklyDatesAfter('not-a-date', 4)).toEqual([]);
    expect(weeklyDatesAfter('', 4)).toEqual([]);
    expect(weeklyDatesAfter('2026-09-06T10:00:00Z', 4)).toEqual([]);
  });

  it('refuses a date that only looks real', () => {
    // Date.UTC rolls this into March; generating from it would start the plan
    // on a day the caller never named.
    expect(weeklyDatesAfter('2026-02-31', 2)).toEqual([]);
    expect(weeklyDatesAfter('2027-02-29', 2)).toEqual([]);
  });
});

describe('repeatTitleFor', () => {
  it('names generated rows after the series', () => {
    expect(repeatTitleFor({ seedTitle: 'No Condemnation', seriesTitle: 'Life in the Spirit' })).toBe(
      'Life in the Spirit',
    );
  });

  it('falls back to the seed title when the sermon has no series', () => {
    expect(repeatTitleFor({ seedTitle: 'Evening in the Psalms', seriesTitle: null })).toBe(
      'Evening in the Psalms',
    );
    expect(repeatTitleFor({ seedTitle: 'Evening in the Psalms', seriesTitle: '   ' })).toBe(
      'Evening in the Psalms',
    );
  });
});
