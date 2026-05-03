import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useRouterState } from '@tanstack/react-router';
import { MIN_SEARCH_QUERY_LENGTH } from '@/utils/search-query';
import { fetchSearchResults, searchQueryKey } from '../../../../src/hooks/useSearch';
import { useNavigation, type NavSpace } from '../../hooks/queries/useNavigation';
import PrototypeSearchInput from './components/PrototypeSearchInput';
import PrototypeSearchResultsList from './PrototypeSearchResultsList';

function mergeSpaces(spaces: NavSpace[], memberOf: NavSpace[]): NavSpace[] {
  const map = new Map<string, NavSpace>();
  for (const s of spaces) map.set(s.id, s);
  for (const s of memberOf) if (!map.has(s.id)) map.set(s.id, s);
  return Array.from(map.values());
}

export default function PrototypeSearchPage() {
  const queryClient = useQueryClient();
  const { data: nav, isLoading: navLoading } = useNavigation();

  const spaceList = useMemo(
    () => mergeSpaces(nav?.spaces ?? [], nav?.memberOfSpaces ?? []),
    [nav?.spaces, nav?.memberOfSpaces],
  );

  const searchRaw = useRouterState({ select: (s) => s.location.search });
  const spaceFromRouter =
    searchRaw &&
    typeof searchRaw === 'object' &&
    searchRaw !== null &&
    typeof (searchRaw as Record<string, unknown>).space === 'string'
      ? ((searchRaw as Record<string, unknown>).space as string)
      : undefined;

  const normalizedSpace =
    typeof spaceFromRouter === 'string' && spaceFromRouter.startsWith('space_')
      ? spaceFromRouter
      : typeof spaceFromRouter === 'string' && spaceFromRouter.length > 0
        ? `space_${spaceFromRouter}`
        : undefined;

  const [query, setQuery] = useState('');

  const prefetchSearch = (term: string) => {
    const t = term.trim();
    if (!t || t.length < MIN_SEARCH_QUERY_LENGTH || !normalizedSpace) return;
    queryClient.prefetchQuery({
      queryKey: searchQueryKey(t, { spaceId: normalizedSpace }, 'notes'),
      queryFn: () => fetchSearchResults(t, { spaceId: normalizedSpace }, 'notes'),
    });
  };

  if (!navLoading && spaceList.length > 0 && !normalizedSpace) {
    return (
      <div className="proto-search-container">
        <h1 className="pds-title" style={{ marginBottom: 6 }}>
          Search
        </h1>
        <p className="proto-caption" style={{ marginBottom: 20 }}>
          Choose a space to search notes.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {spaceList.map((s) => (
            <Link
              key={s.id}
              to="/prototype/search"
              search={{ space: s.id }}
              className="proto-search-result-row"
              style={{ textDecoration: 'none' }}
            >
              <span className="proto-search-result-row__title">{s.title || 'Untitled space'}</span>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  if (!normalizedSpace && !navLoading) {
    return (
      <div className="proto-search-container">
        <p className="proto-caption">No spaces yet. Create one in the classic app.</p>
        <Link to="/prototype" className="proto-link-quiet" style={{ display: 'block', marginTop: 10 }}>
          ← Back
        </Link>
      </div>
    );
  }

  return (
    <div className="proto-search-container">
      <h1 className="pds-title" style={{ marginBottom: 14 }}>
        Search notes
      </h1>
      <PrototypeSearchInput
        value={query}
        onChange={(v) => {
          setQuery(v);
          prefetchSearch(v);
        }}
        placeholder="Search notes in this space…"
        autoFocus
      />
      {normalizedSpace ? <PrototypeSearchResultsList query={query} spaceId={normalizedSpace} /> : null}
    </div>
  );
}
