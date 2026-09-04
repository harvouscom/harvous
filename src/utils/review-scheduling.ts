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
  type ReviewItemKind,
  type ReviewItemOrigin,
  type ReviewOutcome,
} from './review-item-kinds';
import type { ReviewPromptKey } from './review-prompts';

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

/**
 * What a clean recall on each rung is worth, as a multiple of the 14-day base.
 *
 * Recognising a cue and naming a reference from a fragment are not the same feat and should
 * not buy the same fortnight. The numbers are a judgement, not a measurement: below 1 for the
 * rungs where the answer is on the screen in some form (a choice among four, three words of
 * a verse), above 1 where the reader produced the text or its address from nothing. Retune
 * the table, not the arithmetic.
 */
export const REVIEW_RUNG_WEIGHT: Record<ReviewPromptKey, number> = {
  'note.recognize': 0.9,
  'note.passage': 1.0,
  'note.connect': 1.0,
  'note.annotation': 1.0,
  'verse.recognize': 0.6,
  'verse.rebuild': 1.0,
  'verse.initials': 1.1,
  'verse.recall': 1.2,
  'verse.keywords': 0.7,
  'verse.next': 1.0,
  'verse.before': 0.9,
  'verse.connect': 0.9,
  'verse.theme': 0.9,
  'verse.person': 0.9,
  'verse.crossref': 1.1,
  'verse.sequence': 1.0,
  /*
   * A four-option tap, which the rule above puts below 1 — it was 1.2, joint-highest with
   * writing the verse out from nothing, because the rung's *name* reads harder than its
   * exercise is. What the reader does here is choose between four references on screen.
   */
  'verse.locate': 0.8,
  'verse.book': 0.7,
  'verse.altered': 1.1,
  /*
   * The chapter rungs. Picking a verse out of four openings and picking who appears are taps
   * with the answer on screen; finishing a verse from the chapter is produced text, and is the
   * one rung here that buys the full fortnight. Ordering three verses sits between: the words
   * are given, their order is not.
   */
  'chapter.verse': 0.7,
  'chapter.finish': 1.0,
  'chapter.order': 0.9,
  'chapter.person': 0.9,
};

/**
 * Lapses: losing something you held.
 *
 * A first-ever miss is learning; a miss on an item that was recalled the last time it was
 * asked is a lapse, and each one slows the interval's growth afterwards — an item that keeps
 * slipping should not keep racing away. `verse.theme` never lapses: its key is the index's
 * reading of the verse, not the reader's, and a disagreement with an editor is not forgetting.
 *
 * At four the item is a leech. Asking it a fifth time the same way is the definition of not
 * working, so the outcome says so and the reader is offered a step back down the ladder.
 */
export const REVIEW_LEECH_LAPSES = 4;
/** How much each lapse slows compounding: 15% per lapse, never below half speed. */
export const LAPSE_DAMPING_PER_LAPSE = 0.15;
export const LAPSE_DAMPING_FLOOR = 0.5;
export const NEVER_LAPSES: ReadonlySet<ReviewPromptKey> = new Set([
  'verse.theme',
  // The same reasoning: who the index says appears in a chapter is the index's reading.
  'chapter.person',
]);

export function lapseDamping(lapseCount: number): number {
  return Math.max(LAPSE_DAMPING_FLOOR, 1 - LAPSE_DAMPING_PER_LAPSE * Math.max(0, lapseCount));
}

/** Weight for a rung the scheduler was not told about: the base, unchanged. */
const DEFAULT_RUNG_WEIGHT = 1;

export function rungWeight(key: ReviewPromptKey | string | null | undefined): number {
  return (key && (REVIEW_RUNG_WEIGHT as Record<string, number>)[key]) || DEFAULT_RUNG_WEIGHT;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * MS_PER_DAY);
}

export interface ReviewScheduleState {
  intervalDays: number;
  successStreak: number;
  reviewCount: number;
  lastOutcome?: ReviewOutcome | null;
  /** Misses on something once held. Absent on rows from before the column existed. */
  lapseCount?: number;
  /** The rung that was actually answered — decides the weight, and whether a miss can lapse. */
  rungKey?: ReviewPromptKey | string | null;
}

