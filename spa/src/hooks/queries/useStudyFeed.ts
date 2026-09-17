import { useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';
import {
  mergeStudyFeedPages,
  mergeStudyFeedReviewAnswers,
  resolveStudyFeedLockedBefore,
  serializeStudyFeedScope,
  studyFeedItemNoteId,
  STUDY_FEED_SCOPE_ALL,
  type StudyFeedItem,
  type StudyFeedResponse,
  type StudyFeedScope,
} from '@/utils/study-feed-items';
import { isNoteDeleted, subscribeDeletedNotes } from '../../pages/prototype/proto-deleted-notes';

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
  const [deletedTick, setDeletedTick] = useState(0);
  useEffect(() => subscribeDeletedNotes(() => setDeletedTick((n) => n + 1)), []);

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
    /*
     * A minute keeps a tab switch from refetching the trail. It is only safe because writes
     * invalidate this key through `invalidateStudyFeed`, which is enforced by
     * `study-feed-invalidation.test.ts` — the comment that used to sit here asserted the same
     * thing on trust, and was wrong for four of the six sources the server builds the feed from.
     */
    staleTime: 60_000,
  });

  const items: StudyFeedItem[] = useMemo(() => {
    const merged = mergeStudyFeedPages(
      query.data?.pages.map((page) => page.items ?? []) ?? [],
    );
    return merged.filter((item) => {
      const noteId = studyFeedItemNoteId(item);
      return !noteId || !isNoteDeleted(noteId);
    });
  }, [query.data, deletedTick]);

  const reviewAnswers = mergeStudyFeedReviewAnswers(
    query.data?.pages.map((page) => page.reviewAnswers) ?? [],
  );
  const lockedBefore = resolveStudyFeedLockedBefore(
    query.data?.pages.map((page) => page.lockedBefore),
  );

  return { ...query, items, reviewAnswers, lockedBefore };
}
