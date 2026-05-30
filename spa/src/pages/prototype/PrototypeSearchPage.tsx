import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouterState } from '@tanstack/react-router';
import { MIN_SEARCH_QUERY_LENGTH } from '@/utils/search-query';
import { fetchSearchResults, searchQueryKey } from '../../../../src/hooks/useSearch';
import { usePrototypeHomeSpaceId } from '../../hooks/usePrototypeHomeSpaceId';
import PrototypeSearchInput from './components/PrototypeSearchInput';
import PrototypeSearchResultsList from './PrototypeSearchResultsList';

export default function PrototypeSearchPage() {
  const queryClient = useQueryClient();
  const { homeSpaceId, navReady } = usePrototypeHomeSpaceId();

  const searchRaw = useRouterState({ select: (s) => s.location.search });
  const spaceFromRouter =
    searchRaw &&
    typeof searchRaw === 'object' &&
    searchRaw !== null &&
    typeof (searchRaw as Record<string, unknown>).space === 'string'
      ? ((searchRaw as Record<string, unknown>).space as string)
      : undefined;

  const normalizedFromQuery =
    typeof spaceFromRouter === 'string' && spaceFromRouter.startsWith('space_')
      ? spaceFromRouter
      : typeof spaceFromRouter === 'string' && spaceFromRouter.length > 0
        ? `space_${spaceFromRouter}`
        : undefined;

  const normalizedSpace = normalizedFromQuery ?? homeSpaceId;

  const [query, setQuery] = useState('');

  const prefetchSearch = (term: string) => {
    const t = term.trim();
    if (!t || t.length < MIN_SEARCH_QUERY_LENGTH || !normalizedSpace) return;
    queryClient.prefetchQuery({
      queryKey: searchQueryKey(t, { spaceId: normalizedSpace }, 'notes'),
      queryFn: () => fetchSearchResults(t, { spaceId: normalizedSpace }, 'notes'),
    });
  };

  if (!navReady) {
    return (
      <div className="proto-search-container">
        <p className="proto-caption">Loading…</p>
      </div>
    );
  }

  if (!homeSpaceId) {
    return (
      <div className="proto-search-container">
        <p className="proto-caption">Loading My Home…</p>
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
        placeholder="Search notes in My Home…"
        autoFocus
      />
      <PrototypeSearchResultsList query={query} spaceId={normalizedSpace} />
    </div>
  );
}
