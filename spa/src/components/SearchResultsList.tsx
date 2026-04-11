import { useEffect } from 'react';
import SearchResultRow from '../../../src/components/react/SearchResultRow';
import { idToUrl } from '../../../src/utils/url-helpers';
import {
  addRecentSearchTerm,
  type RecentSearchStorageScope,
} from '../../../src/utils/recent-search-storage';
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
}

export default function SearchResultsList({
  query,
  scope,
  recentSearchCountSync,
}: SearchResultsListProps) {
  const trimmed = query.trim();
  const { data, isLoading, isError, error } = useSearch(trimmed, scope);

  useEffect(() => {
    if (recentSearchCountSync === undefined) return;
    if (trimmed.length < 2) return;
    if (isLoading || isError) return;
    if (data?.results === undefined) return;
    addRecentSearchTerm(recentSearchCountSync, trimmed, { resultCount: data.results.length });
  }, [recentSearchCountSync, trimmed, isLoading, isError, data?.results]);

  const results: SearchResult[] = data?.results ?? [];

  if (!trimmed) return null;

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
          color: 'var(--color-pebble-grey)',
          fontFamily: 'var(--font-sans)',
          textAlign: 'center',
        }}
      >
        {results.length} result{results.length !== 1 ? 's' : ''}
      </div>
      {results.map((result) => (
        <a
          key={result.id}
          href={idToUrl(result.id)}
          className="block transition-transform duration-200 hover:scale-[1.002] active:scale-[0.99]"
          style={{ textDecoration: 'none' }}
        >
          <SearchResultRow result={result} />
        </a>
      ))}
    </div>
  );
}
