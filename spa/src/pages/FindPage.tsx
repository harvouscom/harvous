import { useState, useEffect, useRef } from 'react';
import FindSearchInput from '../../../src/components/react/FindSearchInput';
import RecentSearches from '../../../src/components/react/RecentSearches';
import CardStack from '../components/CardStack';
import CardNote from '../../../src/components/react/CardNote';
import CardThread from '../../../src/components/react/CardThread';
import CondensedNoteItem from '../../../src/components/react/CondensedNoteItem';
import { idToUrl } from '../../../src/utils/url-helpers';

interface SearchResult {
  id: string;
  type: 'note' | 'thread';
  title: string;
  content?: string;
  subtitle?: string;
  color?: string;
  threadId?: string;
  spaceId?: string;
  noteType?: string;
  lastUpdated?: string;
}

function SearchResults({ query }: { query: string }) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    // Abort any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);

    fetch(`/api/search?q=${encodeURIComponent(query.trim())}&type=all`, {
      credentials: 'include',
      signal: controller.signal,
    })
      .then(r => r.json())
      .then(data => {
        if (!controller.signal.aborted) {
          const items: SearchResult[] = data.results || [];
          setResults(items);

          // Update recent search count in localStorage
          try {
            const stored = JSON.parse(localStorage.getItem('harvous-recent-searches') || '[]');
            const updated = stored.map((s: any) => {
              const term = typeof s === 'string' ? s : s.term;
              if (term === query.trim()) return { term, count: items.length };
              return s;
            });
            localStorage.setItem('harvous-recent-searches', JSON.stringify(updated));
            window.dispatchEvent(new CustomEvent('recent-searches-updated'));
          } catch {}

          setIsLoading(false);
        }
      })
      .catch(err => {
        if (err.name !== 'AbortError') {
          setError('Search failed. Try again.');
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [query]);

  if (!query.trim()) return null;

  if (isLoading) {
    return (
      <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--color-pebble-grey)', fontSize: '14px', fontFamily: 'var(--font-sans)' }}>
        Searching...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--color-pebble-grey)', fontSize: '14px', fontFamily: 'var(--font-sans)' }}>
        {error}
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

export default function FindPage() {
  // Read ?q= from the URL (TanStack Router doesn't auto-parse search params here,
  // so we read window.location directly and listen for changes)
  const [query, setQuery] = useState(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('q') || '';
  });

  useEffect(() => {
    const sync = () => {
      setQuery(new URLSearchParams(window.location.search).get('q') || '');
    };
    window.addEventListener('popstate', sync);
    // TanStack Router fires this on navigation
    const unsubscribe = (window as any).__tanstackRouter?.subscribe?.(() => sync()) ?? (() => {});
    return () => {
      window.removeEventListener('popstate', sync);
      unsubscribe();
    };
  }, []);

  // Also poll for URL changes since TanStack Router may use history.pushState/replaceState
  useEffect(() => {
    let last = window.location.search;
    const interval = setInterval(() => {
      if (window.location.search !== last) {
        last = window.location.search;
        setQuery(new URLSearchParams(last).get('q') || '');
      }
    }, 100);
    return () => clearInterval(interval);
  }, []);

  return (
    <CardStack title="Search" headerBgColor="var(--color-paper)" centerTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <FindSearchInput initialQuery={query} />
        {query ? (
          <SearchResults query={query} />
        ) : (
          <RecentSearches />
        )}
      </div>
    </CardStack>
  );
}
