/** Shared inclusive UTC day window for admin Usage + Pulse dashboards. */

export function clampAdminDays(daysParam: number): number {
  return Math.min(Math.max(daysParam, 1), 90);
}

/**
 * UTC midnight at the start of the oldest day in an inclusive N-day window (today = day 1).
 * Matches trend chart daily buckets.
 */
export function adminWindowSince(daysParam: number): Date {
  const days = clampAdminDays(daysParam);
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - (days - 1));
  return d;
}

/** Prior window of the same length immediately before the current window. */
export function adminWindowPreviousRange(daysParam: number): { since: Date; until: Date } {
  const days = clampAdminDays(daysParam);
  const until = adminWindowSince(days);
  const since = new Date(until);
  since.setUTCDate(since.getUTCDate() - days);
  return { since, until };
}
