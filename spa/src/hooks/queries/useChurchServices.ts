import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';
import { useProfile } from './useProfile';
import type { ChurchService } from '../../lib/church-services';

export type ChurchServicesResponse = {
  connected: boolean;
  church?: { id: string; name: string };
  services: ChurchService[];
};

export function churchServicesQueryKey(userId: string | null | undefined) {
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
export function useChurchServices(options?: { enabled?: boolean }) {
  const { userId } = useAuth();
  const authReady = useAuthReady();
  const { data: profile } = useProfile();
  const connected = Boolean(profile?.connectedOrgId);

  return useQuery({
    queryKey: churchServicesQueryKey(userId),
    enabled: authReady && !!userId && connected && options?.enabled !== false,
    queryFn: () => api.get<ChurchServicesResponse>('/api/church/services'),
    staleTime: 60_000,
  });
}
