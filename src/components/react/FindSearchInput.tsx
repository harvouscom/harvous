import React, { useState, useEffect, useRef } from 'react';
import { safeNavigate } from '@/utils/safe-navigate';

interface FindSearchInputProps {
  className?: string;
  placeholder?: string;
  initialQuery?: string;
  /** Called before navigating to search results; use to prefetch (fire-and-forget). */
  onBeforeSearchNavigate?: (term: string) => void;
}

export default function FindSearchInput({
  className = "",
  placeholder = "Search my Harvous...",
  initialQuery = "",
  onBeforeSearchNavigate,
}: FindSearchInputProps) {
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync when initialQuery prop changes (e.g. SPA navigates to /search?q=term)
  useEffect(() => {
    setSearchQuery(initialQuery);
  }, [initialQuery]);

  // Sync with URL query parameter
  const updateSearchQuery = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const query = urlParams.get('q') || '';
    setSearchQuery(query);
  };

  // Initialize from URL and listen for changes
  useEffect(() => {
    updateSearchQuery();
    
    // Listen for URL changes (for View Transitions)
    window.addEventListener('popstate', updateSearchQuery);
    document.addEventListener('app:route-change', updateSearchQuery);
    
    return () => {
      window.removeEventListener('popstate', updateSearchQuery);
      document.removeEventListener('app:route-change', updateSearchQuery);
    };
  }, []);

  // Auto-focus input on mount and page load
  useEffect(() => {
    const focusInput = () => {
      // Small delay to ensure input is rendered and ready
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    };

    // Focus on initial mount
    focusInput();

    // Focus on View Transitions page load
    document.addEventListener('app:route-change', focusInput);

    return () => {
      document.removeEventListener('app:route-change', focusInput);
    };
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    const trimmedQuery = searchQuery.trim();
    
    if (!trimmedQuery) {
      return;
    }

    // Save to recent searches - count will be updated after search results load
    const recentSearches = JSON.parse(localStorage.getItem('harvous-recent-searches') || '[]');
    const newSearchItem = { term: trimmedQuery, count: 0 };
    const filteredSearches = recentSearches.filter((s: any) => {
      const term = typeof s === 'string' ? s : s.term;
      return term !== trimmedQuery;
    });
    const newSearches = [newSearchItem, ...filteredSearches];
    localStorage.setItem('harvous-recent-searches', JSON.stringify(newSearches.slice(0, 10)));
    
    // Trigger event for RecentSearches component to update
    window.dispatchEvent(new CustomEvent('recent-searches-updated'));

    // Start prefetch so results may be ready when the page mounts
    onBeforeSearchNavigate?.(trimmedQuery);

    // Navigate to search results (no view transition for instant feedback)
    safeNavigate(`/search?q=${encodeURIComponent(trimmedQuery)}`, { history: 'replace', viewTransition: false });
  };

  const handleClear = () => {
    setSearchQuery('');
    safeNavigate('/search', { history: 'replace', viewTransition: false });
  };

  return (
    <form method="GET" action="/search" className="w-full relative" onSubmit={handleSubmit}>
      <div className={`search-input ${className}`}>
        {/* Search Icon */}
        <svg width="20" height="20" className="search-input__icon" viewBox="0 0 512 512">
          <path d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z"/>
        </svg>
        
        {/* Input */}
        <input 
          ref={inputRef}
          type="text" 
          name="q"
          value={searchQuery}
          onChange={handleInputChange}
          role="searchbox"
          aria-label="Find"
          className="search-input__field" 
          placeholder={placeholder}
        />
        
        {/* Clear Icon */}
        {searchQuery && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear find"
            className="search-input__clear"
          >
          <svg width="20" height="20" viewBox="0 0 384 512" aria-hidden="true">
            <path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/>
          </svg>
          </button>
        )}
      </div>
    </form>
  );
}

