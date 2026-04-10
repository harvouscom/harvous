import { Command } from 'cmdk';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearch, type SearchResult, type SearchScope } from '@/hooks/useSearch';
import {
  addRecentSearchTerm,
  recentSearchStorageKey,
  recentSearchesUpdatedEvent,
} from '@/utils/recent-search-storage';
import { idToUrl } from '@/utils/url-helpers';
import { getThreadColorCSS, getThreadIconOnAccentCSS } from '@/utils/colors';
import { useThread } from '../hooks/queries/useThread';
import { useSpace } from '../hooks/queries/useSpace';
import {
  CondensedNoteRowLayout,
  condensedNoteRowIcon,
  getCondensedNoteAccentBarStyle,
  getCondensedNoteMeshGradient,
  getSolidThreadAccentBarStyle,
} from '../../../src/components/react/CondensedNoteRowLayout';
import { CONDENSED_NOTE_ICON_PX } from '@/utils/condensed-note-row';
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
    return stored
      .map((item: any) =>
        typeof item === 'string' ? { term: item, count: 0 } : item,
      )
      .slice(0, 5);
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

const SearchIcon = () => (
  <svg viewBox="0 0 512 512" aria-hidden="true" style={{ width: 18, height: 18, fill: 'var(--color-pebble-grey)' }}>
    <path d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z" />
  </svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 384 512" aria-hidden="true">
    <path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z" />
  </svg>
);

