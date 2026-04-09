/**
 * Recent search terms for global Find vs per-thread / per-space scoped search tabs.
 * Global key stays `harvous-recent-searches` for backward compatibility.
 */

export type RecentSearchStorageScope =
  | null
  | { type: 'thread' | 'space'; id: string }
  | { type: 'space-add'; id: string }
  | { type: 'thread-add'; id: string };

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
  if (!trimmed) return;

  const key = recentSearchStorageKey(scope);
  const recentSearches = JSON.parse(localStorage.getItem(key) || '[]') as Array<{ term?: string; count?: number } | string>;
  const prev = recentSearches.find((s) => entryTerm(s) === trimmed);
  const count =
    options && options.resultCount !== undefined ? options.resultCount : prev ? entryCount(prev) : 0;
  const newSearchItem = { term: trimmed, count };
  const filtered = recentSearches.filter((s) => entryTerm(s) !== trimmed);
  const newSearches = [newSearchItem, ...filtered].slice(0, 10);
  localStorage.setItem(key, JSON.stringify(newSearches));
  window.dispatchEvent(new CustomEvent(recentSearchesUpdatedEvent(scope)));
}
