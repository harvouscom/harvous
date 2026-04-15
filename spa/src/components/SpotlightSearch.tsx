import { useQueryClient } from '@tanstack/react-query';
import { Command } from 'cmdk';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDesktopMainModalPortal } from '@/hooks/useDesktopMainModalPortal';
import {
  fetchSearchResults,
  searchQueryKey,
  useSearch,
  type SearchResult,
  type SearchScope,
} from '@/hooks/useSearch';
import {
  addRecentSearchTerm,
  RECENT_SEARCH_COMMIT_IDLE_MS,
  recentSearchStorageKey,
  recentSearchesUpdatedEvent,
} from '@/utils/recent-search-storage';
import { MIN_SEARCH_QUERY_LENGTH } from '@/utils/search-query';
import { idToUrl } from '@/utils/url-helpers';
import { appendSpaceQueryParam, getSpaceIdForPersistentNavLinks } from '@/utils/current-space-for-links';
import { getSelectedSpaceId } from '@/components/react/navigation/selectedSpace';
import { getThreadColorCSS, getThreadIconOnAccentCSS } from '@/utils/colors';
import { useThread } from '../hooks/queries/useThread';
import { useSpace } from '../hooks/queries/useSpace';
import SearchResultRow from '../../../src/components/react/SearchResultRow';
import RecentSearchRow from '../../../src/components/react/RecentSearchRow';
import { router } from '../router';
import { isMobileDevice } from '@/utils/pwa-prompt';
import '../../../src/styles/spotlight.css';

interface RecentSearch {
  term: string;
  count: number;
}

/** Cmdk sentinel — no real item uses this, so nothing is aria-selected until ↑/↓ */
const SPOTLIGHT_NO_LIST_SELECTION = '__harvous_spotlight_none__';

/** Detect search scope from the current URL. */
function detectScope(): { scope: SearchScope; label: string } | null {
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);

  // On a thread page
  const threadMatch = path.match(/^\/thread\/(.+)/);
  if (threadMatch) {
    return { scope: { threadId: `thread_${threadMatch[1]}` }, label: 'this thread' };
  }

  // On a note page with thread context
  const noteMatch = path.match(/^\/note\//);
  const threadParam = params.get('thread');
  if (noteMatch && threadParam) {
    const threadId = threadParam.startsWith('thread_') ? threadParam : `thread_${threadParam}`;
    return { scope: { threadId }, label: 'this thread' };
  }

  // On a space page
  const spaceMatch = path.match(/^\/space\/(.+)/);
  if (spaceMatch) {
    return { scope: { spaceId: `space_${spaceMatch[1]}` }, label: 'this space' };
  }

  return null;
}

function getRecentSearches(): RecentSearch[] {
  try {
    const key = recentSearchStorageKey(null);
    const stored = JSON.parse(localStorage.getItem(key) || '[]');
    const mapped = stored.map((item: any) =>
      typeof item === 'string' ? { term: item, count: 0 } : item,
    );
    const filtered = mapped.filter(
      (item: RecentSearch) => item.term.trim().length >= MIN_SEARCH_QUERY_LENGTH,
    );
    if (filtered.length !== mapped.length) {
      localStorage.setItem(key, JSON.stringify(filtered));
    }
    return filtered.slice(0, 5);
  } catch {
    return [];
  }
}

function removeRecentSearch(term: string) {
  try {
    const key = recentSearchStorageKey(null);
    const stored = JSON.parse(localStorage.getItem(key) || '[]');
    const filtered = stored.filter((s: any) =>
      (typeof s === 'string' ? s : s.term) !== term,
    );
    localStorage.setItem(key, JSON.stringify(filtered));
    window.dispatchEvent(new CustomEvent(recentSearchesUpdatedEvent(null)));
  } catch {
    /* ignore */
  }
}

const CloseIcon = () => (
  <svg viewBox="0 0 384 512" aria-hidden="true">
    <path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z" />
  </svg>
);

