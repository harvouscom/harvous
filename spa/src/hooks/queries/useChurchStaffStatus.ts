import { useAuth, useOrganizationList } from '@clerk/clerk-react';
import { useQuery } from '@tanstack/react-query';
import { useAuthReady } from '../useAuthReady';
import { api } from '../../lib/api';

/**
 * Church capabilities the server may grant. Mirrors
 * server/utils/church-role-capabilities.ts — the server is authoritative.
 */
export type ChurchCapability =
  | 'publish'
  | 'manage_staff'
  | 'manage_billing'
  | 'manage_templates'
  | 'sermon_tools'
  | 'manage_teaching_plan'
  | 'manage_church_settings';

export type ChurchStaffStatusResponse = {
  orgId: string;
  isStaff: boolean;
  role: string | null;
  capabilities: ChurchCapability[];
};

/**
 * Whether the signed-in user can create church content for this org, and which
 * role-gated surfaces they may see.
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
      api.get<ChurchStaffStatusResponse>(
        `/api/user/church-staff-status?orgId=${encodeURIComponent(trimmedOrgId!)}`,
      ),
    staleTime: 60_000,
  });

  return {
    isStaff: Boolean(query.data?.isStaff) || isClerkOrgMember,
    isClerkOrgMember,
    /** Clerk org role, when the server could read it. Display only. */
    role: query.data?.role ?? null,
    /**
     * Server's verdict on which role surfaces to render. Always gate on this —
     * never re-derive a capability from `role` on the client, or the two can
     * drift and a congregant ends up seeing pastor tooling.
     */
    capabilities: query.data?.capabilities ?? [],
    can: (capability: ChurchCapability) =>
      Array.isArray(query.data?.capabilities) && query.data.capabilities.includes(capability),
    isLoading: Boolean(trimmedOrgId) && (query.isLoading || !clerkOrgsLoaded),
  };
}
