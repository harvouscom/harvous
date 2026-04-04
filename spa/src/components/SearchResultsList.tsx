import { useEffect } from 'react';
import CardNote from '../../../src/components/react/CardNote';
import CardThread from '../../../src/components/react/CardThread';
import CondensedNoteItem from '../../../src/components/react/CondensedNoteItem';
import { idToUrl } from '../../../src/utils/url-helpers';
import {
  recentSearchStorageKey,
  recentSearchesUpdatedEvent,
  type RecentSearchStorageScope,
} from '../../../src/utils/recent-search-storage';
import { api } from '../lib/api';
import { useSearch, type SearchResult, type SearchScope } from '../hooks/queries/useSearch';

export type { SearchScope } from '../hooks/queries/useSearch';

export interface SearchResultsListProps {
  query: string;
  scope?: SearchScope;
  /**
   * Sync result counts into the matching recent-search list.
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
    if (recentSearchCountSync === undefined || !trimmed || !data?.results) return;
    try {
      const key = recentSearchStorageKey(recentSearchCountSync);
      const stored = JSON.parse(localStorage.getItem(key) || '[]');
      const updated = stored.map((s: { term?: string } | string) => {
        const term = typeof s === 'string' ? s : s.term;
        if (term === trimmed) return { term, count: data.results.length };
        return s;
      });
      localStorage.setItem(key, JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent(recentSearchesUpdatedEvent(recentSearchCountSync)));
    } catch {
      /* ignore */
    }
  }, [recentSearchCountSync, trimmed, data?.results]);

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
      {results.map((result) =>
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
                subtitle: result.subtitle ?? undefined,
                color: result.color ?? undefined,
                accentColor: result.color ? `var(--color-${result.color})` : undefined,
                lastUpdated: result.lastUpdated ?? undefined,
              }}
            />
          </a>
        ) : result.noteType === 'scripture' ? (
          <CondensedNoteItem
            key={result.id}
            title={result.title || 'Untitled'}
            noteType="scripture"
            noteId={result.id}
            scriptureTranslation={result.scriptureTranslation ?? result.version ?? undefined}
            href={idToUrl(result.id)}
            threadColors={result.threadColors}
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
              content={result.content ?? undefined}
              noteType={(result.noteType as 'default' | 'scripture' | 'resource') || 'default'}
              noteId={result.id}
              threadColors={result.threadColors}
            />
          </a>
        ),
      )}
    </div>
  );
}

export function searchQueryKey(query: string, scope?: SearchScope) {
  const q = query.trim();
  return ['search', q, scope?.threadId ?? null, scope?.spaceId ?? null] as const;
}

export function fetchSearchResults(query: string, scope?: SearchScope) {
  const q = query.trim();
  const params: Record<string, string> = { q };
  if (scope?.threadId) params.threadId = scope.threadId;
  if (scope?.spaceId) params.spaceId = scope.spaceId;
  return api.get<{ results: SearchResult[] }>('/api/search', params);
}
