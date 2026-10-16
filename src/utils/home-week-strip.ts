/**
 * The Home greeting's week: the last seven days as small bars, today last, and the sentence that
 * reads them ("Five days in the Word this week.").
 *
 * Built from the study feed's days (`buildStudyFeedDays`), which already bucket notes written,
 * passages read and highlights by local day. The feed loads by page, not by week, so a day older
 * than the oldest loaded item is `known: false` rather than counted as a rest day — the caller
 * fetches another page until the week is covered, and an unknown day never says "you skipped".
 */
import type { StudyFeedDay } from './study-feed-items';

export interface WeekStripDay {
  /** Local calendar day, `YYYY-MM-DD`. */
  dayKey: string;
  /** One letter, "M" … "S", for under the bar. */
  initial: string;
  /** The day's weekday, for screen readers ("Thursday"). */
  weekday: string;
  /** How many things happened that day (notes, passages, highlights). */
  count: number;
  isToday: boolean;
  /** False when the loaded feed doesn't reach back to this day yet. */
  known: boolean;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function localDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** The last seven days, oldest first, today last. */
export function buildWeekStrip(
  days: StudyFeedDay[],
  now: Date,
  options: { hasOlder: boolean },
): WeekStripDay[] {
  const byKey = new Map(days.map((day) => [day.dayKey, day]));
  const oldestLoaded = days.length ? days[days.length - 1]!.dayKey : localDayKey(now);
  const out: WeekStripDay[] = [];
  for (let back = 6; back >= 0; back--) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
    const dayKey = localDayKey(date);
    const day = byKey.get(dayKey);
    const count = day ? day.parts.reduce((n, part) => n + part.items.length, 0) : 0;
    // Before the oldest loaded day, with more pages to come, we don't know yet.
    const known = Boolean(day) || !options.hasOlder || dayKey >= oldestLoaded;
    out.push({
      dayKey,
      initial: WEEKDAYS[date.getDay()]!.charAt(0),
      weekday: WEEKDAYS[date.getDay()]!,
      count,
      isToday: back === 0,
      known,
    });
  }
  return out;
}

/** True while a day of the week is still waiting on an older page of the feed. */
export function weekStripNeedsOlder(strip: WeekStripDay[]): boolean {
  return strip.some((day) => !day.known);
}

const NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven'];

/**
 * The sentence the strip proves: "Five days in the Word this week." Kind about a quiet week —
 * it never counts what didn't happen.
 */
export function weekStripLine(strip: WeekStripDay[]): string {
  const active = strip.filter((day) => day.count > 0);
  if (active.length === 0) return 'Good to see you back.';
  if (active.length === 7) return 'Every day in the Word this week.';
  if (active.length === 1) {
    return active[0]!.isToday ? 'In the Word today.' : 'One day in the Word this week.';
  }
  return `${NUMBER_WORDS[active.length]} days in the Word this week.`;
}

/** What the bars say, for a screen reader that can't see them. */
export function weekStripLabel(strip: WeekStripDay[]): string {
  const parts = strip
    .filter((day) => day.known)
    .map((day) => `${day.isToday ? 'today' : day.weekday} ${day.count === 0 ? 'nothing' : day.count}`);
  return `Your last seven days: ${parts.join(', ')}`;
}
