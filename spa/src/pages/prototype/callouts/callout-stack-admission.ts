/**
 * How many of the due cards the stack may hold, and which.
 *
 * Everything that wants the corner — the legal notice, a feature callout, What's new, Import,
 * the founder's letter — can be due at once, and four cards in a stack is a to-do list, not a
 * hello. So:
 *
 * - **Two at most.** The rest wait, in order, behind them.
 * - **No refilling straight away.** A card that has never been on screen may only join once a
 *   day has passed since the last one was put away — the picker's quiet period, applied to the
 *   whole stack. Without it, dismissing one card would slide the next in at once and the stack
 *   would read as a queue.
 *
 * Cards already on screen keep their place, through the quiet period and after it: putting one
 * away must not also take away the one beside it, and a newer card never pushes one off.
 */
import { CALLOUT_QUIET_MS } from './callout-registry';

export const CALLOUT_STACK_MAX = 2;

export function admitStackItems<T extends { id: string }>(
  items: readonly T[],
  {
    shownIds,
    lastDismissedAt,
    now,
    max = CALLOUT_STACK_MAX,
  }: {
    /** Ids that have been on screen before, on this device. */
    shownIds: ReadonlySet<string>;
    /** When any card was last put away, as ms (`-Infinity` if never). */
    lastDismissedAt: number;
    now: number;
    max?: number;
  },
): T[] {
  const quiet = now - lastDismissedAt < CALLOUT_QUIET_MS;
  /* Cards already on screen first, so a newcomer never pushes one off; then newcomers, outside
     the quiet day, into whatever room is left. Shown in the original order either way. */
  const keep = new Set<T>();
  for (const item of items) {
    if (keep.size >= max) break;
    if (shownIds.has(item.id)) keep.add(item);
  }
  if (!quiet) {
    for (const item of items) {
      if (keep.size >= max) break;
      keep.add(item);
    }
  }
  return items.filter((item) => keep.has(item));
}

const SHOWN_KEY = 'harvous-callout-stack-shown';

export function readShownIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SHOWN_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

/** Remember these as having been on screen. Bounded, since ids only ever accumulate. */
export function rememberShownIds(ids: readonly string[]): void {
  const known = readShownIds();
  let changed = false;
  for (const id of ids) {
    if (!known.has(id)) {
      known.add(id);
      changed = true;
    }
  }
  if (!changed) return;
  try {
    localStorage.setItem(SHOWN_KEY, JSON.stringify([...known].slice(-50)));
  } catch {
    /* ignore — without it a waiting card simply waits for the quiet period */
  }
}
