/** UTC calendar ranges for admin monthly reports (aligned with trend daily buckets). */

import { getSeasonEnd, getSeasonMonths, getSeasonStart } from '@/utils/season-helpers';

export type AdminCalendarRange = { since: Date; until: Date };

function parseMonthKey(monthKey: string): { year: number; month: number } {
  const [yearStr, monthStr] = monthKey.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  if (!year || month < 1 || month > 12) {
    throw new Error(`Invalid month key: ${monthKey}`);
  }
  return { year, month };
}

/** UTC half-open range `[since, until)` for one calendar month. */
export function adminCalendarMonthRange(monthKey: string): AdminCalendarRange {
  const { year, month } = parseMonthKey(monthKey);
  const since = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const until = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  return { since, until };
}

/** UTC half-open range covering all months in an XP season. */
export function adminSeasonRange(seasonId: string): AdminCalendarRange {
  const months = getSeasonMonths(seasonId);
  const first = adminCalendarMonthRange(months[0]);
  const last = adminCalendarMonthRange(months[months.length - 1]);
  return { since: first.since, until: last.until };
}

/** UTC half-open range for a calendar year. */
export function adminCalendarYearRange(year: number): AdminCalendarRange {
  return {
    since: new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)),
    until: new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0, 0)),
  };
}

/** Local season boundaries converted to UTC start/end for reference (not used for SQL filters). */
export function adminSeasonLocalBounds(seasonId: string): { start: Date; end: Date } {
  return { start: getSeasonStart(seasonId), end: getSeasonEnd(seasonId) };
}
