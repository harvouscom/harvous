import { useEffect, useMemo, useRef } from 'react';
import { useRouterState } from '@tanstack/react-router';
import SearchResultRow from '../../../src/components/react/SearchResultRow';
import { appendSpaceQueryParam, getSpaceIdForPersistentNavLinks } from '../../../src/utils/current-space-for-links';
import { idToUrl } from '../../../src/utils/url-helpers';
import {
  addRecentSearchTerm,
  RECENT_SEARCH_COMMIT_IDLE_MS,
  type RecentSearchStorageScope,
} from '../../../src/utils/recent-search-storage';
import { MIN_SEARCH_QUERY_LENGTH } from '@/utils/search-query';
import { useSearch, type SearchResult, type SearchScope } from '@/hooks/useSearch';

export type { SearchScope, SearchResult } from '@/hooks/useSearch';
export { searchQueryKey, fetchSearchResults } from '@/hooks/useSearch';

export interface SearchResultsListProps {
  query: string;
  scope?: SearchScope;
  /**
   * When set, records completed searches (MRU + result count) for the matching scope.
   * `null` = global Find (`harvous-recent-searches`). Omit to disable.
   */
  recentSearchCountSync?: RecentSearchStorageScope;
  /** On My Home (`/` or `/dashboard`), thread/note links include this space (same as OrganizedContentList). */
  spaceIdForLinks?: string | null;
}

function searchStringFromRouter(searchRaw: unknown): string {
  if (typeof searchRaw === 'string') {
    if (!searchRaw) return '';
    return searchRaw.startsWith('?') ? searchRaw : `?${searchRaw}`;
  }
  if (searchRaw && typeof searchRaw === 'object') {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(searchRaw as Record<string, unknown>)) {
      if (v != null) params.set(k, String(v));
    }
    const str = params.toString();
    return str ? `?${str}` : '';
  }
  return '';
}

export default function SearchResultsList({
  query,
  scope,
  recentSearchCountSync,
  spaceIdForLinks,
}: SearchResultsListProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const searchRaw = useRouterState({ select: (s) => s.location.search });
  const searchStr = useMemo(() => searchStringFromRouter(searchRaw), [searchRaw]);

  const spaceForHref = useMemo(() => {
    if (pathname === '/' || pathname === '/dashboard') {
      return spaceIdForLinks ?? null;
    }
    return getSpaceIdForPersistentNavLinks({
      pathname,
      search: searchStr,
      effectiveSpaceId: spaceIdForLinks ?? undefined,
    });
  }, [pathname, searchStr, spaceIdForLinks]);

  const trimmed = query.trim();
  const trimmedRef = useRef(trimmed);
  trimmedRef.current = trimmed;
  const { data, isLoading, isError, error } = useSearch(trimmed, scope);

  useEffect(() => {
    if (recentSearchCountSync === undefined) return;
    if (trimmed.length < MIN_SEARCH_QUERY_LENGTH) return;
    if (isLoading || isError) return;
    if (data?.results === undefined) return;
    const resultCount = data.results.length;
    const committed = trimmed;
    const timer = window.setTimeout(() => {
      if (trimmedRef.current.trim() !== committed) return;
      addRecentSearchTerm(recentSearchCountSync, committed, { resultCount });
    }, RECENT_SEARCH_COMMIT_IDLE_MS);
    return () => window.clearTimeout(timer);
  }, [recentSearchCountSync, trimmed, isLoading, isError, data?.results]);

  const results: SearchResult[] = data?.results ?? [];

  if (!trimmed) return null;

  if (trimmed.length < MIN_SEARCH_QUERY_LENGTH) {
    return (
      <div style={{ padding: '32px 16px', textAlign: 'center', fontFamily: 'var(--font-sans)' }}>
        <div style={{ color: 'var(--color-pebble-grey)', fontSize: '14px' }}>
          Type at least {MIN_SEARCH_QUERY_LENGTH} characters to search.
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div
        style={{
          padding: '32px 16px',
          textAlign: 'center',
          color: 'var(--color-pebble-grey)',
          fontSize: '14px',
          fontFamily: 'var(--font-sans)',
        }}
      >
        Searching...
      </div>
    );
  }

  if (isError) {
    return (
      <div
        style={{
          padding: '32px 16px',
          textAlign: 'center',
          color: 'var(--color-pebble-grey)',
          fontSize: '14px',
          fontFamily: 'var(--font-sans)',
        }}
      >
        {error instanceof Error ? error.message : 'Search failed. Try again.'}
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div style={{ padding: '32px 16px', textAlign: 'center', fontFamily: 'var(--font-sans)' }}>
        <div
          style={{
            fontWeight: 600,
            color: 'var(--color-deep-grey)',
            fontSize: '18px',
            marginBottom: '8px',
          }}
        >
          No results found.
        </div>
        <div style={{ color: 'var(--color-pebble-grey)', fontSize: '14px' }}>Try a different search term.</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        style={{
          fontSize: '12px',
          fontWeight: 600,
          color: 'var(--color-deep-grey)',
          fontFamily: 'var(--font-sans)',
          textAlign: 'center',
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
        }}
      >
        {results.length} result{results.length !== 1 ? 's' : ''}
      </div>
      {results.map((result) => {
        const baseHref =
          result.type === 'note' && result.threadId
            ? idToUrl(result.id, result.threadId)
            : idToUrl(result.id);
        const href = appendSpaceQueryParam(baseHref, spaceForHref);
        return (
          <a
            key={result.id}
            href={href}
            className="block transition-transform duration-200 hover:scale-[1.002] active:scale-[0.99]"
            style={{ textDecoration: 'none' }}
          >
            <SearchResultRow result={result} />
          </a>
        );
      })}
    </div>
  );
}
