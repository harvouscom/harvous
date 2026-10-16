/**
 * "Our Bible" — a shared space's map, or a Family Space's books (server: GET
 * /api/spaces/:id/bible-coverage).
 *
 * Keyed under My Bible's key, so `invalidateStudyFeed`'s prefix refreshes it after your own
 * notes and highlights; other members' writes arrive with the staleTime. Fetched by the space
 * hub with the page, so the map opens on data already here.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';
import { coverageFromBooks, type BibleCoverage, type BibleCoverageBook } from '@/utils/bible-coverage';
import { BIBLE_COVERAGE_QUERY_KEY } from '@/utils/study-feed-invalidation';

export type SpaceBibleCoverage =
  | { kind: 'space'; coverage: BibleCoverage }
  /** Book names only; `youShare` is whether your own books are among them. */
  | { kind: 'family'; coverage: BibleCoverage; youShare: boolean };

export function spaceBibleCoverageKey(spaceId: string | null | undefined) {
  return [...BIBLE_COVERAGE_QUERY_KEY, 'space', spaceId ?? 'none'] as const;
}

type Payload =
  | { kind: 'space'; books?: BibleCoverageBook[] }
  | { kind: 'family'; books?: string[]; youShare?: boolean };

export function useSpaceBibleCoverage(spaceId: string | null | undefined, enabled = true) {
  const authReady = useAuthReady();
  return useQuery({
    queryKey: spaceBibleCoverageKey(spaceId),
    queryFn: async (): Promise<SpaceBibleCoverage> => {
      const res = await api.get<Payload>(`/api/spaces/${encodeURIComponent(spaceId!)}/bible-coverage`);
      if (res.kind === 'family') {
        return { kind: 'family', coverage: coverageFromBooks(res.books ?? []), youShare: res.youShare === true };
      }
      return { kind: 'space', coverage: { books: res.books ?? [] } };
    },
    enabled: authReady && enabled && !!spaceId,
    staleTime: 60_000,
  });
}

/** Add your books to the family's Bible, or take them back. */
export function useShareFamilyBibleBooks(spaceId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (share: boolean) => api.post<{ sharing: boolean }>('/api/family/bible-books', { share }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: spaceBibleCoverageKey(spaceId) });
    },
  });
}
