import React, { useEffect, useState, useCallback } from 'react';
import { safeNavigate } from '@/utils/safe-navigate';

interface RecentSearch {
  term: string;
  count: number;
}

const RecentSearches: React.FC = () => {
  // Always start with empty array to avoid hydration mismatch
  // Will be populated from localStorage in useEffect after mount
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);

  const updateRecentSearches = useCallback(() => {
    if (typeof window === 'undefined') return;
    
    const stored = JSON.parse(localStorage.getItem('harvous-recent-searches') || '[]');
    // Handle both old format (strings) and new format (objects)
    const searches = stored.map((item: any) => {
      if (typeof item === 'string') {
        return { term: item, count: 0 };
      }
      return item;
    }).slice(0, 5);
    
    setRecentSearches(searches);
  }, []);

  const removeFromRecentSearches = useCallback((searchTerm: string) => {
    if (typeof window === 'undefined') return;
    
    const stored = JSON.parse(localStorage.getItem('harvous-recent-searches') || '[]');
    
    const updatedSearches = stored.filter((search: any) => {
      // Handle both old format (strings) and new format (objects)
      const term = typeof search === 'string' ? search : search.term;
      return term !== searchTerm;
    });
    
    localStorage.setItem('harvous-recent-searches', JSON.stringify(updatedSearches));
    
    // Update state directly with the filtered results
    const formattedSearches = updatedSearches.map((item: any) => {
      if (typeof item === 'string') {
        return { term: item, count: 0 };
      }
      return item;
    }).slice(0, 5);
    
    setRecentSearches(formattedSearches);
    
    // Trigger reactivity by dispatching a custom event
    window.dispatchEvent(new CustomEvent('recent-searches-updated'));
  }, []);

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
    
    window.addEventListener('recent-searches-updated', handleUpdate);
    
    return () => {
      window.removeEventListener('recent-searches-updated', handleUpdate);
    };
  }, [updateRecentSearches]);

  if (recentSearches.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3">
        {recentSearches.map((search) => (
          <div key={search.term} className="recent-search-item">
            <div
              className="relative nav-item-container rounded-3xl min-h-[64px] py-5 px-4 flex items-center gap-3"
              style={{ background: 'var(--color-gradient-gray)', boxShadow: 'var(--shadow-small)' }}
            >
              <button
                type="button"
                className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer transition-[scale,shadow] duration-300"
                style={{ color: 'var(--color-deep-grey)' }}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('.recent-search-close-icon')) return;
                  safeNavigate(`/search?q=${encodeURIComponent(search.term)}`, { history: 'replace' });
                }}
              >
                <span className="font-sans text-[18px] font-semibold truncate">
                  {search.term}
                </span>
                <span className="badge-count bg-[rgba(120,118,111,0.1)] inline-flex items-center justify-center rounded-3xl w-6 h-6 flex-shrink-0 text-[14px] font-sans font-semibold leading-[0]">
                  {search.count}
                </span>
              </button>
              <button
                type="button"
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  e.preventDefault();
                  removeFromRecentSearches(search.term);
                }}
                className="recent-search-close-icon flex items-center justify-center flex-shrink-0 w-6 h-6 cursor-pointer p-0 border-0 bg-transparent ml-auto"
                aria-label="Remove from recent searches"
              >
                <svg width="20" height="20" className="fill-[var(--color-pebble-grey)]" viewBox="0 0 384 512" aria-hidden="true">
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

