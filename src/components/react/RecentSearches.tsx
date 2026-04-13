import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { safeNavigate } from '@/utils/safe-navigate';
import {
  recentSearchStorageKey,
  recentSearchesUpdatedEvent,
  type RecentSearchStorageScope,
} from '@/utils/recent-search-storage';
import { MIN_SEARCH_QUERY_LENGTH } from '@/utils/search-query';
import RecentSearchRow from './RecentSearchRow';

interface RecentSearch {
  term: string;
  count: number;
}

interface RecentSearchesProps {
  /** Called when user hovers a recent search; use to prefetch so click shows results instantly. */
  onPrefetchSearch?: (term: string) => void;
  /** Per-thread / per-space / add-tab storage; omit for global Find. */
  storageScope?: Exclude<RecentSearchStorageScope, null>;
  /** When set (scoped search), apply the term on the current page instead of opening `/search`. */
  onSelectRecentTerm?: (term: string) => void;
}

const RecentSearches: React.FC<RecentSearchesProps> = ({
  onPrefetchSearch,
  storageScope,
  onSelectRecentTerm,
}) => {
  const storageKey = useMemo(
    () => recentSearchStorageKey(storageScope ?? null),
    [storageScope?.type, storageScope?.id],
  );
  const updateEventName = useMemo(
    () => recentSearchesUpdatedEvent(storageScope ?? null),
    [storageScope?.type, storageScope?.id],
  );
  // Always start with empty array to avoid hydration mismatch
  // Will be populated from localStorage in useEffect after mount
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);

  const updateRecentSearches = useCallback(() => {
    if (typeof window === 'undefined') return;

    const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
    // Handle both old format (strings) and new format (objects)
    const searches = stored
      .map((item: any) => {
        if (typeof item === 'string') {
          return { term: item, count: 0 };
        }
        return item;
      })
      .filter((item: RecentSearch) => item.term.trim().length >= MIN_SEARCH_QUERY_LENGTH)
      .slice(0, 5);

    if (searches.length !== stored.length) {
      localStorage.setItem(storageKey, JSON.stringify(searches));
    }

    setRecentSearches(searches);
  }, [storageKey]);

  const removeFromRecentSearches = useCallback((searchTerm: string) => {
    if (typeof window === 'undefined') return;

    const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');

    const updatedSearches = stored.filter((search: any) => {
      // Handle both old format (strings) and new format (objects)
      const term = typeof search === 'string' ? search : search.term;
      return term !== searchTerm;
    });

    localStorage.setItem(storageKey, JSON.stringify(updatedSearches));

    // Update state directly with the filtered results
    const formattedSearches = updatedSearches
      .map((item: any) => {
        if (typeof item === 'string') {
          return { term: item, count: 0 };
        }
        return item;
      })
      .slice(0, 5);

    setRecentSearches(formattedSearches);

    window.dispatchEvent(new CustomEvent(updateEventName));
  }, [storageKey, updateEventName]);

  // Update recent searches on mount and listen for updates
  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined') return;

    // Load from localStorage on mount
    updateRecentSearches();

    // Listen for updates when items are removed or counts are updated
    const handleUpdate = () => {
      updateRecentSearches();
    };

    window.addEventListener(updateEventName, handleUpdate);

    return () => {
      window.removeEventListener(updateEventName, handleUpdate);
    };
  }, [updateRecentSearches, updateEventName]);

  if (recentSearches.length === 0) {
    return null;
  }

  return (
    <div className="flex-stack">
      <div className="flex-stack">
        {recentSearches.map((search) => (
          <div key={search.term} className="recent-search-item">
            <RecentSearchRow
              term={search.term}
              count={search.count}
              onPrefetchSearch={onPrefetchSearch}
              onRemove={() => removeFromRecentSearches(search.term)}
              variant="list"
              onPrimaryAction={() => {
                if (onSelectRecentTerm) {
                  onSelectRecentTerm(search.term);
                  return;
                }
                safeNavigate(`/search?q=${encodeURIComponent(search.term)}`, { history: 'replace' });
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default RecentSearches;
