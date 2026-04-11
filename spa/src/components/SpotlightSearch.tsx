import { useQueryClient } from '@tanstack/react-query';
import { Command } from 'cmdk';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Drawer, DrawerContent } from '../../../src/components/ui/drawer';
import {
  fetchSearchResults,
  searchQueryKey,
  useSearch,
  type SearchResult,
  type SearchScope,
} from '@/hooks/useSearch';
import {
  addRecentSearchTerm,
  recentSearchStorageKey,
  recentSearchesUpdatedEvent,
} from '@/utils/recent-search-storage';
import { MIN_SEARCH_QUERY_LENGTH } from '@/utils/search-query';
import { idToUrl } from '@/utils/url-helpers';
import { getThreadIconOnAccentCSS } from '@/utils/colors';
import { useThread } from '../hooks/queries/useThread';
import { useSpace } from '../hooks/queries/useSpace';
import SearchResultRow from '../../../src/components/react/SearchResultRow';
import { formatBadgeCount } from '@/utils/badge-count';
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

/** Shared row chrome with [`RecentSearches`](src/components/react/RecentSearches.tsx) via `.recent-search-row`. */
function RecentItem({
  search,
  onRemove,
  onPrefetchSearch,
}: {
  search: { term: string; count: number };
  onRemove: () => void;
  onPrefetchSearch?: (term: string) => void;
}) {
  return (
    <div className="recent-search-item w-full">
      <div
        className="relative nav-item-container rounded-2xl px-4 flex flex-row items-center recent-search-row spotlight-recent-row"
        style={{ background: 'var(--color-gradient-gray)', boxShadow: 'var(--shadow-small)' }}
      >
        <div
          className="flex flex-row flex-fill items-center text-left min-w-0"
          style={{ color: 'var(--color-deep-grey)' }}
          onMouseEnter={() => onPrefetchSearch?.(search.term)}
        >
          <span className="panel__list-item-label text-truncate">{search.term}</span>
          <span className="badge-count">
            <span className="badge-number">{formatBadgeCount(search.count)}</span>
          </span>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onRemove();
          }}
          className="recent-search-close-icon flex-center shrink-0 cursor-pointer p-0 border-0 bg-transparent ml-auto"
          aria-label="Remove from recent searches"
        >
          <svg className="fill-[var(--color-pebble-grey)]" viewBox="0 0 384 512" aria-hidden="true">
            <path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default function SpotlightSearch() {
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [scopeInfo, setScopeInfo] = useState<{ scope: SearchScope; label: string } | null>(null);
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  const [commandListValue, setCommandListValue] = useState(SPOTLIGHT_NO_LIST_SELECTION);
  const overlayRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const savedOverflow = useRef('');
  const queryClient = useQueryClient();

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

  // Record completed searches in global recents (result count for badge), like /search + AddToSpaceSection FTS sync
  useEffect(() => {
    if (!isOpen) return;
    const trimmed = debouncedQuery.trim();
    if (trimmed.length < MIN_SEARCH_QUERY_LENGTH) return;
    if (isLoading) return;
    addRecentSearchTerm(null, trimmed, { resultCount: results.length });
  }, [isOpen, debouncedQuery, isLoading, results.length]);

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
    }, 150); // matches exit animation duration
  }, []);

  // On desktop, focus the search input when the overlay opens.
  // On mobile, Vaul's onOpenAutoFocus handles focus after the drawer animates in.
  useEffect(() => {
    if (!isOpen || isMobileDevice()) return;
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
      router.navigate({ to: idToUrl(id) as any });
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

  /** Shared search UI — used inside both the mobile drawer and desktop overlay. */
  const searchContent = (
    <Command
      shouldFilter={false}
      label="Search"
      value={commandListValue}
      onValueChange={setCommandListValue}
      disablePointerSelection
    >
      <div className="search-input spotlight-search-input w-full">
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
                <SearchResultRow result={result} className="relative spotlight-result-row" />
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
                <RecentItem
                  search={search}
                  onRemove={() => { removeRecentSearch(search.term); refreshRecents(); }}
                  onPrefetchSearch={prefetchRecentSearch}
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

  // Mobile: use the Vaul drawer system — handles keyboard/viewport natively.
  if (isMobileDevice()) {
    return (
      <Drawer.Root
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsOpen(false);
            setIsClosing(false);
            document.body.style.overflow = savedOverflow.current;
          }
        }}
        shouldScaleBackground={false}
        noBodyStyles={true}
        fixed={true}
      >
        <DrawerContent
          className="spotlight-drawer-content rounded-t-3xl p-0 border-0"
          overlayClassName="spotlight-drawer-overlay"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {/* Drag handle */}
          <div className="spotlight-drawer-handle" />
          <div className="spotlight-container spotlight-container--drawer">
            {searchContent}
          </div>
        </DrawerContent>
      </Drawer.Root>
    );
  }

  // Desktop: custom centered overlay with enter/exit animation.
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
      <div className="spotlight-wrapper">
        <div className="spotlight-container">
          {searchContent}
        </div>
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
      </div>
    </div>,
    document.body,
  );
}