/** Inline text chip for contextual metadata next to a result title. */
function ContextChip({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontFamily: 'var(--font-sans)',
        fontSize: '12px',
        fontWeight: 500,
        color: 'var(--color-stone-grey)',
        flexShrink: 0,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

function ResultItem({ result }: { result: SearchResult }) {
  const isThread = result.type === 'thread';
  const isScripture = result.noteType === 'scripture';

  const accentBarStyle = isThread
    ? getSolidThreadAccentBarStyle(getThreadColorCSS(result.color))
    : getCondensedNoteAccentBarStyle(getCondensedNoteMeshGradient(result.threadColors, result.id));

  const icon = condensedNoteRowIcon({
    itemType: isThread ? 'thread' : 'note',
    noteType: (result.noteType as 'default' | 'scripture' | 'resource') ?? 'default',
    iconSize: CONDENSED_NOTE_ICON_PX,
  });

  // Context chips: shown inline to the right of title
  const chips: React.ReactNode[] = [];
  if (isScripture && result.scriptureTranslation) {
    chips.push(<ContextChip key="translation">{result.scriptureTranslation}</ContextChip>);
  }
  if (!isThread && result.threadTitle) {
    chips.push(<ContextChip key="thread">{result.threadTitle}</ContextChip>);
  }

  return (
    <CondensedNoteRowLayout
      className="relative spotlight-result-row"
      accentBarStyle={accentBarStyle}
      icon={icon}
      paddingRight="0.75rem"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontWeight: 700,
            color: 'var(--color-deep-grey)',
            fontSize: '16px',
            lineHeight: 1.2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {result.title || (isThread ? 'Untitled thread' : 'Untitled')}
        </div>
        {chips}
      </div>
    </CondensedNoteRowLayout>
  );
}

function RecentItem({
  search,
  onRemove,
}: {
  search: { term: string; count: number };
  onRemove: () => void;
}) {
  const accentBarStyle = getCondensedNoteAccentBarStyle(null);
  const icon = (
    <svg viewBox="0 0 512 512" aria-hidden="true" style={{ width: CONDENSED_NOTE_ICON_PX, height: CONDENSED_NOTE_ICON_PX, fill: 'var(--color-deep-grey)', opacity: 0.35 }}>
      <path d="M256 0a256 256 0 1 1 0 512A256 256 0 1 1 256 0zM232 120V256c0 8 4 15.5 10.7 20l96 64c11 7.4 25.9 4.4 33.3-6.7s4.4-25.9-6.7-33.3L280 243.2V120c0-13.3-10.7-24-24-24s-24 10.7-24 24z" />
    </svg>
  );

  return (
    <CondensedNoteRowLayout
      className="relative spotlight-result-row"
      accentBarStyle={accentBarStyle}
      icon={icon}
      paddingRight="2.5rem"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontWeight: 700,
            color: 'var(--color-deep-grey)',
            fontSize: '16px',
            lineHeight: 1.2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {search.term}
        </div>
        {search.count > 0 && (
          <span className="badge-count">
            <span className="badge-number">{search.count}</span>
          </span>
        )}
      </div>
      <button
        type="button"
        className="btn-action spotlight-item__remove"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        aria-label={`Remove "${search.term}" from recent searches`}
      >
        <span className="btn-action__icon">
          <CloseIcon />
        </span>
      </button>
    </CondensedNoteRowLayout>
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
    if (trimmed.length < 2) return;
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

  // On mobile, pin the overlay to the visual viewport so the keyboard doesn't cover it
  useEffect(() => {
    if (!isOpen || !isMobileDevice()) return;
    const update = () => {
      const vv = window.visualViewport;
      if (!vv || !overlayRef.current) return;
      overlayRef.current.style.height = `${vv.height}px`;
      overlayRef.current.style.top = `${vv.offsetTop}px`;
      overlayRef.current.style.bottom = 'auto';
    };
    update();
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    return () => {
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
      if (overlayRef.current) {
        overlayRef.current.style.height = '';
        overlayRef.current.style.top = '';
        overlayRef.current.style.bottom = '';
      }
    };
  }, [isOpen]);

  // Focus the input after open; delay on mobile so the viewport adjusts before keyboard opens
  useEffect(() => {
    if (!isOpen) return;
    const delay = isMobileDevice() ? 100 : 0;
    const timer = setTimeout(() => inputRef.current?.focus(), delay);
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
      if (query.trim()) {
        addRecentSearchTerm(null, query.trim());
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

  // Detect if Mac for keyboard hints
  const isMac = useMemo(
    () => typeof navigator !== 'undefined' && /Mac/.test(navigator.platform),
    [],
  );

  if (!isOpen) return null;

  const showRecents = !query.trim() && recentSearches.length > 0;
  const showResults = !!debouncedQuery.trim();

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
        {/* Modal card — sits in front */}
        <div className="spotlight-container">
          <Command
            shouldFilter={false}
            label="Search"
            value={commandListValue}
            onValueChange={setCommandListValue}
            disablePointerSelection
          >
            <div
              className={`spotlight-input-wrapper${scopeInfo ? ' spotlight-input-wrapper--has-scope' : ''}`}
            >
              <SearchIcon />
              <Command.Input
                ref={inputRef}
                value={query}
                onValueChange={setQuery}
                placeholder={scopeInfo ? 'Search here...' : 'Search my Harvous...'}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    close();
                  }
                }}
              />
              {scopeInfo && (
                <div
                  className="spotlight-scope"
                  style={
                    {
                      '--spotlight-scope-accent': scopeAccentCss,
                    } as React.CSSProperties
                  }
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
            <Command.List>
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
                      <ResultItem result={result} />
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {showRecents && (
                <Command.Group heading="Recent searches">
                  {recentSearches.map((search) => (
                    <Command.Item
                      key={search.term}
                      value={`recent:${search.term}`}
                      onSelect={() => selectRecentTerm(search.term)}
                    >
                      <RecentItem
                        search={search}
                        onRemove={() => { removeRecentSearch(search.term); refreshRecents(); }}
                      />
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {!showResults && !showRecents && (
                <Command.Empty>
                  Start typing to search
                </Command.Empty>
              )}
            </Command.List>
          </Command>
        </div>

        {/* Action strip — desktop only; mobile devices rarely use physical keyboard shortcuts */}
        {!isMobileDevice() && (
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
    document.body,
  );
}
