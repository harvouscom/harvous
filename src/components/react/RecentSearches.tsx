import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { safeNavigate } from '@/utils/safe-navigate';
import { formatBadgeCount } from '@/utils/badge-count';
import {
  recentSearchStorageKey,
  recentSearchesUpdatedEvent,
  type RecentSearchStorageScope,
} from '@/utils/recent-search-storage';
import { MIN_SEARCH_QUERY_LENGTH } from '@/utils/search-query';

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
    const formattedSearches = updatedSearches.map((item: any) => {
      if (typeof item === 'string') {
        return { term: item, count: 0 };
      }
      return item;
    }).slice(0, 5);
    
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
            <div
              className="relative nav-item-container rounded-2xl px-4 flex flex-row items-center recent-search-row"
              style={{ background: 'var(--color-gradient-gray)', boxShadow: 'var(--shadow-small)' }}
            >
              <button
                type="button"
                className="flex flex-row flex-fill items-center text-left cursor-pointer transition-[scale,shadow] duration-300 min-w-0"
                style={{ color: 'var(--color-deep-grey)' }}
                onMouseEnter={() => onPrefetchSearch?.(search.term)}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('.recent-search-close-icon')) return;
                  if (onSelectRecentTerm) {
                    onSelectRecentTerm(search.term);
                    return;
                  }
                  safeNavigate(`/search?q=${encodeURIComponent(search.term)}`, { history: 'replace' });
                }}
              >
                <span className="panel__list-item-label text-truncate">
                  {search.term}
                </span>
                <span className="badge-count">
                  <span className="badge-number">{formatBadgeCount(search.count)}</span>
                </span>
              </button>
              <button
                type="button"
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  e.preventDefault();
                  removeFromRecentSearches(search.term);
                }}
                className="recent-search-close-icon flex-center shrink-0 cursor-pointer p-0 border-0 bg-transparent ml-auto"
                aria-label="Remove from recent searches"
              >
                <svg className="fill-[var(--color-pebble-grey)]" viewBox="0 0 384 512" aria-hidden="true">
                  <path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/>
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RecentSearches;

