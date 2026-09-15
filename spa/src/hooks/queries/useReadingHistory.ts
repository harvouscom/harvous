import type { QueryClient } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';
import type { ReadingDwellBucket } from '@/utils/reading-event-kinds';
import type { LastReadPosition } from '@/utils/last-read-position';

export interface ReadingHistoryChapter {
  book: string;
  bookOrder: number;
  chapter: number;
  dwellBucket: ReadingDwellBucket;
  createdAt: string;
  /**
   * When it was last actually read, glances excluded. Null for a chapter only ever glanced at.
   *
   * Optional because a client can be newer than the server it is talking to, and a card that
   * reads "you read this today" must not appear on the strength of a field that arrived
   * undefined.
   */
  lastReadAt?: string | null;
}

export interface ReadingHistoryResponse {
  success: boolean;
  /** Where the reader was last, already parsed server-side. Null until something is read. */
  lastRead: LastReadPosition | null;
  chapters: ReadingHistoryChapter[];
}

export const readingHistoryQueryKey = ['reading', 'recent'] as const;

export const STUDY_FEED_QUERY_KEY = ['study-feed'] as const;

/**
 * Paint the new position onto Home / Activity before the server round-trip returns.
 *
 * `useReadingHistory` holds for five minutes. Invalidating only after `/api/user/update-last-read`
 * succeeds leaves a window where going back to Activity still shows the chapter the session
 * started on. The continue card reads this cache, so writing the position here is what makes
 * "where you left off" match the chapter that just opened.
 */
export function patchReadingHistoryLastRead(
  queryClient: QueryClient,
  lastRead: LastReadPosition,
): void {
  queryClient.setQueryData<ReadingHistoryResponse>(readingHistoryQueryKey, (current) => ({
    success: true,
    lastRead,
    chapters: current?.chapters ?? [],
  }));
}

/** Mark Home's continue card and Activity's trail stale after a reading write lands. */
export function invalidateReadingSurfaces(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: readingHistoryQueryKey });
  void queryClient.invalidateQueries({ queryKey: STUDY_FEED_QUERY_KEY });
}

/**
 * Which chapters this user has been through, collapsed to one entry each.
 *
 * The only signal Harvous has about reading that does not come from what someone wrote, so
 * it is what lets Home tell "read and moved on" apart from "never opened". The endpoint
 * degrades to an empty list on a pre-migration database, so a failure here means "no
 * continue-reading card", never a broken Home.
 */
export function useReadingHistory() {
  const authReady = useAuthReady();
  return useQuery({
    queryKey: readingHistoryQueryKey,
    queryFn: () => api.get<ReadingHistoryResponse>('/api/reading/recent'),
    enabled: authReady,
    // Reading history changes only when someone finishes a chapter, and a stale read costs
    // at most one card pointing a chapter behind — unless we patch / invalidate explicitly
    // after a session, which useReadingSession now does.
    staleTime: 5 * 60_000,
  });
}
