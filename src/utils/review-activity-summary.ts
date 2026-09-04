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

import { parseScriptureReference } from '@/utils/scripture-detector';

export interface ReviewAnswerRecord {
  /** ISO timestamp of the answer. */
  at: string;
  /** Recalled cleanly. "Almost" and "read again" are answers too, but they are not holds. */
  held: boolean;
  /** What was asked about, by name. A reference or a note's title; never an id. */
  label?: string | null;
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

/** The answers themselves per local day, for anything that needs more than a count. */
export function reviewAnswersByDay(
  answers: readonly ReviewAnswerRecord[],
): Map<string, ReviewAnswerRecord[]> {
  const byDay = new Map<string, ReviewAnswerRecord[]>();
  for (const answer of answers) {
    const at = new Date(answer.at);
    if (Number.isNaN(at.getTime())) continue;
    const key = localDayKey(at);
    const list = byDay.get(key);
    if (list) list.push(answer);
    else byDay.set(key, [answer]);
  }
  return byDay;
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
export function reviewWeekAnswers(
  answers: readonly ReviewAnswerRecord[],
  now: Date = new Date(),
): ReviewAnswerRecord[] {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - (REVIEW_WEEK_DAYS - 1));
  return answers.filter((answer) => {
    const at = new Date(answer.at);
    return !Number.isNaN(at.getTime()) && at >= start;
  });
}

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
 * What the day's sentence says about coming back to things.
 *
 * It used to be two chips: "25 reviews" and "10 held". Both were wrong for the warmest line in
 * the app. A count says nothing about the study it is counting, and "held" was a word borrowed
 * from the recall state that means nothing to anyone reading it — the owner's question was
 * literally "what the heck does that mean". Whether an answer landed is what the verdict
 * colours and the dots now say, in the place where it matters.
 *
 * So the day names what you came back to instead, and the named thing is a chip like the
 * folder and the Thread beside it. The subject is the one answered most that day, ties broken
 * by the most recent — a day spent on one passage should name that passage.
 */
export interface ReviewDaySubjects {
  /** The subjects to name, most-answered first. At most two: a sentence, not a list. */
  named: string[];
  /** What is behind them, and what kind of thing they are. */
  rest: number;
  restKind: 'passages' | 'notes' | 'things';
  answered: number;
}

/** A label that parses as a reference is a passage; anything else is one of their notes. */
function subjectIsPassage(label: string): boolean {
  return parseScriptureReference(label) !== null;
}

export function reviewDaySubjects(answers: readonly ReviewAnswerRecord[]): ReviewDaySubjects {
  const counts = new Map<string, { n: number; last: number }>();
  for (const answer of answers) {
    const label = answer.label?.trim();
    if (!label) continue;
    const at = new Date(answer.at).getTime();
    const seen = counts.get(label);
    if (seen) {
      seen.n += 1;
      seen.last = Math.max(seen.last, Number.isNaN(at) ? 0 : at);
    } else {
      counts.set(label, { n: 1, last: Number.isNaN(at) ? 0 : at });
    }
  }
  /*
   * Most answered, then most recent. Nothing after that: a `Map` keeps insertion order, and a
   * stable sort leaves genuine ties in the order they were answered — which is at least a fact
   * about the day, where sorting them by name would be a fact about the alphabet.
   */
  const ranked = [...counts.entries()].sort((a, b) => b[1].n - a[1].n || b[1].last - a[1].last);
  const named = ranked.slice(0, 2).map(([label]) => label);
  const rest = ranked.slice(2).map(([label]) => label);
  const passages = rest.filter(subjectIsPassage).length;
  return {
    named,
    rest: rest.length,
    restKind: rest.length === 0 ? 'things' : passages === rest.length ? 'passages' : passages === 0 ? 'notes' : 'things',
    answered: answers.length,
  };
}

/**
 * "You came back to John 15:5 and Romans 1:7, and three more passages."
 *
 * Up to two named, because past that it is a list rather than a sentence — and what is left is
 * described by what it *is*. "Four others" was the first attempt and says nothing: a reader
 * cannot tell whether they spent the day in the Psalms or in their own notes.
 */
export function reviewDayRevisitedCopy(
  subjects: ReviewDaySubjects | null | undefined,
): { lead: string; named: string[]; tail: string } | null {
  if (!subjects?.named.length) return null;
  const rest =
    subjects.rest === 0
      ? ''
      : subjects.rest === 1
        ? `, and one more ${subjects.restKind === 'notes' ? 'note' : subjects.restKind === 'passages' ? 'passage' : 'thing'}`
        : `, and ${subjects.rest} more ${subjects.restKind}`;
  return { lead: 'You came back to', named: subjects.named, tail: `${rest}` };
}

/**
 * The week, under the fold of an expanded Review section.
 *
 * Subject-led, like the day's line above it. "This week: 39 reviews, 14 held." was the same
 * two mistakes twice — a tally of a spiritual practice, and a word ("held") that only means
 * something if you have read the code. What is worth saying about a week is what it was spent
 * on, and a week with nothing named says nothing at all: this sits under a fold, where silence
 * costs nothing.
 */
export function reviewWeekCaption(answers: readonly ReviewAnswerRecord[]): string | null {
  const subjects = reviewDaySubjects(answers);
  if (!subjects.named) return null;
  return subjects.others === 0
    ? `This week you kept coming back to ${subjects.named}.`
    : `This week you kept coming back to ${subjects.named}, among others.`;
}
