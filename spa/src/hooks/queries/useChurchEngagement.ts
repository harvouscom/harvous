import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';

/** One ministry channel's reach. A number, never a roster. */
export type ChannelEngagement = {
  spaceId: string;
  title: string;
  followerCount: number;
};

export type ChurchEngagementResponse = {
  church: { id: string; name: string };
  /** Congregants who have made this church their home church. */
  connectedCount: number;
  channels: ChannelEngagement[];
};

export function churchEngagementQueryKey(
  userId: string | null | undefined,
  orgId: string | null | undefined,
) {
  return ['church-engagement', userId ?? 'none', orgId ?? 'home'] as const;
}

/**
 * Aggregate adoption — counts only, and there is nothing else to ask for.
 *
 * Server-gated on `manage_staff`, so pass `enabled: true` only once
 * `useChurchStaffStatus` says the viewer holds it; a pastor or teacher without
 * it never fires a request that will 403.
 *
 * No mutation hook accompanies this on purpose. Engagement is observed, not
 * set, and a church-facing write here would be a different feature entirely.
 */
export function useChurchEngagement(
  orgId: string | null | undefined,
  options?: { enabled?: boolean },
) {
  const { userId } = useAuth();
  const authReady = useAuthReady();
  const trimmedOrgId = orgId?.trim() || null;

  return useQuery({
    queryKey: churchEngagementQueryKey(userId, trimmedOrgId),
    enabled: authReady && !!userId && !!trimmedOrgId && options?.enabled === true,
    queryFn: () =>
      api.get<ChurchEngagementResponse>(
        `/api/church/engagement?orgId=${encodeURIComponent(trimmedOrgId!)}`,
      ),
    // Adoption moves slowly; this is a glance, not a dashboard.
    staleTime: 5 * 60_000,
    retry: false,
  });
}
