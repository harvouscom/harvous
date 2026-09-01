/**
 * When a review item comes back, and why that number.
 *
 * The whole schedule is three constants and one multiplier, and that is a product decision
 * rather than a simplification. The strategy doc asks for transparent rules over an opaque
 * adaptive system, because a reader who can predict when something returns can trust it; one
 * facing a black box either over-trusts it or fights it. Every value here can be said in a
 * sentence in the UI: "back in two weeks".
 *
 * This is deliberately NOT the FSRS-style curve in `note-recall-state.ts`. That one models
 * passive resurfacing, where nobody answered anything and stability has to be inferred from a
 * card being opened. Here the reader tells us directly how it went, so the schedule can be
 * arithmetic instead of a model — and the two systems stay independent, which is why a
 * successful recall also calls `recordNoteRecallEngaged` rather than replacing it.
 */

import {
  type RecallState,
  type ReviewOutcome,
} from './review-item-kinds';

/**
 * The three base intervals.
 *
 * 1 / 4 / 14 comes from the strategy doc, and the shape matters more than the numbers: a
 * revealed item returns tomorrow because nothing was retrieved, an "almost" returns inside
 * the week while the trace is still warm, and a clean recall gets a fortnight. The gaps
 * widen fast on purpose — spacing that grows slowly is just a daily queue with extra steps.
 */
export const REVIEW_INTERVAL_DAYS: Record<ReviewOutcome, number> = {
  revealed: 1,
  almost: 4,
  recalled: 14,
};

/**
 * Consecutive recalls before the interval starts compounding.
 *
 * Three, not one, because a single success is as likely to mean "I happened to have read
 * this yesterday" as "I know this". Compounding from the first correct answer sends things
 * months away on the strength of one lucky morning, and the reader has no way to pull them
 * back except by hunting through a list.
 */
export const STREAK_MULTIPLIER_FROM = 3;

/** Gentler than SM-2's ~2.5. This is study, not a cram schedule; drifting late costs little. */
export const STREAK_MULTIPLIER = 1.8;

/**
 * Six months, and then it stops growing.
 *
 * An uncapped multiplier reaches "in four years", which is indistinguishable from deleting
 * the item while looking like the app still has it. Something you have held for half a year
 * is worth one more look at half a year.
 */
export const MAX_REVIEW_INTERVAL_DAYS = 180;

/** A deferral is a day, not a snooze ladder — "not now" means today, not this month. */
export const REVIEW_DEFER_DAYS = 1;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * MS_PER_DAY);
}

export interface ReviewScheduleState {
  intervalDays: number;
  successStreak: number;
  reviewCount: number;
  lastOutcome?: ReviewOutcome | null;
}

export interface ReviewScheduleResult {
  intervalDays: number;
  dueAt: Date;
  successStreak: number;
  reviewCount: number;
  recallState: RecallState;
  lastOutcome: ReviewOutcome;
}

/**
 * How well the reader currently holds this item.
 *
 * Derived from the answers rather than stored as an independent fact, so it can never drift
 * from them — the column on ReviewItems is a cache of this function, written on every
 * outcome. `fragile` covers both "never got it" and "just lost it", which is why a single
 * miss drops a durable item all the way back: the useful signal is that the memory failed
 * today, not how it was doing last month.
 */
export function deriveRecallState(state: {
  reviewCount: number;
  successStreak: number;
  lastOutcome?: ReviewOutcome | null;
}): RecallState {
  if (state.reviewCount <= 0) return 'new';
  if (state.successStreak <= 0) return 'fragile';
  if (state.successStreak < STREAK_MULTIPLIER_FROM) return 'forming';
  return 'durable';
}

/**
 * The next interval for an answered item.
 *
 * Compounding multiplies the *previous* interval once the streak is long enough, floored at
 * the 14-day base — so an item recalled at 30 days goes to 54 rather than back down to 14,
 * while one recalled early cannot compound below the base and start racing away.
 */
export function nextReviewAfter(
  outcome: ReviewOutcome,
  state: ReviewScheduleState,
  now: Date = new Date(),
): ReviewScheduleResult {
  const reviewCount = Math.max(0, state.reviewCount) + 1;
  const base = REVIEW_INTERVAL_DAYS[outcome];

  if (outcome !== 'recalled') {
    return {
      intervalDays: base,
      dueAt: addDays(now, base),
      // Any answer short of a clean recall ends the streak. Half-remembering is not progress
      // toward compounding — it is the signal that the last interval was already too long.
      successStreak: 0,
      reviewCount,
      recallState: deriveRecallState({ reviewCount, successStreak: 0, lastOutcome: outcome }),
      lastOutcome: outcome,
    };
  }

  const successStreak = Math.max(0, state.successStreak) + 1;
  const previous = Number.isFinite(state.intervalDays) && state.intervalDays > 0
    ? state.intervalDays
    : base;
  const grown = successStreak >= STREAK_MULTIPLIER_FROM
    ? Math.max(base, previous) * STREAK_MULTIPLIER
    : base;
  const intervalDays = Math.min(MAX_REVIEW_INTERVAL_DAYS, Math.round(grown * 10) / 10);

  return {
    intervalDays,
    dueAt: addDays(now, intervalDays),
    successStreak,
    reviewCount,
    recallState: deriveRecallState({ reviewCount, successStreak, lastOutcome: outcome }),
    lastOutcome: outcome,
  };
}

/**
 * "Not now" — tomorrow, and nothing else changes.
 *
 * Deliberately not an outcome: the reader did not answer, so the streak, the interval and the
 * recall state all stay exactly where they were. Deferring is about the moment, and a system
 * that punished a busy morning by shortening every future interval would teach people to
 * clear the queue rather than to study.
 */
export function deferReview(
  state: { dueAt: Date },
  now: Date = new Date(),
): { dueAt: Date } {
  const from = state.dueAt.getTime() > now.getTime() ? state.dueAt : now;
  return { dueAt: addDays(from, REVIEW_DEFER_DAYS) };
}

/**
 * The first due date for a brand-new item.
 *
 * Tomorrow rather than immediately: an item added while looking at the note would otherwise
 * ask about the note still open on screen, which teaches the reader that Review is a trick
 * question. A night's sleep is the shortest gap at which recall means anything.
 */
export function firstDueAt(now: Date = new Date()): Date {
  return addDays(now, 1);
}

/** Human phrasing for the next return, for the one line the session shows after an answer. */
export function describeNextReturn(intervalDays: number): string {
  if (intervalDays <= 1) return 'Back tomorrow';
  if (intervalDays < 7) return `Back in ${Math.round(intervalDays)} days`;
  if (intervalDays < 14) return 'Back in a week';
  if (intervalDays < 28) return `Back in ${Math.round(intervalDays / 7)} weeks`;
  if (intervalDays < 60) return 'Back in a month';
  return `Back in ${Math.round(intervalDays / 30)} months`;
}
