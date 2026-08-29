import { useEffect } from 'react';
import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';
import {
  mergeStudyFeedPages,
  serializeStudyFeedScope,
  STUDY_FEED_SCOPE_ALL,
  type StudyFeedItem,
  type StudyFeedResponse,
  type StudyFeedScope,
} from '@/utils/study-feed-items';

export const studyFeedQueryKey = (scope: StudyFeedScope) =>
  ['study-feed', serializeStudyFeedScope(scope)] as const;

/*
 * First-paint snapshot, the same bargain `useSpaceNotes` and `useNavigation` already
 * strike: the last fetched first page goes into sessionStorage, and the next boot hands it
 * back as `initialData` with `initialDataUpdatedAt: 0`. The zero is the load-bearing part —
 * it marks the snapshot as infinitely stale, so React Query paints it and refetches in the
 * same breath. Navigation's docblock records what the wrong variant did (a synthetic fresh
 * timestamp made stale nav look current for the whole staleTime window); this is the other
 * one.
 *
 * The feed was the only query on Activity's first paint without a snapshot, which is why
 * the page alone greeted a reload with loading dots while the sidebar's lists came up
 * instantly. One page per scope; sessionStorage so it lives exactly as long as the tab,
 * like the caches it copies.
 *
 * `v` guards the shape: a snapshot written by an older build is dropped rather than parsed
 * into whatever the items have since become.
 */
const FEED_SNAPSHOT_PREFIX = 'harvous-study-feed-snapshot-';
const FEED_SNAPSHOT_VERSION = 1;

export function readFeedSnapshot(scopeKey: string): StudyFeedResponse | undefined {
  try {
    const raw = sessionStorage.getItem(`${FEED_SNAPSHOT_PREFIX}${scopeKey}`);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { v?: number; page?: StudyFeedResponse };
    if (parsed?.v !== FEED_SNAPSHOT_VERSION || !Array.isArray(parsed.page?.items)) return undefined;
    return parsed.page;
  } catch {
    return undefined;
  }
}

export function writeFeedSnapshot(scopeKey: string, page: StudyFeedResponse): void {
  try {
    sessionStorage.setItem(
      `${FEED_SNAPSHOT_PREFIX}${scopeKey}`,
      JSON.stringify({ v: FEED_SNAPSHOT_VERSION, page }),
    );
  } catch {
    /* Quota or storage disabled — the next boot simply shows the dots again. */
  }
}

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
  const scopeKey = serializeStudyFeedScope(scope);

  const snapshot = readFeedSnapshot(scopeKey);
  const initialData: InfiniteData<StudyFeedResponse, string | null> | undefined = snapshot
    ? { pages: [snapshot], pageParams: [null] }
    : undefined;

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
    initialData,
    /* Zero, not now — see the snapshot note above. */
    initialDataUpdatedAt: initialData ? 0 : undefined,
    // The feed only changes when the reader does something, and everything they do here
    // invalidates it explicitly. A minute keeps a tab switch from refetching the trail.
    staleTime: 60_000,
  });

  /* Keep the snapshot current: whatever the newest first page is, the next boot paints it.
     Writing back the page we just seeded is a no-op by content, so no dirty-tracking. */
  const firstPage = query.data?.pages[0];
  useEffect(() => {
    if (firstPage) writeFeedSnapshot(scopeKey, firstPage);
  }, [scopeKey, firstPage]);

  const items: StudyFeedItem[] = mergeStudyFeedPages(
    query.data?.pages.map((page) => page.items ?? []) ?? [],
  );

  return { ...query, items };
}
