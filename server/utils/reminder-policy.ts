/**
 * Whether to actually send, given what happened to the last several reminders.
 *
 * The schedule says when a reminder is *due*. This says whether it has earned the right to
 * arrive. Two nudges a week is already restrained, but restraint set once at design time is
 * not restraint — the app that keeps sending into silence is the app people turn off, and
 * the one they turn off is the one that never reaches them again. So the frequency answers
 * to evidence: ignored twice and it halves, ignored four times and it stops and says so.
 *
 * Deliberately a pure function over a small window of deliveries. Every rule here is one a
 * person could be told in a sentence ("we paused these because they weren't being opened"),
 * which rules out anything that learns in a way we could not explain back to them.
 *
 * What each outcome means:
 *   clicked    — tapped the banner. The strongest yes.
 *   opened     — didn't tap, but opened the app within six hours. Still a yes: the nudge worked.
 *   dismissed  — swiped it away. A weak no; Safari and iOS report this unevenly, so it never
 *                pauses anything on its own.
 *   ignored    — nothing at all within a day. The signal that actually counts against us.
 */
import type { ReminderSettings } from '@/utils/reminder-settings';
import type { ReminderVariant } from './reminder-payload';

export type ReminderOutcome = 'clicked' | 'dismissed' | 'opened' | 'ignored' | null;
export type ReminderPolicyKind = 'sunday' | 'midweek';

export interface DeliveryRecord {
  kind: string;
  variant: string;
  outcome: ReminderOutcome;
  sentAt: Date;
}

/** How many past deliveries the rules look at. Eight is about a month of two-a-week. */
export const POLICY_WINDOW = 8;
/** Ignored this many times in a row and the next one is skipped. */
const BACKOFF_AFTER_IGNORED = 2;
/** Ignored this many times in a row and the kind stops until re-armed. */
const PAUSE_AFTER_IGNORED = 4;
/** Distinct days the user must come back on their own before a paused kind returns. */
export const REARM_DISTINCT_DAYS = 3;
/** A variant needs this many sends before its rate is worth acting on. */
const VARIANT_MIN_SENDS = 3;

export interface PolicyDecision {
  send: boolean;
  /** Short, loggable, and the same string the admin summary groups by. */
  reason:
    | 'ok'
    | 'paused-by-policy'
    | 'backoff-skip'
    | 'kind-off';
  variant: ReminderVariant | null;
}

const POSITIVE = new Set<ReminderOutcome>(['clicked', 'opened']);

function isPositive(outcome: ReminderOutcome): boolean {
  return POSITIVE.has(outcome);
}

/** Deliveries for one kind, newest first, tests excluded. */
function windowFor(deliveries: readonly DeliveryRecord[], kind: ReminderPolicyKind): DeliveryRecord[] {
  return deliveries
    .filter((d) => d.kind === kind)
    .slice()
    .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())
    .slice(0, POLICY_WINDOW);
}

/**
 * How many reminders in a row went unanswered, counting back from the most recent.
 *
 * A still-open delivery (`outcome: null`) stops the count rather than continuing it: it has
 * not been ignored yet, only not answered *so far*, and treating "sent an hour ago" as a
 * strike would let a single quiet morning pause someone who is simply asleep.
 */
export function consecutiveIgnored(window: readonly DeliveryRecord[]): number {
  let count = 0;
  for (const delivery of window) {
    if (delivery.outcome === 'ignored') {
      count += 1;
      continue;
    }
    // A dismissal is a soft no — it neither extends a silent streak nor resets it.
    if (delivery.outcome === 'dismissed') continue;
    break;
  }
  return count;
}

/** Any yes at all inside the window resets every streak. One tap buys back the schedule. */
export function hasRecentPositive(window: readonly DeliveryRecord[]): boolean {
  return window.some((d) => isPositive(d.outcome));
}

/**
 * The variant to send: the one this reader answers more often, once there is enough to say.
 *
 * Counts rather than a bandit. With two candidates and a handful of sends per person per
 * month, anything cleverer would be fitting noise, and this can be explained in the one
 * sentence the settings page has room for.
 */
