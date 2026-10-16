/**
 * "My Bible" — every chapter you have read, written on or highlighted.
 *
 * Mounted by Home (inside `useHomeSurfaceData`) so the map opens on data that is already here,
 * and by the reader, which reads the same cache. Refreshed through `invalidateStudyFeed`: the
 * writes that move Activity are the writes that move the map.
 *
 * A guest has no account to have been anywhere with, so the request is not made.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';
import { useHarvousIdentity } from '../useHarvousIdentity';
import type { BibleCoverage } from '@/utils/bible-coverage';
import { BIBLE_COVERAGE_QUERY_KEY } from '@/utils/study-feed-invalidation';

export { BIBLE_COVERAGE_QUERY_KEY };

export function useBibleCoverage() {
  const authReady = useAuthReady();
  const { isGuest } = useHarvousIdentity();

  return useQuery({
    queryKey: BIBLE_COVERAGE_QUERY_KEY,
    queryFn: async (): Promise<BibleCoverage> => {
      const res = await api.get<BibleCoverage & { success: boolean }>('/api/study-bible/coverage');
      return { books: res.books ?? [] };
    },
    enabled: authReady && !isGuest,
    staleTime: 60_000,
  });
}