export default function SpotlightSearch() {
  const { portalTarget } = useDesktopMainModalPortal();
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [scopeInfo, setScopeInfo] = useState<{ scope: SearchScope; label: string } | null>(null);
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  const [commandListValue, setCommandListValue] = useState(SPOTLIGHT_NO_LIST_SELECTION);
  const overlayRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedQueryRef = useRef(debouncedQuery);
  const queryRef = useRef(query);
  debouncedQueryRef.current = debouncedQuery;
  queryRef.current = query;
  const savedOverflow = useRef('');
  const queryClient = useQueryClient();
  const showKeyboardStrip = !isMobileDevice();

  const prefetchRecentSearch = useCallback(
    (term: string) => {
      const t = term.trim();
      if (!t || t.length < MIN_SEARCH_QUERY_LENGTH) return;
      queryClient.prefetchQuery({
        queryKey: searchQueryKey(t, scopeInfo?.scope),
        queryFn: () => fetchSearchResults(t, scopeInfo?.scope),
      });
    },
    [queryClient, scopeInfo?.scope],
  );

  // Debounce query
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Search with scope
  const { data, isLoading } = useSearch(debouncedQuery, scopeInfo?.scope);
  const results: SearchResult[] = data?.results ?? [];

  // Record completed searches in global recents only after the user pauses (avoids "ange"/"angel"/"angels").
  useEffect(() => {
    if (!isOpen) return;
    const trimmed = debouncedQuery.trim();
    if (trimmed.length < MIN_SEARCH_QUERY_LENGTH) return;
    if (query.trim() !== trimmed) return;
    if (isLoading) return;
    const resultCount = results.length;
    const timer = window.setTimeout(() => {
      const d = debouncedQueryRef.current.trim();
      const q = queryRef.current.trim();
      if (d.length < MIN_SEARCH_QUERY_LENGTH) return;
      if (q !== d) return;
      if (d !== trimmed) return;
      addRecentSearchTerm(null, d, { resultCount });
    }, RECENT_SEARCH_COMMIT_IDLE_MS);
    return () => window.clearTimeout(timer);
  }, [isOpen, debouncedQuery, query, isLoading, results.length]);

  // Refresh recent searches
  const refreshRecents = useCallback(() => {
    setRecentSearches(getRecentSearches());
  }, []);

  // Open handler
  const open = useCallback(() => {
    setQuery('');
    setDebouncedQuery('');
    setCommandListValue(SPOTLIGHT_NO_LIST_SELECTION);
    setScopeInfo(detectScope());
    refreshRecents();
    setIsClosing(false);
    setIsOpen(true);
    savedOverflow.current = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }, [refreshRecents]);

  // Close handler with exit animation
  const close = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
      document.body.style.overflow = savedOverflow.current;
    }, 200); // matches .spotlight-overlay--closing .spotlight-wrapper exit animation
  }, []);

  // Focus the search input when the overlay opens (desktop + mobile dialog).
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [isOpen]);

  // Listen for open/close events
  useEffect(() => {
    const handleOpen = () => open();
    const handleClose = () => close();
    window.addEventListener('openSpotlightSearch', handleOpen);
    window.addEventListener('closeSpotlightSearch', handleClose);
    return () => {
      window.removeEventListener('openSpotlightSearch', handleOpen);
      window.removeEventListener('closeSpotlightSearch', handleClose);
    };
  }, [open, close]);

  // Listen for recent search updates
  useEffect(() => {
    if (!isOpen) return;
    const handler = () => refreshRecents();
    window.addEventListener(recentSearchesUpdatedEvent(null), handler);
    return () => window.removeEventListener(recentSearchesUpdatedEvent(null), handler);
  }, [isOpen, refreshRecents]);

  // No list highlight until ↑/↓; clear when the result set changes
  useEffect(() => {
    if (!isOpen) return;
    setCommandListValue(SPOTLIGHT_NO_LIST_SELECTION);
  }, [isOpen, debouncedQuery]);

  const scopedThreadId = isOpen && scopeInfo?.scope.threadId ? scopeInfo.scope.threadId : '';
  const scopedSpaceId = isOpen && scopeInfo?.scope.spaceId ? scopeInfo.scope.spaceId : '';
  const threadQuery = useThread(scopedThreadId);
  const spaceQuery = useSpace(scopedSpaceId);

  const scopeAccentCss = useMemo(() => {
    if (!scopeInfo) return 'var(--color-paper)';
    if (scopeInfo.scope.threadId) {
      return getThreadColorCSS(threadQuery.data?.thread?.color ?? null);
    }
    if (scopeInfo.scope.spaceId) {
      return getThreadColorCSS(spaceQuery.data?.color ?? null);
    }
    return 'var(--color-paper)';
  }, [scopeInfo, threadQuery.data?.thread?.color, spaceQuery.data?.color]);

  const scopeColorName = useMemo(() => {
    if (!scopeInfo) return null;
    if (scopeInfo.scope.threadId) return threadQuery.data?.thread?.color ?? null;
    if (scopeInfo.scope.spaceId) return spaceQuery.data?.color ?? null;
    return null;
  }, [scopeInfo, threadQuery.data?.thread?.color, spaceQuery.data?.color]);

  // Navigate to a result
  const navigateToResult = useCallback(
    (id: string) => {
      const navTerm = query.trim();
      if (navTerm.length >= MIN_SEARCH_QUERY_LENGTH) {
        addRecentSearchTerm(null, navTerm);
      }
      close();
      const path = typeof window !== 'undefined' ? window.location.pathname : '';
      const search = typeof window !== 'undefined' ? window.location.search : '';
      const isHome = path === '/' || path === '/dashboard';
      const spaceForHref = isHome
        ? getSelectedSpaceId()
        : getSpaceIdForPersistentNavLinks({ pathname: path, search, effectiveSpaceId: undefined });
      const target = appendSpaceQueryParam(idToUrl(id), spaceForHref);
      router.navigate({ to: target as any });
    },
    [query, close],
  );

  // Handle selecting a recent search term
  const selectRecentTerm = useCallback((term: string) => {
    setQuery(term);
    setDebouncedQuery(term);
    setCommandListValue(SPOTLIGHT_NO_LIST_SELECTION);
  }, []);

  // Handle overlay click
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === overlayRef.current) close();
    },
    [close],
  );

  /** Match FindSearchInput clear — instant empty + reset list highlight (shared `.search-input` / `.search-input__clear`). */
  const clearQuery = useCallback(() => {
    setQuery('');
    setDebouncedQuery('');
    setCommandListValue(SPOTLIGHT_NO_LIST_SELECTION);
  }, []);

  // Detect if Mac for keyboard hints
  const isMac = useMemo(
    () => typeof navigator !== 'undefined' && /Mac/.test(navigator.platform),
    [],
  );

  const showRecents = !query.trim() && recentSearches.length > 0;
  const debouncedTrim = debouncedQuery.trim();
  const showResults = debouncedTrim.length >= MIN_SEARCH_QUERY_LENGTH;
  const showTooShortHint = debouncedTrim.length > 0 && debouncedTrim.length < MIN_SEARCH_QUERY_LENGTH;

  /** Shared search UI inside the spotlight overlay. */
  const searchContent = (
    <Command
      shouldFilter={false}
      label="Search"
      value={commandListValue}
      onValueChange={setCommandListValue}
      disablePointerSelection
    >
      <div className="search-input spotlight-search-input">
        <svg width="16" height="16" className="search-input__icon" viewBox="0 0 512 512" aria-hidden="true">
          <path d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z" />
        </svg>
        <Command.Input
          ref={inputRef}
          className="search-input__field"
          value={query}
          onValueChange={setQuery}
          placeholder={scopeInfo ? 'Search here...' : 'Search my Harvous...'}
          role="searchbox"
          aria-label="Find"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              close();
            }
          }}
        />
        {(query.trim() || scopeInfo) && (
          <div className="spotlight-input-trailing">
            {!!query.trim() && (
              <button
                type="button"
                className="search-input__clear"
                onClick={(e) => {
                  e.stopPropagation();
                  clearQuery();
                }}
                aria-label="Clear find"
              >
                <svg width="16" height="16" viewBox="0 0 384 512" aria-hidden="true">
                  <path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z" />
                </svg>
              </button>
            )}
            {scopeInfo && (
              <div
                className="spotlight-scope"
                style={{ '--spotlight-scope-accent': scopeAccentCss } as React.CSSProperties}
              >
                <span>In {scopeInfo.label}</span>
                <button
                  type="button"
                  className="spotlight-scope__dismiss"
                  style={{ color: getThreadIconOnAccentCSS(scopeColorName) }}
                  onClick={() => setScopeInfo(null)}
                  aria-label="Search everywhere"
                >
                  <CloseIcon />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      <Command.List>
        {showTooShortHint && (
          <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: '14px', color: 'var(--color-pebble-grey)' }}>
            Type at least {MIN_SEARCH_QUERY_LENGTH} characters to search.
          </div>
        )}
        {showResults && isLoading && (
          <Command.Loading>
            <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: '14px', color: 'var(--color-pebble-grey)' }}>
              Searching...
            </div>
          </Command.Loading>
        )}
        {showResults && !isLoading && results.length === 0 && (
          <Command.Empty>No results found</Command.Empty>
        )}
        {showResults && results.length > 0 && (
          <Command.Group heading={`${results.length} result${results.length !== 1 ? 's' : ''}`}>
            {results.map((result) => (
              <Command.Item
                key={result.id}
                value={result.id}
                onSelect={() => navigateToResult(result.id)}
              >
                <SearchResultRow result={result} className="spotlight-result-row" />
              </Command.Item>
            ))}
          </Command.Group>
        )}
        {showRecents && (
          <Command.Group>
            {recentSearches.map((search) => (
              <Command.Item
                key={search.term}
                value={`recent:${search.term}`}
                onSelect={() => selectRecentTerm(search.term)}
              >
                <RecentSearchRow
                  term={search.term}
                  count={search.count}
                  onRemove={() => { removeRecentSearch(search.term); refreshRecents(); }}
                  onPrefetchSearch={prefetchRecentSearch}
                  variant="overlay"
                />
              </Command.Item>
            ))}
          </Command.Group>
        )}
        {!showResults && !showRecents && (
          <Command.Empty>Search to see recent searches</Command.Empty>
        )}
      </Command.List>
    </Command>
  );

  // Portal overlay — desktop: centered in main column; mobile: top-aligned above keyboard.
  if (!isOpen) return null;
  return createPortal(
    <div
      ref={overlayRef}
      className={`spotlight-overlay${isClosing ? ' spotlight-overlay--closing' : ''}`}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label="Search"
    >
      <div className={`spotlight-wrapper${showKeyboardStrip ? ' spotlight-wrapper--with-strip' : ''}`}>
        <div className="spotlight-container">
          {searchContent}
        </div>
        {showKeyboardStrip && (
          <div className="spotlight-strip">
            <div className="action-strip action-strip--mobile">
              <div className="action-strip__inner">
                <span className="action-strip__item">
                  <span className="action-strip__label">
                    <kbd>{isMac ? '⌘' : 'Ctrl'}</kbd> + <kbd>K</kbd> to open
                  </span>
                </span>
                <span className="action-strip__item">
                  <span className="action-strip__label">
                    <kbd>↑</kbd> <kbd>↓</kbd> to navigate
                  </span>
                </span>
                <span className="action-strip__item">
                  <span className="action-strip__label">
                    <kbd>↵</kbd> to select
                  </span>
                </span>
                <span className="action-strip__item">
                  <span className="action-strip__label">
                    <kbd>Esc</kbd> to close
                  </span>
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    portalTarget,
  );
}
