import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';
import { updateCachedProfile, type UserProfile } from './useProfile';
import { churchChannelsQueryKey } from './useChurchChannels';
import { churchFeedQueryKey } from './useChurchFeed';

/** What the join page shows a visitor — only what the church printed, plus their own facts. */
export type ChurchJoinPreview = {
  church: { name: string; city: string | null; state: string | null };
  channels: Array<{ id: string; title: string; description: string | null; color: string | null }>;
  viewer: {
    signedIn: boolean;
    connection: 'here' | 'elsewhere' | 'none';
    /** Their current church's name, when it is a different one. */
    elsewhereName: string | null;
    followingIds: string[];
  };
};

export function churchJoinPreviewQueryKey(token: string, userId: string | null | undefined) {
  return ['church-join-preview', token, userId ?? 'visitor'] as const;
}

/**
 * The public join page's read. Works signed out; signed in, the server adds the
 * viewer's own connection and follows.
 */
export function useChurchJoinPreview(token: string) {
  const { isLoaded, userId } = useAuth();
  const authReady = useAuthReady();
  // A public endpoint with optional auth: wait for Clerk to settle, and when someone is
  // signed in wait for the session too, so the viewer block describes them rather
  // than a stranger.
  const ready = isLoaded && (!userId || authReady);

  return useQuery({
    queryKey: churchJoinPreviewQueryKey(token, userId),
    enabled: ready && token.length > 0,
    queryFn: () => api.get<ChurchJoinPreview>(`/api/church/join-preview/${encodeURIComponent(token)}`),
    staleTime: 30_000,
    retry: false,
  });
}

export type ChurchJoinLinkState = {
  link: { url: string; token: string; useCount: number; createdAt: string } | null;
  /** Everyone who has joined through any of the church's links — a count, never who. */
  totalJoined: number;
  qrSvg: string | null;
  /** The viewer may create, replace and turn off the link (church admins). */
  canManage: boolean;
};

export function churchJoinLinkQueryKey(userId: string | null | undefined, orgId: string | null | undefined) {
  return ['church-join-link', userId ?? 'none', orgId ?? 'home'] as const;
}

/** Staff read. Pass `enabled: true` only once the viewer is known to be staff. */
export function useChurchJoinLink(orgId: string | null | undefined, options?: { enabled?: boolean }) {
  const { userId } = useAuth();
  const authReady = useAuthReady();
  const trimmedOrgId = orgId?.trim() || null;

  return useQuery({
    queryKey: churchJoinLinkQueryKey(userId, trimmedOrgId),
    enabled: authReady && !!userId && !!trimmedOrgId && options?.enabled !== false,
    queryFn: () =>
      api.get<ChurchJoinLinkState>(`/api/church/join-link?orgId=${encodeURIComponent(trimmedOrgId!)}`),
    staleTime: 60_000,
    retry: false,
  });
}

/** Create, replace, or turn off the church's join link. Server-gated on `manage_church_settings`. */
export function useChurchJoinLinkActions(orgId: string | null | undefined) {
  const queryClient = useQueryClient();
  const { userId } = useAuth();
  const trimmedOrgId = orgId?.trim() || null;

  return useMutation({
    mutationFn: (action: 'create' | 'rotate' | 'revoke') =>
      api.post<ChurchJoinLinkState>(`/api/church/join-link/${action}`, { orgId: trimmedOrgId }),
    onSuccess: (data) => {
      queryClient.setQueryData(churchJoinLinkQueryKey(userId, trimmedOrgId), data);
    },
  });
}

type RedeemResponse = {
  success: boolean;
  church: { id: string; name: string; orgId: string };
  connection: Partial<UserProfile> | null;
  alreadyConnected: boolean;
  followed: string[];
  followsSkipped: boolean;
};

/** Connect to the church behind a join link, and follow the channels picked. */
export function useRedeemChurchJoinLink(token: string) {
  const queryClient = useQueryClient();
  const { userId } = useAuth();
  const profileKey = ['profile', userId ?? 'none'] as const;

  return useMutation({
    mutationFn: (vars: { channelIds: string[]; confirmSwitch?: boolean }) =>
      api.post<RedeemResponse>(`/api/church/join/${encodeURIComponent(token)}/redeem`, vars),
    onSuccess: (data) => {
      // Same order as useUpdateChurch: patch the profile before invalidating, so Home
      // paints connected on arrival instead of flashing the unconnected state.
      if (data.connection) {
        const patch = data.connection;
        queryClient.setQueryData<UserProfile>(profileKey, (prev) => (prev ? { ...prev, ...patch } : prev));
        updateCachedProfile(patch);
      }
      void queryClient.invalidateQueries({ queryKey: profileKey });
      void queryClient.invalidateQueries({ queryKey: churchChannelsQueryKey(userId) });
      void queryClient.invalidateQueries({ queryKey: churchFeedQueryKey(userId) });
      void queryClient.invalidateQueries({ queryKey: ['church-join-preview', token] });
    },
  });
}
