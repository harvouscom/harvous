/**
 * Whether the getting-started checklist has already led Activity today.
 *
 * Deliberately *not* part of `OnboardingState`. Everything in that record is a monotonic
 * fact about the account — a step was done, the cluster was put away — merged across devices
 * by taking the larger value. "Has it led the page today" is neither monotonic nor a fact
 * about the account: it is a presentation detail of one device on one day, and pushing it
 * through the sync layer would mean a phone opened at breakfast decided where the checklist
 * sits on a laptop at lunch.
 *
 * So it lives in `localStorage`, keyed by the local day. Reading a missing or unparseable
 * value means "not yet today", which is the safe answer — the worst case is the checklist
 * leads twice, not that it silently stops appearing.
 */

const KEY = 'proto-onboarding-led-day';

/** The local calendar day, as `YYYY-MM-DD`. Local rather than UTC: a reader's day is theirs. */
export function onboardingDayKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** True the first time this is asked on a given day, false for the rest of it. */
export function onboardingHasLedToday(now: Date = new Date()): boolean {
  try {
    return localStorage.getItem(KEY) === onboardingDayKey(now);
  } catch {
    /* Private mode, or storage disabled. Treat as a fresh day. */
    return false;
  }
}

export function markOnboardingLedToday(now: Date = new Date()): void {
  try {
    localStorage.setItem(KEY, onboardingDayKey(now));
  } catch {
    /* Nothing to do — the checklist simply leads again next time. */
  }
}
