import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';

export type ChurchStaffMember = {
  userId: string;
  role: string;
  isSelf: boolean;
  displayName: string;
  profileImageUrl: string | null;
  userColor: string;
};

export type ChurchPendingInvite = {
  id: string;
  emailAddress: string;
  role: string;
  status: string;
  createdAt: number | null;
};

export type ChurchStaffResponse = {
  church: { id: string; name: string; orgId: string };
  /** True only for a Clerk `org:admin` — a leader can publish, not staff up. */
  canManage: boolean;
  viewerRole: string | null;
  staffCap: number;
  seatsUsed: number;
  staff: ChurchStaffMember[];
  pendingInvites: ChurchPendingInvite[];
};

export function churchStaffQueryKey(
  userId: string | null | undefined,
  orgId: string | null | undefined,
) {
  return ['church-staff', userId ?? 'none', orgId ?? 'home'] as const;
}

/** Staff roster + pending invites. Staff-only server-side — gate before enabling. */
export function useChurchStaff(orgId: string | null | undefined, options?: { enabled?: boolean }) {
  const { userId } = useAuth();
  const authReady = useAuthReady();
  const trimmedOrgId = orgId?.trim() || null;

  return useQuery({
    queryKey: churchStaffQueryKey(userId, trimmedOrgId),
    enabled: authReady && !!userId && !!trimmedOrgId && options?.enabled === true,
    queryFn: () =>
      api.get<ChurchStaffResponse>(`/api/church/staff?orgId=${encodeURIComponent(trimmedOrgId!)}`),
    staleTime: 30_000,
    retry: false,
  });
}

type StaffAction =
  | { kind: 'invite'; email: string; role?: string }
  | { kind: 'revoke'; invitationId: string }
  | { kind: 'remove'; userId: string }
  | { kind: 'role'; userId: string; role: string }
  | { kind: 'sync' };

/** Invite / revoke / remove / role / sync, all invalidating the roster and navigation. */
export function useChurchStaffActions(orgId: string | null | undefined) {
  const queryClient = useQueryClient();
  const { userId } = useAuth();
  const trimmedOrgId = orgId?.trim() || null;

  return useMutation({
    mutationFn: (action: StaffAction) => {
      switch (action.kind) {
        case 'invite':
          return api.post('/api/church/staff/invite', {
            orgId: trimmedOrgId,
            email: action.email,
            role: action.role,
          });
        case 'revoke':
          return api.post('/api/church/staff/revoke-invite', {
            orgId: trimmedOrgId,
            invitationId: action.invitationId,
          });
        case 'remove':
          return api.post('/api/church/staff/remove', {
            orgId: trimmedOrgId,
            userId: action.userId,
          });
        case 'role':
          return api.post('/api/church/staff/role', {
            orgId: trimmedOrgId,
            userId: action.userId,
            role: action.role,
          });
        case 'sync':
          return api.post('/api/church/staff/sync', { orgId: trimmedOrgId });
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: churchStaffQueryKey(userId, trimmedOrgId) });
      // Removing staff changes membership rows, which is what nav reads.
      void queryClient.invalidateQueries({ queryKey: ['navigation'] });
    },
  });
}
