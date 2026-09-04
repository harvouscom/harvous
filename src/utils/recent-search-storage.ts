/**
 * Recent search terms for global Find vs per-thread / per-space scoped search tabs.
 * Global key stays `harvous-recent-searches` for backward compatibility.
 *
 * ## Why reading and removing live here now
 *
 * They used to live in the callers. `SpotlightSearch` hand-rolled a parse, a
 * string-or-object normalisation and a length filter; `RecentSearches` did it again. Two
 * copies of a normalisation is how one of them ends up tolerating a shape the other does
 * not, and the stored shape is genuinely two shapes — bare strings from before entries
 * carried a result count, objects since.
 *
 * ## Why every access is guarded
 *
 * `localStorage` throws rather than returning null in more cases than it looks: Safari's
 * private mode on older versions, a browser set to block site data, an embedded webview
 * with storage disabled. And `JSON.parse` throws on anything a half-finished write left
 * behind. This module is read during a render, so an unguarded throw here is a blank panel
 * rather than a missing list. The prototype's other stores already settled this — see
 * `safeRead`/`safeWrite` in `spa/src/pages/prototype/proto-pinned-stores.ts`; this file
 * predates that convention and was the last one still parsing bare.
 */

import { MIN_SEARCH_QUERY_LENGTH } from '@/utils/search-query';

/**
 * After a debounced search completes, wait this long with no new query before
 * recording the term in recents — avoids storing "ange", "angel" while the user is still typing "angels".
 */
export const RECENT_SEARCH_COMMIT_IDLE_MS = 650;

/** Most-recently-used cap. Older entries fall off the end. */
export const RECENT_SEARCH_MAX = 10;

export type RecentSearchStorageScope =
  | null
  | { type: 'thread' | 'space'; id: string }
  | { type: 'space-add'; id: string }
  | { type: 'thread-add'; id: string };

/** A stored term and the result count it last saw, for the badge. */
export type RecentSearchEntry = { term: string; count: number };

export function recentSearchStorageKey(scope: RecentSearchStorageScope): string {
  if (!scope) return 'harvous-recent-searches';
  return `harvous-recent-searches--${scope.type}--${scope.id}`;
}

export function recentSearchesUpdatedEvent(scope: RecentSearchStorageScope): string {
  if (!scope) return 'recent-searches-updated';
  return `recent-searches-updated:${scope.type}:${scope.id}`;
}

function entryTerm(s: { term?: string } | string): string {
  return typeof s === 'string' ? s : (s.term ?? '');
}

function entryCount(s: { term?: string; count?: number } | string): number {
  if (typeof s === 'string') return 0;
  return typeof s.count === 'number' ? s.count : 0;
}

type StoredEntry = { term?: string; count?: number } | string;

/**
 * The raw stored list, or an empty one.
 *
 * Anything that is not an array of usable entries is treated as absent rather than
 * repaired: a corrupt value is not worth reconstructing, and the next write replaces it.
 */
function safeReadRaw(key: string): StoredEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeWriteRaw(key: string, entries: RecentSearchEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(entries));
  } catch {
    // quota, private mode, storage disabled — the announce below still fires
  }
}

function announce(scope: RecentSearchStorageScope): void {
  if (typeof window === 'undefined') return;
  /* Dispatched even when the write failed, matching `proto-pinned-stores`: the answer a
     reader computes is the same either way, and staying silent would leave whichever
     surface did update out of step with the rest. */
  window.dispatchEvent(new CustomEvent(recentSearchesUpdatedEvent(scope)));
}

/**
 * The terms to show, newest first, already normalised to `{term, count}`.
 *
 * Entries below the length floor are filtered rather than deleted. They can only come from
 * a build that predates the floor, nothing can add one now, and a read that writes is a
 * surprise in a function called from a render.
 */
