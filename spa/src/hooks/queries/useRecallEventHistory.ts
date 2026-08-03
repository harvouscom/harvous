import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';
import type { ServerRecallHistoryEntry } from '../../pages/prototype/proto-recall-cooldown';

interface RecallEventHistoryResponse {
  success: boolean;
  events: ServerRecallHistoryEntry[];
}

export const recallEventHistoryQueryKey = ['recall', 'events', 'recent'] as const;

/**
 * Recent recall opens/snoozes for this user, so a card acted on or dismissed on one
 * device stops resurfacing on the others. Merged with the localStorage cooldown store by
 * `mergeServerRecallHistoryIntoCooldowns` — never used on its own, so suppression keeps
 * working offline.
 *
 * The endpoint degrades to an empty list on a pre-migration database, so a failure here
 * only means "no cross-device history", never a broken Home.
 */
export function useRecallEventHistory() {
  const authReady = useAuthReady();
  return useQuery({
    queryKey: recallEventHistoryQueryKey,
    queryFn: () => api.get<RecallEventHistoryResponse>('/api/recall/events/recent'),
    enabled: authReady,
    // History moves slowly and a stale read only risks showing one extra card.
    staleTime: 5 * 60_000,
  });
}
