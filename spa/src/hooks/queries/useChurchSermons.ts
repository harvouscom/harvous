import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';
import { useProfile } from './useProfile';
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
  const { data: profile } = useProfile();
  const connected = Boolean(profile?.connectedOrgId);

  return useQuery({
    queryKey: churchSermonsQueryKey(userId),
    enabled: authReady && !!userId && connected && options?.enabled !== false,
    queryFn: () => api.get<ChurchSermonsResponse>('/api/church/services'),
    staleTime: 60_000,
  });
}
