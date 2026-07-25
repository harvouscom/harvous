import { useAuth, useOrganizationList } from '@clerk/clerk-react';
import { useQuery } from '@tanstack/react-query';
import { useAuthReady } from '../useAuthReady';
import { api } from '../../lib/api';

/**
 * Whether the signed-in user can create church content for this org.
 * Combines a live server staff check with Clerk org membership (client).
 */
export function useChurchStaffStatus(orgId: string | null | undefined) {
  const { userId } = useAuth();
  const authReady = useAuthReady();
  const trimmedOrgId = orgId?.trim() || null;

  const { userMemberships, isLoaded: clerkOrgsLoaded } = useOrganizationList({
    userMemberships: { infinite: true },
  });

  const isClerkOrgMember = Boolean(
    trimmedOrgId &&
      clerkOrgsLoaded &&
      userMemberships.data?.some((membership) => membership.organization.id === trimmedOrgId),
  );

  const query = useQuery({
    queryKey: ['church-staff-status', userId ?? 'none', trimmedOrgId ?? 'none'],
    enabled: authReady && !!userId && !!trimmedOrgId,
    queryFn: () =>
      api.get<{ orgId: string; isStaff: boolean }>(
        `/api/user/church-staff-status?orgId=${encodeURIComponent(trimmedOrgId!)}`,
      ),
    staleTime: 60_000,
  });

  return {
    isStaff: Boolean(query.data?.isStaff) || isClerkOrgMember,
    isClerkOrgMember,
    isLoading: Boolean(trimmedOrgId) && (query.isLoading || !clerkOrgsLoaded),
  };
}
