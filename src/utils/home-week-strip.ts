/**
 * The Home greeting's week: this calendar week, Sunday to Saturday, as small bars, and the
 * sentence that reads them ("Here Monday, Wednesday and today.").
 *
 * A calendar week, not the last seven days (Oct 2026): a rolling window started on whatever day
 * it was a week ago — "F S S M T W T" on a Thursday — which read as a scrambled week. Days still
 * ahead are drawn as empty slots, so where today falls in the week is visible at a glance.
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
  /** Later this week — nothing has happened yet, so nothing is drawn or said about it. */
  future: boolean;
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

/** This week, Sunday first. */
export function buildWeekStrip(
  days: StudyFeedDay[],
  now: Date,
  options: { hasOlder: boolean },
): WeekStripDay[] {
  const byKey = new Map(days.map((day) => [day.dayKey, day]));
  const oldestLoaded = days.length ? days[days.length - 1]!.dayKey : localDayKey(now);
  const out: WeekStripDay[] = [];
  const todayIndex = now.getDay();
  for (let i = 0; i < 7; i++) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - todayIndex + i);
    const dayKey = localDayKey(date);
    const day = byKey.get(dayKey);
    const future = i > todayIndex;
    const count = day && !future ? day.parts.reduce((n, part) => n + part.items.length, 0) : 0;
    // Before the oldest loaded day, with more pages to come, we don't know yet.
    const known = future || Boolean(day) || !options.hasOlder || dayKey >= oldestLoaded;
    out.push({
      dayKey,
      initial: WEEKDAYS[date.getDay()]!.charAt(0),
      weekday: WEEKDAYS[date.getDay()]!,
      count,
      isToday: i === todayIndex,
      future,
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

function joinDays(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * The sentence the bars prove, naming what they show (Oct 2026): "Here Monday, Wednesday and
 * today." A count alone ("In the Word today.") said nothing the chart beside it didn't, and left
 * the reader to match words to bars. Up to three days are named; past that, counted. Kind about
 * a quiet week — it never counts what didn't happen.
 */
export function weekStripLine(strip: WeekStripDay[]): string {
  const sofar = strip.filter((day) => !day.future);
  const active = sofar.filter((day) => day.count > 0);
  if (active.length === 0) return 'Good to see you back.';
  if (active.length === sofar.length && sofar.length > 1) return 'Every day so far this week.';
  if (active.length <= 3) {
    const names = active.map((day) => (day.isToday ? 'today' : day.weekday));
    if (names.length === 1 && names[0] === 'today') {
      return sofar.length === 1 ? 'In the Word today.' : 'Here today, the first time this week.';
    }
    return `Here ${joinDays(names)}${active.some((day) => day.isToday) ? '' : ' this week'}.`;
  }
  return `${NUMBER_WORDS[active.length]} days in the Word this week.`;
}

/** What the bars say, for a screen reader that can't see them. */
export function weekStripLabel(strip: WeekStripDay[]): string {
  const parts = strip
    .filter((day) => day.known && !day.future)
    .map((day) => `${day.isToday ? 'today' : day.weekday} ${day.count === 0 ? 'nothing' : day.count}`);
  return `This week so far: ${parts.join(', ')}`;
}
