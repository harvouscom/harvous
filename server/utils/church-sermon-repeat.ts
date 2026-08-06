/**
 * "Repeat weekly" — the eight-week study entered once instead of eight times.
 *
 * Bulk quarter entry, per `docs/future/CHURCH_SPACE_PLANS_AND_SERVICE_TIMES.md`
 * §9. A pastor plans a series in one sitting and then fills in each week's text
 * as it comes; before this they had to open the editor thirteen times, and the
 * series name had thirteen chances to be typed differently.
 *
 * This file is the arithmetic only. The two plans differ in what a generated
 * row *claims* — the church's rows claim service-time slots, a space's rows are
 * timeless — so each route owns its own loop and its own collision message,
 * and shares the parts that cannot differ.
 */

/**
 * Twelve more weeks, so seed + repeats is a quarter and a week.
 *
 * A cap rather than an open number because the failure mode is silent bulk: a
 * fat-fingered 200 would write four years of Sundays that someone then has to
 * delete one at a time.
 */
export const REPEAT_MAX_WEEKS = 12;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * The next `count` weekly dates after `seedDate`, ascending.
 *
 * UTC arithmetic on purpose. `ChurchServices.serviceDate` is a wall-calendar
 * day, not an instant, and adding days to a local `Date` around a DST boundary
 * lands on 23- or 25-hour days — which is how "every Sunday" quietly becomes a
 * Saturday in November. Stepping in UTC has no such boundary.
 *
 * Returns `[]` for a malformed seed or a non-positive count rather than
 * throwing: the routes validate their own input, and a helper that returns
 * nothing cannot half-generate a plan.
 */
export function weeklyDatesAfter(seedDate: string, count: number): string[] {
  const match = ISO_DATE.exec(seedDate);
  if (!match) return [];
  const weeks = Math.min(Math.floor(count), REPEAT_MAX_WEEKS);
  if (!Number.isFinite(weeks) || weeks < 1) return [];

  const start = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  // A real date check: Date.UTC happily rolls 2026-02-31 into March, which
  // would generate a plan starting on a day the caller never named.
  if (new Date(start).toISOString().slice(0, 10) !== seedDate) return [];

  const dates: string[] = [];
  for (let i = 1; i <= weeks; i++) {
    dates.push(new Date(start + i * 7 * 86_400_000).toISOString().slice(0, 10));
  }
  return dates;
}

/**
 * What a generated row is called before anyone has written that week.
 *
 * The series name, when there is one. The design asked for blank titles — the
 * series carries the meaning, and eight rows reading "Week 3" are worse than
 * eight waiting for their text — but `ChurchServices.title` is NOT NULL, so
 * blank is not available. The series name is the honest substitute: it reads
 * correctly in the plan list ("Sep 30 · Who You Are"), says nothing that could
 * become false, and is exactly what the pastor overwrites first.
 *
 * With no series, the seed's own title carries over: repeating a standalone
 * sermon is rare, and copying its name beats inventing one.
 */
export function repeatTitleFor(input: { seedTitle: string; seriesTitle: string | null }): string {
  return input.seriesTitle?.trim() || input.seedTitle;
}
