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

/** Append a term (MRU, max 10). Dispatches the matching update event. */
export function addRecentSearchTerm(scope: RecentSearchStorageScope, term: string): void {
  if (typeof window === 'undefined') return;
  const trimmed = term.trim();
  if (!trimmed) return;

  const key = recentSearchStorageKey(scope);
  const recentSearches = JSON.parse(localStorage.getItem(key) || '[]');
  const newSearchItem = { term: trimmed, count: 0 };
  const filtered = recentSearches.filter((s: { term?: string } | string) => {
    const t = typeof s === 'string' ? s : s.term;
    return t !== trimmed;
  });
  const newSearches = [newSearchItem, ...filtered].slice(0, 10);
  localStorage.setItem(key, JSON.stringify(newSearches));
  window.dispatchEvent(new CustomEvent(recentSearchesUpdatedEvent(scope)));
}
