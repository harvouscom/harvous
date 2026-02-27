import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouterState } from '@tanstack/react-router';
import FindSearchInput from '../../../src/components/react/FindSearchInput';
import RecentSearches from '../../../src/components/react/RecentSearches';
import CardStack from '../components/CardStack';
import CardNote from '../../../src/components/react/CardNote';
import CardThread from '../../../src/components/react/CardThread';
import CondensedNoteItem from '../../../src/components/react/CondensedNoteItem';
import { idToUrl } from '../../../src/utils/url-helpers';
import { useSearch, type SearchResult } from '../hooks/queries/useSearch';
import { api } from '../lib/api';

function SearchResults({ query }: { query: string }) {
  const trimmed = query.trim();
  const { data, isLoading, isError, error } = useSearch(trimmed);

  // Update recent search count in localStorage when results load
  useEffect(() => {
    if (!trimmed || !data?.results) return;
    try {
      const stored = JSON.parse(localStorage.getItem('harvous-recent-searches') || '[]');
      const updated = stored.map((s: any) => {
        const term = typeof s === 'string' ? s : s.term;
        if (term === trimmed) return { term, count: data.results.length };
        return s;
      });
      localStorage.setItem('harvous-recent-searches', JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('recent-searches-updated'));
    } catch {}
  }, [trimmed, data?.results]);

  const results: SearchResult[] = data?.results ?? [];

  if (!trimmed) return null;

  if (isLoading) {
    return (
      <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--color-pebble-grey)', fontSize: '14px', fontFamily: 'var(--font-sans)' }}>
        Searching...
      </div>
    );
  }

  if (isError) {
    return (
      <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--color-pebble-grey)', fontSize: '14px', fontFamily: 'var(--font-sans)' }}>
        {error instanceof Error ? error.message : 'Search failed. Try again.'}
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div style={{ padding: '32px 16px', textAlign: 'center', fontFamily: 'var(--font-sans)' }}>
        <div style={{ fontWeight: 600, color: 'var(--color-deep-grey)', fontSize: '18px', marginBottom: '8px' }}>
          No results found.
        </div>
        <div style={{ color: 'var(--color-pebble-grey)', fontSize: '14px' }}>
          Try a different search term.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div style={{ fontSize: '12px', color: 'var(--color-pebble-grey)', fontFamily: 'var(--font-sans)', textAlign: 'center' }}>
        {results.length} result{results.length !== 1 ? 's' : ''}
      </div>
      {results.map(result =>
        result.type === 'thread' ? (
          <a
            key={result.id}
            href={idToUrl(result.id)}
            className="block transition-transform duration-200 hover:scale-[1.002] active:scale-[0.99]"
            style={{ textDecoration: 'none' }}
          >
            <CardThread
              thread={{
                id: result.id,
                title: result.title || 'Untitled',
                subtitle: result.subtitle,
                color: result.color,
                accentColor: result.color ? `var(--color-${result.color})` : undefined,
                lastUpdated: result.lastUpdated,
              }}
            />
          </a>
        ) : result.noteType === 'scripture' ? (
          <CondensedNoteItem
            key={result.id}
            title={result.title || 'Untitled'}
            noteType="scripture"
            noteId={result.id}
            href={idToUrl(result.id)}
          />
        ) : (
          <a
            key={result.id}
            href={idToUrl(result.id)}
            className="block transition-transform duration-200 hover:scale-[1.002] active:scale-[0.99]"
            style={{ textDecoration: 'none' }}
          >
            <CardNote
              title={result.title || 'Untitled'}
              content={result.content}
              noteType={(result.noteType as 'default' | 'scripture' | 'resource') || 'default'}
              noteId={result.id}
            />
          </a>
        )
      )}
    </div>
  );
}

function getSearchQueryFromRouter(search: string | Record<string, unknown> | undefined): string {
  if (search == null) return '';
  if (typeof search === 'object' && 'q' in search && typeof (search as { q?: string }).q === 'string') {
    return (search as { q: string }).q;
  }
  if (typeof search !== 'string') return '';
  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  return params.get('q') || '';
}

export default function FindPage() {
  const queryClient = useQueryClient();
  const locationSearch = useRouterState({ select: (s) => s.location.search });
  const query = getSearchQueryFromRouter(locationSearch);

  const prefetchSearch = (term: string) => {
    if (!term.trim()) return;
    queryClient.prefetchQuery({
      queryKey: ['search', term.trim()],
      queryFn: () => api.get<{ results: SearchResult[] }>('/api/search', { q: term.trim() }),
    });
  };

  return (
    <CardStack title="Search" headerBgColor="var(--color-paper)" centerTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <FindSearchInput initialQuery={query} onBeforeSearchNavigate={prefetchSearch} />
        {query ? (
          <SearchResults query={query} />
        ) : (
          <RecentSearches onPrefetchSearch={prefetchSearch} />
        )}
      </div>
    </CardStack>
  );
}
