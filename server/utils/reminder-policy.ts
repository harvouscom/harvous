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
export type ReminderPolicyKind = 'sunday' | 'midweek' | 'daily';

export interface DeliveryRecord {
  kind: string;
  variant: string;
  outcome: ReminderOutcome;
  sentAt: Date;
}

/**
 * The thresholds are counts, but what they are really measuring is elapsed silence.
 *
 * At two a week, pausing after four ignored means roughly a month of a reminder arriving and
 * nothing happening — long enough to be a fair conclusion about whether someone wants it.
 * Applied unchanged to a daily rhythm the same four would land in four days, so a long
 * weekend away would switch someone off before they had noticed they had it on.
 *
 * So daily gets its own, scaled to keep a pause meaning about the same thing in time rather
 * than in count: back off after five, stop after ten, which is a fortnight of being ignored.
 *
 * The window has to scale with them, and forgetting that made the first version of this
 * silently wrong: `windowFor` truncates to the window before anything is counted, so a
 * 10-deep threshold read through an 8-deep window could never be reached, and a daily
 * reminder would have gone on backing off forever instead of ever pausing. A window is only
 * meaningful as "far enough back to see the threshold".
 */
const THRESHOLDS: Record<ReminderPolicyKind, { backoff: number; pause: number; window: number }> = {
  sunday: { backoff: 2, pause: 4, window: 8 },
  midweek: { backoff: 2, pause: 4, window: 8 },
  daily: { backoff: 5, pause: 10, window: 14 },
};

/**
 * The deepest any rule looks back, which is what a caller must load to answer them all.
 * Kept as the maximum rather than a separate number so it cannot fall behind the table above.
 */
export const POLICY_WINDOW = Math.max(...Object.values(THRESHOLDS).map((t) => t.window));
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
    .slice(0, THRESHOLDS[kind].window);
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
  // A daily rhythm has no per-day switch — choosing it is the switch — so only the
  // twice-weekly days can be individually off.
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

  const { backoff: backoffAfter, pause: pauseAfter } = THRESHOLDS[kind];
  const ignored = consecutiveIgnored(window);
  if (ignored >= pauseAfter) {
    // The caller writes the pause; this only refuses the send. Keeping the write out of a
    // pure function is what lets the dry run report a pause without causing one.
    return { send: false, reason: 'paused-by-policy', variant: null };
  }
  if (ignored >= backoffAfter && ignored % 2 === 0) {
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
  return consecutiveIgnored(windowFor(deliveries, kind)) >= THRESHOLDS[kind].pause;
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
