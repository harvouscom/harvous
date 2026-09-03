/**
 * How you have done with Review, said on the day's own sheet.
 *
 * Not a dashboard, and deliberately not a streak. The strategy doc's named failure mode is a
 * feature that counts at you — "27 due", a fire emoji, a run of days you can break — and a
 * streak is the one mechanism that turns a day off into a loss. What is here instead is a
 * chip in the sentence Activity already writes about the day ("Today 1 note and 3 reviews so
 * far") and one caption under the Review section for the week. Both are counts of what you
 * did, in the same voice as the notes and passages beside them.
 *
 * The answers arrive as bare `{ at, held }` records — no item ids, no attempt text, nothing
 * about *what* was asked. A day summary has no use for any of that, and the feed is the wrong
 * place to reveal what someone got wrong.
 *
 * Bucketing is by **local** day, like every other row on Activity: the server cannot know the
 * reader's zone, so it sends timestamps and the client decides which day they fall on.
 */

export interface ReviewAnswerRecord {
  /** ISO timestamp of the answer. */
  at: string;
  /** Recalled cleanly. "Almost" and "read again" are answers too, but they are not holds. */
  held: boolean;
}

export interface ReviewDayCounts {
  answered: number;
  held: number;
}

export const REVIEW_WEEK_DAYS = 7;

function localDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Answers per local calendar day, keyed the way `buildStudyFeedDays` keys its days. */
export function reviewCountsByDay(
  answers: readonly ReviewAnswerRecord[],
): Map<string, ReviewDayCounts> {
  const byDay = new Map<string, ReviewDayCounts>();
  for (const answer of answers) {
    const at = new Date(answer.at);
    if (Number.isNaN(at.getTime())) continue;
    const key = localDayKey(at);
    const counts = byDay.get(key) ?? { answered: 0, held: 0 };
    counts.answered += 1;
    if (answer.held) counts.held += 1;
    byDay.set(key, counts);
  }
  return byDay;
}

/**
 * The last seven days including today, counted from the start of the earliest one.
 *
 * Seven days, not "this week": a week that resets on Monday makes Sunday evening a deadline,
 * and a rolling window says the same thing without inventing one.
 */
export function reviewWeekCounts(
  answers: readonly ReviewAnswerRecord[],
  now: Date = new Date(),
): ReviewDayCounts {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - (REVIEW_WEEK_DAYS - 1));
  const totals: ReviewDayCounts = { answered: 0, held: 0 };
  for (const answer of answers) {
    const at = new Date(answer.at);
    if (Number.isNaN(at.getTime()) || at < start) continue;
    totals.answered += 1;
    if (answer.held) totals.held += 1;
  }
  return totals;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * The chip or chips for a day, in the order they are read.
 *
 * A day where everything was held says so in one chip — the single flourish in here, and it
 * is earned rather than awarded. A day where nothing was held says only how many were
 * answered: the absence is honest, and a "0 held" chip would be a scolding.
 */
export function reviewDayChipLabels(counts: ReviewDayCounts | null | undefined): string[] {
  const answered = Math.max(0, counts?.answered ?? 0);
  if (answered === 0) return [];
  const held = Math.min(answered, Math.max(0, counts?.held ?? 0));
  const reviews = plural(answered, 'review', 'reviews');
  if (held === answered) return [`${reviews}, all held`];
  if (held > 0) return [reviews, `${held} held`];
  return [reviews];
}

/** "This week: 11 reviews, 8 held." — null on a week with nothing in it, which says itself. */
export function reviewWeekCaption(counts: ReviewDayCounts): string | null {
  if (counts.answered <= 0) return null;
  const reviews = plural(counts.answered, 'review', 'reviews');
  return counts.held > 0
    ? `This week: ${reviews}, ${counts.held} held.`
    : `This week: ${reviews}.`;
}
