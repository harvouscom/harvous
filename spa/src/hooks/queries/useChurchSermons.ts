import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';
import { useProfile } from './useProfile';
import { isQuerySettled } from '@/utils/prototype-home-ready';
import type { ChurchClock, ChurchSermon } from '../../lib/church-services';

export type ChurchSermonsResponse = {
  connected: boolean;
  church?: { id: string; name: string };
  /**
   * The church's own wall clock, for deciding whether this morning's service
   * has started. Optional so a payload cached before this shipped still parses;
   * absent, the card falls back to showing the earliest sermon of the day.
   */
  churchNow?: ChurchClock;
  services: ChurchSermon[];
};

export function churchSermonsQueryKey(userId: string | null | undefined) {
  return ['church-services', userId ?? 'none'] as const;
}

/**
 * The church's teaching plan, congregant side — what "This Sunday" reads from.
 *
 * Gated on `connectedOrgId`, deliberately. Home already fires an ungated
 * church-feed request for every signed-in user; a second always-on church call
 * for the large majority who have no church would be a real regression, and the
 * profile is already in cache by the time Home renders.
 */
export function useChurchSermons(options?: { enabled?: boolean }) {
  const { userId } = useAuth();
  const authReady = useAuthReady();
  const profileQuery = useProfile();
  const connected = Boolean(profileQuery.data?.connectedOrgId);

  const query = useQuery({
    queryKey: churchSermonsQueryKey(userId),
    enabled: authReady && !!userId && connected && options?.enabled !== false,
    queryFn: () => api.get<ChurchSermonsResponse>('/api/church/services'),
    staleTime: 60_000,
  });

  /*
   * Whether this query has finished having anything to say — which, for a query that may never
   * run at all, is not what `isPending` answers.
   *
   * Home's presentation gate ANDs a settled flag per query and paints once. This one is disabled
   * for every account without a church, and a disabled query keeps `status: 'pending'` forever in
   * React Query v5, so the flag was permanently false and the gate could never fire: Home reached
   * `contentReady` only via its 2.5s deadline, on every cold load, painting with whatever had
   * arrived by then and growing the rest a section at a time.
   *
   * The profile half is what keeps the cure from becoming the disease. `connected` is read off
   * profile data, so before that lands this query is disabled *transiently* — reporting settled
   * there would let the gate fire early and pop "This Sunday" in late for the accounts that
   * actually have a church. `isPlaceholderData` is part of it rather than pedantry: the profile's
   * sessionStorage snapshot can be missing `connectedOrgId` (see the placeholder note in
   * `useProfile`), which is the one field this reads.
   */
  const profileSettled = !profileQuery.isPending && !profileQuery.isPlaceholderData;

  return {
    ...query,
    isSettled:
      profileSettled && isQuerySettled(query.isPending, query.data != null, query.isEnabled),
  };
}
