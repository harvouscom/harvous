/**
 * Whether the Suggested shelf has something you have not looked at yet.
 *
 * The obvious signal — "the current opportunities include ids you have not been shown" —
 * is not available where the indicator has to live. `PrototypeSidebarHomeView` is the only
 * thing that assembles the deck, and it is unmounted whenever the sidebar is showing a list
 * or a thread, which is exactly when you would want to be told. Computing the deck anywhere
 * else means running its dozen queries all the time to answer a question about a dot.
 *
 * So the question is asked at the resolution the deck actually changes at: the day. The set is
 * rotated by `dayIndex` (see `selectRecallOpportunities`) and cooldowns expire on day
 * boundaries, so a new day is a genuinely different shelf — and "you have not looked at
 * today's suggestions" is both true and the thing worth saying. It says nothing about material
 * that appears mid-afternoon, which is the honest limit of a cheap answer.
 *
 * Only days when the shelf actually had something are remembered, so a new account with no
 * suggestions yet is never sent to look at an empty panel.
 */

const KEY_PREFIX = 'harvous.prototype.recallShelfSeen.';
const SEEN_CHANGED_EVENT = 'harvous:recall-shelf-seen-changed';

function key(spaceId: string): string {
  return `${KEY_PREFIX}${spaceId}`;
}

/** The last day the shelf was seen holding at least one suggestion, or null. */
export function recallShelfSeenDay(spaceId: string | undefined | null): number | null {
  if (!spaceId || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key(spaceId));
    if (!raw) return null;
    const day = Number.parseInt(raw, 10);
    return Number.isFinite(day) ? day : null;
  } catch {
    return null;
  }
}

/**
 * Record that the shelf has been seen today. Call only when it actually had something on it —
 * marking an empty shelf as seen would suppress the dot for a day that never showed anything.
 */
export function markRecallShelfSeen(spaceId: string | undefined | null, dayIndex: number): void {
  if (!spaceId || typeof window === 'undefined') return;
  if (recallShelfSeenDay(spaceId) === dayIndex) return;
  try {
    window.localStorage.setItem(key(spaceId), String(dayIndex));
  } catch {
    // storage disabled — the dot simply stays on, which is the harmless direction
    return;
  }
  notifyRecallShelfSeenChanged();
}

/**
 * Whether to mark the way back to Home.
 *
 * False before the shelf has ever had anything: there is nothing to promise yet, and a dot
 * leading to an empty panel teaches people to ignore dots.
 */
export function recallShelfHasUnseen(
  spaceId: string | undefined | null,
  todayDayIndex: number,
): boolean {
  const seen = recallShelfSeenDay(spaceId);
  if (seen == null) return false;
  return seen !== todayDayIndex;
}

export function notifyRecallShelfSeenChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(SEEN_CHANGED_EVENT));
}

export function subscribeRecallShelfSeenChanged(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(SEEN_CHANGED_EVENT, onChange);
  return () => window.removeEventListener(SEEN_CHANGED_EVENT, onChange);
}
