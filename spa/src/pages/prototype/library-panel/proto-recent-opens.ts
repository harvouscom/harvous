/**
 * What you last opened out of the Library panel, so the panel can offer it back.
 *
 * ## Why this is not derived from what already exists
 *
 * `library-all-items.ts` looks like the answer and is not. It orders by `updatedAt` /
 * `createdAt`, which is *recently changed*, and its own docblock is careful that recency
 * there must not lie. A note you read this morning and did not edit has no new timestamp, so
 * it never appears — and a note you have not opened in a year appears the moment something
 * touches it. "Resume what you were doing" is a different question from "what changed".
 *
 * `NoteVisitEvents` is the honest cross-device answer and is deliberately not used here. It
 * covers notes only (this list also holds highlights and resources), it is not space-scoped,
 * and reading it means a network round trip on the panel-open path — which is the one path
 * that has to feel instant. Merging it in later is a reasonable improvement; starting there
 * would trade the whole feature's latency for a completeness nobody asked for.
 *
 * Storage shape and the subscribe notifier follow `proto-pinned-stores.ts`, including its
 * reason for existing: more than one surface can show this list, and they must not disagree.
 */

export type RecentOpenKind = 'note' | 'highlight' | 'resource';

/** One opened thing. Ordering in the stored array *is* the recency; there is no timestamp. */
export type RecentOpenEntry = { kind: RecentOpenKind; sourceId: string };

const KEY_PREFIX = 'harvous.prototype.recentOpens.';

/**
 * Long enough that a few unresolvable entries (a deleted note, a resource from another
 * space) still leave a full list behind them, short enough that it stays a tail and not an
 * archive. Callers ask for far fewer than this.
 */
const MAX_ENTRIES = 20;

const VALID_KINDS: readonly RecentOpenKind[] = ['note', 'highlight', 'resource'];

function keyFor(spaceId: string): string {
  return `${KEY_PREFIX}${spaceId}`;
}

function safeRead(spaceId: string): RecentOpenEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(keyFor(spaceId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is RecentOpenEntry =>
        Boolean(entry) &&
        typeof entry === 'object' &&
        typeof entry.sourceId === 'string' &&
        entry.sourceId.length > 0 &&
        VALID_KINDS.includes(entry.kind),
    );
  } catch {
    return [];
  }
}

const listeners = new Set<() => void>();

/** Notified after any write, so a mounted list can re-read. Shaped for `useSyncExternalStore`. */
export function subscribeRecentOpens(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function safeWrite(spaceId: string, entries: RecentOpenEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(keyFor(spaceId), JSON.stringify(entries));
  } catch {
    // quota, private mode, storage disabled
  }
  /* Announced even on a failed write, matching `proto-pinned-stores`: the answer a reader
     computes is the same either way. */
  listeners.forEach((listener) => listener());
}

/** Move a thing to the front of the list, or add it. */
export function recordRecentOpen(
  spaceId: string | null | undefined,
  kind: RecentOpenKind,
  sourceId: string | null | undefined,
): void {
  const space = spaceId?.trim();
  const id = sourceId?.trim();
  if (!space || !id) return;

  const existing = safeRead(space).filter(
    (entry) => !(entry.kind === kind && entry.sourceId === id),
  );
  safeWrite(space, [{ kind, sourceId: id }, ...existing].slice(0, MAX_ENTRIES));
}

export function readRecentOpens(
  spaceId: string | null | undefined,
  limit = MAX_ENTRIES,
): RecentOpenEntry[] {
  const space = spaceId?.trim();
  if (!space) return [];
  return safeRead(space).slice(0, limit);
}

/**
 * Forget the list for one space.
 *
 * The key is removed rather than written empty, so clearing leaves nothing behind that says
 * a list was ever kept — same reasoning as `clearRecentSearches`.
 */
export function clearRecentOpens(spaceId: string | null | undefined): void {
  const space = spaceId?.trim();
  if (!space || typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(keyFor(space));
  } catch {
    // storage disabled — there was nothing stored to clear
  }
  listeners.forEach((listener) => listener());
}

/** Every space's list. For the settings control, which clears history everywhere. */
export function clearAllRecentOpens(): void {
  if (typeof window === 'undefined') return;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(KEY_PREFIX)) doomed.push(key);
    }
    doomed.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // storage disabled
  }
  listeners.forEach((listener) => listener());
}
