/**
 * Landing on a chosen day in a stack that only knows the days it has fetched.
 *
 * The feed is paged: `useStudyFeed` pulls a window at a time, and `buildStudyFeedDays` turns
 * whatever has arrived into one sheet per calendar day — including the empty ones between
 * items, so the run is continuous back to the oldest thing loaded and no further.
 *
 * That makes a date jump two different operations wearing one gesture. A date inside the
 * loaded run is an index, and moving there is instant. A date behind it does not exist yet,
 * and cannot be conjured — the only way to reach it is to keep asking for pages until the run
 * grows past it. The caller drives that loop; these decide what it should do next, so the rule
 * can be read and tested without a query client.
 */

import type { StudyFeedDay } from './study-feed-items';

export type StudyFeedJumpStep =
  /** The day is loaded. Move to it. */
  | { action: 'jump'; index: number }
  /** Older than anything loaded, and there are more pages. Fetch, then ask again. */
  | { action: 'fetch' }
  /**
   * Older than anything loaded and there is nothing more to fetch — the study simply does not
   * go back that far. Land on the oldest sheet rather than doing nothing: a picker that
   * silently ignores a date leaves the reader wondering whether they mis-tapped.
   */
  | { action: 'settle'; index: number }
  /** Nothing to do — no days at all. */
  | { action: 'none' };

export function studyFeedJumpStep(input: {
  days: readonly Pick<StudyFeedDay, 'dayKey'>[];
  /** `YYYY-MM-DD`, local. */
  targetDayKey: string;
  hasMore: boolean;
}): StudyFeedJumpStep {
  const { days, targetDayKey, hasMore } = input;
  if (days.length === 0) return { action: 'none' };

  const index = days.findIndex((day) => day.dayKey === targetDayKey);
  if (index >= 0) return { action: 'jump', index };

  /*
   * Newer than the run is not a "fetch deeper" case and must never become one — pages only go
   * backwards, so asking for more would loop forever on a date the feed will never contain.
   * The picker's own ceiling should stop this happening; this is the guard that means a bug
   * there costs a wrong landing rather than an endless fetch.
   */
  const newest = days[0]?.dayKey;
  if (newest && targetDayKey > newest) return { action: 'jump', index: 0 };

  if (hasMore) return { action: 'fetch' };
  return { action: 'settle', index: days.length - 1 };
}
