/**
 * The reader's own recent searches, for the unanswered-question card.
 *
 * Gated on `useAuthReady` like every other authed query here — a cold-start fetch before the
 * token exists comes back 401 and then sits cached as an error, which is what
 * `npm run check:auth-gated-queries` exists to prevent.
 *
 * Cached generously. The card is derived from days of history, so a request per panel open
 * would be spending network on an answer that cannot have changed.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';
import type { SearchEventAction } from '@/utils/search-event-kinds';

export type SearchEventRow = {
  query: string;
  action: SearchEventAction;
  resultCount: number;
  createdAt: string;
};

type Response = { events?: SearchEventRow[] };

export function useSearchEvents() {
  const authReady = useAuthReady();
  return useQuery({
    queryKey: ['search-events-recent'],
    enabled: authReady,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const res = await api.get<Response>('/api/search/events/recent');
      return res.events ?? [];
    },
  });
}
