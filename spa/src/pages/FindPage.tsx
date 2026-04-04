import { useQueryClient } from '@tanstack/react-query';
import { useRouterState } from '@tanstack/react-router';
import FindSearchInput from '../../../src/components/react/FindSearchInput';
import RecentSearches from '../../../src/components/react/RecentSearches';
import CardStack from '../components/CardStack';
import SearchResultsList, { fetchSearchResults, searchQueryKey } from '../components/SearchResultsList';

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
      queryKey: searchQueryKey(term),
      queryFn: () => fetchSearchResults(term),
    });
  };

  return (
    <CardStack title="Search" headerBgColor="var(--color-paper)" centerTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <FindSearchInput initialQuery={query} onBeforeSearchNavigate={prefetchSearch} />
        {query ? (
          <SearchResultsList query={query} recentSearchCountSync={null} />
        ) : (
          <RecentSearches onPrefetchSearch={prefetchSearch} />
        )}
      </div>
    </CardStack>
  );
}
