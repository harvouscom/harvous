import React, { useState, useEffect, useRef } from 'react';
import { safeNavigate } from '@/utils/safe-navigate';
import { addRecentSearchTerm, type RecentSearchStorageScope } from '@/utils/recent-search-storage';

interface FindSearchInputProps {
  className?: string;
  placeholder?: string;
  initialQuery?: string;
  /**
   * Controlled mode: parent owns the value (disables URL `?q=` sync and initialQuery sync).
   * Use with `onValueChange` for live search in panels.
   */
  value?: string;
  onValueChange?: (value: string) => void;
  /** Skip focus-stealing on mount (e.g. edit panels). */
  disableAutoFocus?: boolean;
  /** Called before navigating to search results; use to prefetch (fire-and-forget). */
  onBeforeSearchNavigate?: (term: string) => void;
  /** When set, submit stays on the current page (no `/search` navigation). */
  onSubmitSearch?: (term: string) => void;
  /** Used with `onSubmitSearch` when the clear button should reset parent state instead of navigating to `/search`. */
  onClearSearch?: () => void;
  /** With `onSubmitSearch`, record the term under this scope (thread/space search tab). */
  recentSearchRecordScope?: Exclude<RecentSearchStorageScope, null>;
}

export default function FindSearchInput({
  className = "",
  placeholder = "Search my Harvous...",
  initialQuery = "",
  value: controlledValue,
  onValueChange,
  disableAutoFocus = false,
  onBeforeSearchNavigate,
  onSubmitSearch,
  onClearSearch,
  recentSearchRecordScope,
}: FindSearchInputProps) {
  const isControlled = controlledValue !== undefined && onValueChange !== undefined;
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const inputRef = useRef<HTMLInputElement>(null);
  const displayValue = isControlled ? controlledValue : searchQuery;

  // Sync when initialQuery prop changes (e.g. SPA navigates to /search?q=term)
  useEffect(() => {
    if (isControlled) return;
    setSearchQuery(initialQuery);
  }, [initialQuery, isControlled]);

  // Sync with URL query parameter
  const updateSearchQuery = () => {
    if (isControlled) return;
    const urlParams = new URLSearchParams(window.location.search);
    const query = urlParams.get('q') || '';
    setSearchQuery(query);
  };

  // Initialize from URL and listen for changes
  useEffect(() => {
    if (isControlled) return;
    updateSearchQuery();

    window.addEventListener('popstate', updateSearchQuery);
    document.addEventListener('app:route-change', updateSearchQuery);

    return () => {
      window.removeEventListener('popstate', updateSearchQuery);
      document.removeEventListener('app:route-change', updateSearchQuery);
    };
  }, [isControlled]);

  // Auto-focus input on mount and page load
  useEffect(() => {
    if (disableAutoFocus || isControlled) return;
    const focusInput = () => {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    };

    focusInput();

    document.addEventListener('app:route-change', focusInput);

    return () => {
      document.removeEventListener('app:route-change', focusInput);
    };
  }, [disableAutoFocus, isControlled]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isControlled) onValueChange(e.target.value);
    else setSearchQuery(e.target.value);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    const trimmedQuery = displayValue.trim();
    
    if (!trimmedQuery) {
      return;
    }

    onBeforeSearchNavigate?.(trimmedQuery);

    if (onSubmitSearch) {
      if (recentSearchRecordScope) {
        addRecentSearchTerm(recentSearchRecordScope, trimmedQuery);
      }
      onSubmitSearch(trimmedQuery);
      return;
    }

    addRecentSearchTerm(null, trimmedQuery);

    // Navigate to search results (no view transition for instant feedback)
    safeNavigate(`/search?q=${encodeURIComponent(trimmedQuery)}`, { history: 'replace' });
  };

  const handleClear = () => {
    if (isControlled) onValueChange('');
    else setSearchQuery('');
    if (onClearSearch) {
      onClearSearch();
      return;
    }
    if (!isControlled) safeNavigate('/search', { history: 'replace' });
  };

  return (
    <form method="GET" action="/search" className="w-full relative" onSubmit={handleSubmit}>
      <div className={`search-input ${className}`}>
        {/* Search Icon */}
        <svg width="16" height="16" className="search-input__icon" viewBox="0 0 512 512">
          <path d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z"/>
        </svg>
        
        {/* Input */}
        <input 
          ref={inputRef}
          type="text" 
          name="q"
          value={displayValue}
          onChange={handleInputChange}
          role="searchbox"
          aria-label="Find"
          className="search-input__field" 
          placeholder={placeholder}
        />
        
        {/* Clear Icon */}
        {displayValue && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear find"
            className="search-input__clear"
          >
          <svg width="16" height="16" viewBox="0 0 384 512" aria-hidden="true">
            <path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/>
          </svg>
          </button>
        )}
      </div>
    </form>
  );
}

