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

interface ReadingHistoryResponse {
  success: boolean;
  /** Where the reader was last, already parsed server-side. Null until something is read. */
  lastRead: LastReadPosition | null;
  chapters: ReadingHistoryChapter[];
}

export const readingHistoryQueryKey = ['reading', 'recent'] as const;

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
    // at most one card pointing a chapter behind.
    staleTime: 5 * 60_000,
  });
}