export function readRecentSearchTerms(
  scope: RecentSearchStorageScope,
  limit = RECENT_SEARCH_MAX,
): RecentSearchEntry[] {
  const entries = safeReadRaw(recentSearchStorageKey(scope));
  const out: RecentSearchEntry[] = [];
  for (const entry of entries) {
    const term = entryTerm(entry).trim();
    if (term.length < MIN_SEARCH_QUERY_LENGTH) continue;
    out.push({ term, count: entryCount(entry) });
    if (out.length >= limit) break;
  }
  return out;
}

export type AddRecentSearchOptions = {
  /** When set, stored as the result-count badge (e.g. number of FTS hits). */
  resultCount?: number;
};

/**
 * Append a term (MRU, max 10). Dispatches the matching update event.
 * Preserves an existing `count` for the same term unless `resultCount` is passed.
 */
export function addRecentSearchTerm(
  scope: RecentSearchStorageScope,
  term: string,
  options?: AddRecentSearchOptions,
): void {
  if (typeof window === 'undefined') return;
  const trimmed = term.trim();
  if (!trimmed || trimmed.length < MIN_SEARCH_QUERY_LENGTH) return;

  const key = recentSearchStorageKey(scope);
  const recentSearches = safeReadRaw(key);
  const prev = recentSearches.find((s) => entryTerm(s) === trimmed);
  const count =
    options && options.resultCount !== undefined ? options.resultCount : prev ? entryCount(prev) : 0;
  const newSearchItem: RecentSearchEntry = { term: trimmed, count };
  const filtered = recentSearches
    .filter((s) => entryTerm(s) !== trimmed)
    .map((s) => ({ term: entryTerm(s), count: entryCount(s) }));
  const newSearches = [newSearchItem, ...filtered].slice(0, RECENT_SEARCH_MAX);
  safeWriteRaw(key, newSearches);
  announce(scope);
}

/** Drop one term — the dismiss on a recent row. */
export function removeRecentSearchTerm(scope: RecentSearchStorageScope, term: string): void {
  if (typeof window === 'undefined') return;
  const trimmed = term.trim();
  if (!trimmed) return;

  const key = recentSearchStorageKey(scope);
  const remaining = safeReadRaw(key)
    .filter((s) => entryTerm(s) !== trimmed)
    .map((s) => ({ term: entryTerm(s), count: entryCount(s) }));
  safeWriteRaw(key, remaining);
  announce(scope);
}

/**
 * Forget every term in this scope.
 *
 * The key is removed rather than written as `[]`, so clearing history leaves nothing behind
 * that says a history was ever kept.
 */
export function clearRecentSearches(scope: RecentSearchStorageScope): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(recentSearchStorageKey(scope));
  } catch {
    // storage disabled — there was nothing stored to clear
  }
  announce(scope);
}

/**
 * Forget every scope's terms.
 *
 * For the settings control, which promises to clear the history rather than one corner of
 * it. Scoped keys are enumerated rather than tracked, because the set of spaces a person has
 * searched in is not written down anywhere else and a list that had to be maintained would
 * be the thing that eventually missed one.
 *
 * Announces on the global scope only. The per-space subscribers that exist are, by
 * definition, mounted inside a panel scoped to a space the reader is currently in, and that
 * panel re-reads on its next open.
 */
export function clearAllRecentSearches(): void {
  if (typeof window === 'undefined') return;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key === 'harvous-recent-searches' || key?.startsWith('harvous-recent-searches--')) {
        doomed.push(key);
      }
    }
    doomed.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // storage disabled — there was nothing stored to clear
  }
  announce(null);
}

/**
 * Re-run `callback` whenever this scope's list changes, in this tab.
 *
 * Shaped for `useSyncExternalStore`. The underlying channel is a window `CustomEvent` per
 * scope rather than one event carrying a scope, so a per-space list is not woken by writes
 * to a list it does not show.
 */
export function subscribeRecentSearches(
  scope: RecentSearchStorageScope,
  callback: () => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const name = recentSearchesUpdatedEvent(scope);
  window.addEventListener(name, callback);
  return () => window.removeEventListener(name, callback);
}
