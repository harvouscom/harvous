import type { QueryClient } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';
import type { ReadingDwellBucket } from '@/utils/reading-event-kinds';
import { invalidateStudyFeed, STUDY_FEED_QUERY_KEY } from '@/utils/study-feed-invalidation';
import {
  preferFresherLastRead,
  readLocalLastRead,
  writeLocalLastRead,
  type LastReadPosition,
} from '@/utils/last-read-position';

export interface ReadingHistoryChapter {
  book: string;
  bookOrder: number;
  chapter: number;
  dwellBucket: ReadingDwellBucket;
  createdAt: string;
  lastReadAt?: string | null;
}

export interface ReadingHistoryResponse {
  success: boolean;
  lastRead: LastReadPosition | null;
  chapters: ReadingHistoryChapter[];
}

export const readingHistoryQueryKey = ['reading', 'recent'] as const;

export { STUDY_FEED_QUERY_KEY };

export function patchReadingHistoryLastRead(
  queryClient: QueryClient,
  lastRead: LastReadPosition,
): void {
  writeLocalLastRead(lastRead);
  queryClient.setQueryData<ReadingHistoryResponse>(readingHistoryQueryKey, (current) => ({
    success: true,
    lastRead: preferFresherLastRead(current?.lastRead, lastRead),
    chapters: current?.chapters ?? [],
  }));
}

/**
 * Refresh Activity. Do not refetch last-read: the patch is already the latest chapter,
 * and a GET that left before this write used to roll the cache back until a full refresh.
 */
export function invalidateReadingSurfaces(queryClient: QueryClient): void {
  invalidateStudyFeed(queryClient);
}

export function useReadingHistory() {
  const authReady = useAuthReady();
  return useQuery({
    queryKey: readingHistoryQueryKey,
    queryFn: async () => {
      const res = await api.get<ReadingHistoryResponse>('/api/reading/recent');
      const lastRead = preferFresherLastRead(
        preferFresherLastRead(readLocalLastRead(), res.lastRead),
        readLocalLastRead(),
      );
      if (lastRead) writeLocalLastRead(lastRead);
      return { ...res, lastRead };
    },
    enabled: authReady,
    staleTime: 30_000,
  });
}
