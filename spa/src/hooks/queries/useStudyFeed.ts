import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';
import {
  mergeStudyFeedPages,
  mergeStudyFeedReviewAnswers,
  serializeStudyFeedScope,
  STUDY_FEED_SCOPE_ALL,
  type StudyFeedItem,
  type StudyFeedResponse,
  type StudyFeedScope,
} from '@/utils/study-feed-items';

export const studyFeedQueryKey = (scope: StudyFeedScope) =>
  ['study-feed', serializeStudyFeedScope(scope)] as const;

/**
 * The study trail, oldest page fetched on demand.
 *
 * Paged by timestamp rather than offset because the sources are event logs that keep
 * growing at the head: an offset would slide under the reader every time something new was
 * recorded while they were reading. The cursor names a moment instead, which stays put.
 *
 * Pages are merged by item id, not concatenated — a collapsed span sitting across a page
 * boundary comes back on the next page with a longer span, and the newer version should
 * replace the shorter one rather than appear beside it.
 */
export function useStudyFeed(scope: StudyFeedScope = STUDY_FEED_SCOPE_ALL) {
  const authReady = useAuthReady();

  const query = useInfiniteQuery({
    queryKey: studyFeedQueryKey(scope),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ scope: serializeStudyFeedScope(scope) });
      if (pageParam) params.set('before', pageParam);
      return api.get<StudyFeedResponse>(`/api/study-feed?${params.toString()}`);
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: authReady,
    // The feed only changes when the reader does something, and everything they do here
    // invalidates it explicitly. A minute keeps a tab switch from refetching the trail.
    staleTime: 60_000,
  });

  const items: StudyFeedItem[] = mergeStudyFeedPages(
    query.data?.pages.map((page) => page.items ?? []) ?? [],
  );

  const reviewAnswers = mergeStudyFeedReviewAnswers(
    query.data?.pages.map((page) => page.reviewAnswers) ?? [],
  );

  return { ...query, items, reviewAnswers };
}