export function preferredVariant(
  deliveries: readonly DeliveryRecord[],
): ReminderVariant | null {
  const stats = new Map<string, { sent: number; positive: number }>();
  for (const delivery of deliveries) {
    if (delivery.kind === 'test') continue;
    const entry = stats.get(delivery.variant) ?? { sent: 0, positive: 0 };
    entry.sent += 1;
    if (isPositive(delivery.outcome)) entry.positive += 1;
    stats.set(delivery.variant, entry);
  }

  const eligible = [...stats.entries()]
    .filter(([variant, s]) => s.sent >= VARIANT_MIN_SENDS && (variant === 'verse' || variant === 'pickup'))
    .map(([variant, s]) => ({ variant: variant as ReminderVariant, rate: s.positive / s.sent }));
  if (eligible.length < 2) return null;

  eligible.sort((a, b) => b.rate - a.rate);
  const [best, next] = eligible;
  if (!best || !next) return null;
  // A clear margin, not a hair's breadth: two variants within ten points are the same variant
  // as far as this reader is concerned, and flip-flopping the copy would only add noise.
  return best.rate - next.rate >= 0.1 ? best.variant : null;
}

/**
 * The decision for one due reminder.
 *
 * `settings.pausedByPolicy` is checked first and separately from the streak rules: once a
 * pause is written, it is the user's switch to clear, not something the next quiet week can
 * re-decide. Re-arming lives in `shouldRearm` below, driven by the reader coming back on
 * their own.
 */
export function decideReminder(
  settings: ReminderSettings,
  kind: ReminderPolicyKind,
  deliveries: readonly DeliveryRecord[],
): PolicyDecision {
  if (kind === 'sunday' && !settings.sunday) return { send: false, reason: 'kind-off', variant: null };
  if (kind === 'midweek' && !settings.midweek) return { send: false, reason: 'kind-off', variant: null };

  const paused = settings.pausedByPolicy;
  if (paused && (paused.kind === 'all' || paused.kind === kind)) {
    return { send: false, reason: 'paused-by-policy', variant: null };
  }

  const window = windowFor(deliveries, kind);
  if (hasRecentPositive(window)) {
    return { send: true, reason: 'ok', variant: preferredVariant(deliveries) };
  }

  const ignored = consecutiveIgnored(window);
  if (ignored >= PAUSE_AFTER_IGNORED) {
    // The caller writes the pause; this only refuses the send. Keeping the write out of a
    // pure function is what lets the dry run report a pause without causing one.
    return { send: false, reason: 'paused-by-policy', variant: null };
  }
  if (ignored >= BACKOFF_AFTER_IGNORED && ignored % 2 === 0) {
    // Halve rather than stop: skip this one, allow the next. Someone who has ignored two in a
    // row may simply have had two busy weeks, and a month of silence from us is a worse answer
    // to that than every other week.
    return { send: false, reason: 'backoff-skip', variant: null };
  }

  return { send: true, reason: 'ok', variant: preferredVariant(deliveries) };
}

/** Whether a decision means the kind should now be written as paused. */
export function shouldWritePause(
  settings: ReminderSettings,
  kind: ReminderPolicyKind,
  deliveries: readonly DeliveryRecord[],
): boolean {
  if (settings.pausedByPolicy) return false;
  return consecutiveIgnored(windowFor(deliveries, kind)) >= PAUSE_AFTER_IGNORED;
}

/**
 * Whether a paused account has earned its reminders back.
 *
 * The test is that the person came back *without* being asked, on three separate days since
 * the pause. Opening the app once could be a stray tap on a home screen; three days is a
 * habit re-forming, which is the only thing that makes a nudge welcome again.
 */
export function shouldRearm(
  settings: ReminderSettings,
  distinctActiveDaysSincePause: number,
): boolean {
  if (!settings.pausedByPolicy) return false;
  return distinctActiveDaysSincePause >= REARM_DISTINCT_DAYS;
}

/** "Opened 3 of the last 5" — the one line the settings page shows about all this. */
export function summarizeRecentDeliveries(deliveries: readonly DeliveryRecord[]): string | null {
  const settled = deliveries.filter((d) => d.kind !== 'test' && d.outcome !== null);
  if (settled.length === 0) return null;
  const recent = settled
    .slice()
    .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())
    .slice(0, POLICY_WINDOW);
  const opened = recent.filter((d) => isPositive(d.outcome)).length;
  return `Opened ${opened} of the last ${recent.length}`;
}
