import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';
import type { PublishCadence } from '@/utils/channel-publish-cadence';

export type ChurchSponsorshipState = 'paid' | 'pilot' | 'lapsed';

export type ChurchSponsorship = {
  sponsored: boolean;
  state: ChurchSponsorshipState;
  pilotUntil: string | null;
  pilotDaysLeft: number | null;
};

export type ChurchChannel = {
  id: string;
  title: string;
  description: string | null;
  color: string | null;
  /** SpaceMemberships role, or null when the viewer has no row on this channel. */
  role: 'owner' | 'leader' | 'member' | null;
  isFollowing: boolean;
  /** Owner/leader — an author, so the browse list never offers them "Follow". */
  isStaff: boolean;
  publishCadence: PublishCadence | null;
  lastCurriculumAt: string | null;
  cadenceStale: boolean;
  cadenceLabel: string | null;
};

export type ChurchChannelsResponse = {
  connected: boolean;
  church: { id: string; name: string; orgId: string } | null;
  sponsorship?: ChurchSponsorship;
  channels: ChurchChannel[];
};

export function churchChannelsQueryKey(userId: string | null | undefined) {
  return ['church-channels', userId ?? 'none'] as const;
}

/**
 * Every ministry channel the viewer's home church publishes, with follow state.
 * The server scopes this to the caller's own `connectedOrgId` — there is no
 * orgId parameter to pass, by design.
 */
export function useChurchChannels(options?: { enabled?: boolean }) {
  const { userId } = useAuth();
  const authReady = useAuthReady();

  return useQuery({
    queryKey: churchChannelsQueryKey(userId),
    enabled: authReady && !!userId && options?.enabled !== false,
    queryFn: () => api.get<ChurchChannelsResponse>('/api/church/channels'),
    staleTime: 60_000,
  });
}