export interface ReviewScheduleResult {
  intervalDays: number;
  dueAt: Date;
  successStreak: number;
  reviewCount: number;
  recallState: RecallState;
  lastOutcome: ReviewOutcome;
  lapseCount: number;
  /** This answer made it a leech, or it already was one and slipped again. */
  leech: boolean;
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
  lapseCount?: number;
}): RecallState {
  if (state.reviewCount <= 0) return 'new';
  // A leech reads as slipping until it is held again, or stepped back (which resets lapses).
  if ((state.lapseCount ?? 0) >= REVIEW_LEECH_LAPSES && state.successStreak < STREAK_MULTIPLIER_FROM) {
    return 'slipping';
  }
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
  const priorLapses = Math.max(0, state.lapseCount ?? 0);

  if (outcome !== 'recalled') {
    const base = REVIEW_INTERVAL_DAYS[outcome];
    // Losing something held the last time it was asked. "Almost" is not a lapse: something was
    // retrieved. And on the index-keyed rung, a miss is a disagreement, never forgetting.
    const lapsed =
      outcome === 'revealed' &&
      state.successStreak > 0 &&
      !NEVER_LAPSES.has(state.rungKey as ReviewPromptKey);
    const lapseCount = priorLapses + (lapsed ? 1 : 0);
    return {
      intervalDays: base,
      dueAt: addDays(now, base),
      // Any answer short of a clean recall ends the streak. Half-remembering is not progress
      // toward compounding — it is the signal that the last interval was already too long.
      successStreak: 0,
      reviewCount,
      recallState: deriveRecallState({ reviewCount, successStreak: 0, lastOutcome: outcome, lapseCount }),
      lastOutcome: outcome,
      lapseCount,
      leech: lapsed && lapseCount >= REVIEW_LEECH_LAPSES,
    };
  }

  // A clean recall earns the base scaled by the rung: recognising a cue is not the same feat as
  // naming the reference from a fragment, and should not buy the same fortnight.
  const base = REVIEW_INTERVAL_DAYS.recalled * rungWeight(state.rungKey);
  const successStreak = Math.max(0, state.successStreak) + 1;
  const previous = Number.isFinite(state.intervalDays) && state.intervalDays > 0
    ? state.intervalDays
    : base;
  // Every lapse on record slows compounding: an item that keeps slipping must not race away.
  const grown = successStreak >= STREAK_MULTIPLIER_FROM
    ? Math.max(base, previous) * STREAK_MULTIPLIER * lapseDamping(priorLapses)
    : base;
  const intervalDays = Math.min(MAX_REVIEW_INTERVAL_DAYS, Math.round(grown * 10) / 10);

  return {
    intervalDays,
    dueAt: addDays(now, intervalDays),
    successStreak,
    reviewCount,
    recallState: deriveRecallState({ reviewCount, successStreak, lastOutcome: outcome, lapseCount: priorLapses }),
    lastOutcome: outcome,
    lapseCount: priorLapses,
    leech: false,
  };
}

/**
 * The way down for a leech: one rung easier, lapses forgiven, the schedule otherwise untouched.
 *
 * Stepping back is the reader's call, offered once the item is slipping. The count resets
 * because the point is a fresh start on an easier ask, not the same ask with a warning
 * attached; the interval and streak stay, since the item is due tomorrow anyway.
 */
export function stepBackRung(state: { ladderStep: number; reviewCount: number; successStreak: number }): {
  ladderStep: number;
  lapseCount: number;
  recallState: RecallState;
} {
  const ladderStep = Math.max(0, Math.trunc(state.ladderStep) - 1);
  return {
    ladderStep,
    lapseCount: 0,
    recallState: deriveRecallState({ ...state, lapseCount: 0 }),
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
 * The first due date for a brand-new item, which depends on how it got there.
 *
 * An item the reader **added** waits a night. They added it while looking at the note, so
 * asking immediately would be asking about something still on screen — a trick question, and
 * the fastest way to teach someone the feature is not serious.
 *
 * An item the **engine** added is due at once, and so is a legacy seeded one. The reader did
 * not ask for it, so there is nothing on screen to read the answer off; and a section that
 * fills itself but shows nothing until tomorrow reads as a feature that does not work, which
 * is exactly what the seed did in the first preview.
 */
export function firstDueAt(now: Date = new Date(), origin: ReviewItemOrigin = 'user'): Date {
  // Seeded and engine-added items are due immediately: the reader did not ask for them, so a
  // section that stays empty until tomorrow reads as a feature that does not work.
  return origin === 'seed' || origin === 'engine' ? new Date(now.getTime()) : addDays(now, 1);
}

/**
 * The same, by kind — because a chapter is the one kind whose text may still be on screen.
 *
 * A chapter item exists because the reader just read that chapter, whoever added the row. Asking
 * about it the same day is asking about the page they have open, so a chapter always waits a
 * night, engine-added or not. Every other kind keeps the rule above.
 */
export function firstDueAtFor(
  kind: ReviewItemKind,
  origin: ReviewItemOrigin = 'user',
  now: Date = new Date(),
): Date {
  if (kind === 'chapter') return addDays(now, 1);
  return firstDueAt(now, origin);
}

/**
 * When the next scheduled thing comes back, for the line an empty queue shows.
 *
 * A weekday within the week and a date beyond it, because "in 5 days" makes the reader do
 * arithmetic to find out whether that is before or after Sunday. Rendered on the client for
 * the same reason `fillFraming` is: the weekday, the month name and the boundary between today
 * and tomorrow all belong to the reader's own zone and locale, and the server has neither.
 *
 * Null when the date has already passed — there is nothing to promise about something that is
 * due — or when it cannot be read.
 */
export function describeNextDue(iso: string | null | undefined, now: Date = new Date()): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (!Number.isFinite(at.getTime())) return null;
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(at) - startOf(now)) / MS_PER_DAY);
  if (at.getTime() <= now.getTime()) return null;
  if (days <= 0) return 'later today';
  if (days === 1) return 'tomorrow';
  if (days < 7) return `on ${at.toLocaleDateString(undefined, { weekday: 'long' })}`;
  const sameYear = at.getFullYear() === now.getFullYear();
  return `on ${at.toLocaleDateString(undefined, { day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }) })}`;
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
