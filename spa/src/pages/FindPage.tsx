import { useState, useEffect, useRef } from 'react';
import FindSearchInput from '../../../src/components/react/FindSearchInput';
import RecentSearches from '../../../src/components/react/RecentSearches';
import CardStack from '../components/CardStack';
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
    <div className="flex flex-col gap-2" style={{ padding: '8px 0' }}>
      <div style={{ fontSize: '12px', color: 'var(--color-pebble-grey)', fontFamily: 'var(--font-sans)', padding: '0 4px 4px' }}>
        {results.length} result{results.length !== 1 ? 's' : ''}
      </div>
      {results.map(result => (
        <a
          key={result.id}
          href={idToUrl(result.id)}
          className="block"
          style={{
            padding: '12px 14px',
            borderRadius: '10px',
            background: 'var(--color-white)',
            border: '1px solid var(--color-border)',
            textDecoration: 'none',
          }}
        >
          <div style={{
            fontSize: '13px',
            fontWeight: 500,
            color: 'var(--color-pebble-grey)',
            fontFamily: 'var(--font-sans)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '4px',
          }}>
            {result.type === 'thread' ? 'Thread' : 'Note'}
          </div>
          <div style={{
            fontSize: '16px',
            fontWeight: 600,
            color: 'var(--color-deep-grey)',
            fontFamily: 'var(--font-sans)',
            marginBottom: result.content ? '6px' : 0,
          }}>
            {result.title || 'Untitled'}
          </div>
          {result.content && (
            <div style={{
              fontSize: '14px',
              color: 'var(--color-pebble-grey)',
              fontFamily: 'var(--font-sans)',
              lineHeight: '1.4',
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}>
              {result.content.replace(/<[^>]*>/g, '')}
            </div>
          )}
        </a>
      ))}
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
      <FindSearchInput initialQuery={query} />
      {query ? (
        <SearchResults query={query} />
      ) : (
        <RecentSearches />
      )}
    </CardStack>
  );
}
