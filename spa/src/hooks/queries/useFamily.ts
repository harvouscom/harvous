import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';
import { navigationQueryKeyPrefix } from './useNavigation';
import type { FamilyRole } from '@/lib/family-roles';

/**
 * Family Accounts — Settings › Family and the invite page. See docs/future/FAMILY_ACCOUNTS.md.
 */

export type FamilyMember = {
  userId: string;
  role: FamilyRole;
  isOwner: boolean;
  isMe: boolean;
  displayName: string;
  profileImageUrl: string | null;
  userColor: string;
  /** For the owner: whether their own Plus is active. For everyone else: whether it covers them. */
  covered: boolean;
  joinedAt: string;
};

export type FamilyInvite = {
  id: string;
  role: FamilyRole;
  label: string | null;
  url: string;
  expiresAt: string;
  createdAt: string;
};

export type FamilyResponse =
  | {
      family: null;
      /** `available`: preview allows this account to start one. `hasPlus`: it can pay for it. */
      start: { available: boolean; hasPlus: boolean };
      maxMembers: number;
    }
  | {
      family: {
        id: string;
        name: string;
        spaceId: string;
        spaceAvailable: boolean;
        ownerUserId: string;
        ownerFirstName: string | null;
        /** The owner's Plus is active, so coverage is on. */
        sponsoring: boolean;
        members: FamilyMember[];
        /** Parents only; empty for everyone else. */
        invites: FamilyInvite[];
      };
      me: { userId: string; role: FamilyRole; isOwner: boolean; hasOwnPlus: boolean };
      maxMembers: number;
    };

export type FamilyProgressEntry = {
  userId: string;
  displayName: string;
  lastActive: 'day' | 'week' | 'month' | 'earlier' | 'never';
  chaptersRead: number;
  booksRead: string[];
  notesWritten: number;
};

export function familyQueryKey(userId: string | null | undefined) {
  return ['family', userId ?? 'none'] as const;
}

export function familyProgressQueryKey(userId: string | null | undefined) {
  return ['family', userId ?? 'none', 'progress'] as const;
}

export function useFamily(enabled = true) {
  const { userId } = useAuth();
  const authReady = useAuthReady();
  return useQuery({
    queryKey: familyQueryKey(userId),
    queryFn: () => api.get<FamilyResponse>('/api/family'),
    enabled: authReady && !!userId && enabled,
    staleTime: 30_000,
    retry: false,
  });
}

/** Parents: their children. A child: their own entry. Adults: nothing. */
export function useFamilyProgress(enabled: boolean) {
  const { userId } = useAuth();
  const authReady = useAuthReady();
  return useQuery({
    queryKey: familyProgressQueryKey(userId),
    queryFn: () => api.get<{ entries: FamilyProgressEntry[] }>('/api/family/progress'),
    enabled: authReady && !!userId && enabled,
    staleTime: 60_000,
    retry: false,
  });
}

/** Everything a family change can move: the family, coverage on the Plan page, the sidebar's spaces. */
function useInvalidateFamily() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['family'] });
    void queryClient.invalidateQueries({ queryKey: ['subscription', 'status'] });
    void queryClient.invalidateQueries({ queryKey: [...navigationQueryKeyPrefix] });
  };
}

export function useCreateFamily() {
  const invalidate = useInvalidateFamily();
  return useMutation({
    mutationFn: (name: string) => api.post<{ familyId: string; spaceId: string }>('/api/family', { name }),
    onSuccess: invalidate,
  });
}

export function useRenameFamily() {
  const invalidate = useInvalidateFamily();
  return useMutation({
    mutationFn: (name: string) => api.patch<{ name: string }>('/api/family', { name }),
    onSuccess: invalidate,
  });
}

export function useDissolveFamily() {
  const invalidate = useInvalidateFamily();
  return useMutation({
    mutationFn: () => api.delete<{ spaceId: string }>('/api/family'),
    onSuccess: invalidate,
  });
}

export function useCreateFamilyInvite() {
  const invalidate = useInvalidateFamily();
  return useMutation({
    mutationFn: (input: { role: FamilyRole; label?: string }) =>
      api.post<{ invite: FamilyInvite }>('/api/family/invites', input),
    onSuccess: invalidate,
  });
}

export function useRevokeFamilyInvite() {
  const invalidate = useInvalidateFamily();
  return useMutation({
    mutationFn: (inviteId: string) => api.delete(`/api/family/invites/${encodeURIComponent(inviteId)}`),
    onSuccess: invalidate,
  });
}

export function useChangeFamilyRole() {
  const invalidate = useInvalidateFamily();
  return useMutation({
    mutationFn: (input: { userId: string; role: FamilyRole }) =>
      api.patch(`/api/family/members/${encodeURIComponent(input.userId)}`, { role: input.role }),
    onSuccess: invalidate,
  });
}

export function useRemoveFamilyMember() {
  const invalidate = useInvalidateFamily();
  return useMutation({
    mutationFn: (userId: string) => api.delete<{ left: boolean }>(`/api/family/members/${encodeURIComponent(userId)}`),
    onSuccess: invalidate,
  });
}

// ─── The invite page ─────────────────────────────────────────────────────────

export type FamilyInvitePreview = {
  familyName: string;
  inviterFirstName: string | null;
  role: FamilyRole;
  disclosure: { summary: string; shares: string[]; never: string };
  valid: boolean;
  reason: string | null;
};

export function useFamilyInvitePreview(token: string) {
  const { isLoaded } = useAuth();
  // auth-gate-exempt: a public endpoint the invite page reads signed out; it carries no viewer state.
  return useQuery({
    queryKey: ['family-invite-preview', token] as const,
    enabled: isLoaded && token.length > 0,
    queryFn: () => api.get<FamilyInvitePreview>(`/api/family/invites/preview/${encodeURIComponent(token)}`),
    staleTime: 30_000,
    retry: false,
  });
}

export function useRedeemFamilyInvite(token: string) {
  const invalidate = useInvalidateFamily();
  return useMutation({
    mutationFn: (acknowledgedRole: FamilyRole) =>
      api.post<{ spaceId: string; alreadyMember?: boolean; role?: FamilyRole }>(
        `/api/family/invites/${encodeURIComponent(token)}/redeem`,
        { acknowledgedRole },
      ),
    onSuccess: invalidate,
  });
}
