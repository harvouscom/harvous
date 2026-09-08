import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';
import type { ServerRecallHistoryEntry } from '../../pages/prototype/proto-recall-cooldown';

interface RecallEventHistoryResponse {
  success: boolean;
  events: ServerRecallHistoryEntry[];
}

export const recallEventHistoryQueryKey = (spaceId?: string | null) =>
  ['recall', 'events', 'recent', spaceId ?? 'home'] as const;

/**
 * Recent recall opens/snoozes for this user, so a card acted on or dismissed on one
 * device stops resurfacing on the others. Merged with the localStorage cooldown store by
 * `mergeServerRecallHistoryIntoCooldowns` — never used on its own, so suppression keeps
 * working offline.
 *
 * The endpoint degrades to an empty list on a pre-migration database, so a failure here
 * only means "no cross-device history", never a broken Home.
 *
 * Asked per room, matching the cooldown store it is merged into. The key carries the space so
 * two rooms cannot serve each other a cached answer — which would be the same cross-space leak
 * the column was added to close, reintroduced one layer up.
 */
export function useRecallEventHistory(spaceId?: string | null) {
  const authReady = useAuthReady();
  return useQuery({
    queryKey: recallEventHistoryQueryKey(spaceId),
    queryFn: () =>
      api.get<RecallEventHistoryResponse>(
        spaceId ? `/api/recall/events/recent?spaceId=${encodeURIComponent(spaceId)}` : '/api/recall/events/recent',
      ),
    enabled: authReady,
    // History moves slowly and a stale read only risks showing one extra card.
    staleTime: 5 * 60_000,
  });
}
