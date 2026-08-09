import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';

/**
 * A ministry's two rooms, paired — the Shared Space that meets and the channel
 * it broadcasts through.
 *
 * The server resolves a pairing live on every read, so a room whose other half
 * was deleted comes back unpaired rather than as a chip pointing at nothing.
 * Nothing here caches the relationship across rooms for that reason.
 */
export type CompanionRoom = {
  id: string;
  title: string;
  color: string | null;
};

export type SpaceCompanionResponse = {
  /** For a Shared Space: the channel it broadcasts through. */
  companionChannel: CompanionRoom | null;
  /** For a ministry channel: the space it speaks for. */
  companionOfSpace: CompanionRoom | null;
};

export function spaceCompanionQueryKey(
  userId: string | null | undefined,
  spaceId: string | null | undefined,
) {
  return ['space-companion', userId ?? 'none', spaceId ?? 'none'] as const;
}

export function channelLinksQueryKey(
  userId: string | null | undefined,
  orgId: string | null | undefined,
) {
  return ['channel-links', userId ?? 'none', orgId ?? 'none'] as const;
}

/** The other half of one room's pairing. Membership-gated, so every member asks. */
export function useSpaceCompanion(
  spaceId: string | null | undefined,
  options?: { enabled?: boolean },
) {
  const { userId } = useAuth();
  const authReady = useAuthReady();
  const trimmed = spaceId?.trim() || null;

  return useQuery({
    queryKey: spaceCompanionQueryKey(userId, trimmed),
    enabled: authReady && !!userId && !!trimmed && options?.enabled !== false,
    queryFn: () =>
      api.get<SpaceCompanionResponse>(`/api/spaces/${encodeURIComponent(trimmed!)}/companion`),
    staleTime: 60_000,
    retry: false,
  });
}

export type ChannelLink = { space: CompanionRoom; channel: CompanionRoom };

/** Every live pairing in one church — the staff picker's current state. */
export function useChannelLinks(orgId: string | null | undefined, options?: { enabled?: boolean }) {
  const { userId } = useAuth();
  const authReady = useAuthReady();
  const trimmed = orgId?.trim() || null;

  return useQuery({
    queryKey: channelLinksQueryKey(userId, trimmed),
    enabled: authReady && !!userId && !!trimmed && options?.enabled !== false,
    queryFn: () =>
      api.get<{ links: ChannelLink[] }>(
        `/api/church/space-channel-links?orgId=${encodeURIComponent(trimmed!)}`,
      ),
    staleTime: 60_000,
    retry: false,
  });
}

/**
 * Pair a room with a channel, or clear it with `channelSpaceId: null`.
 *
 * Invalidates both rooms' companion reads as well as the church listing: the
 * chip in the channel's own header is the other side of the same fact, and it
 * would otherwise keep the previous answer until it went stale.
 */
export function useSetChannelLink(orgId: string | null | undefined) {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const trimmed = orgId?.trim() || null;

  return useMutation({
    mutationFn: async (input: { spaceId: string; channelSpaceId: string | null }) => {
      if (!trimmed) throw new Error('No church');
      return api.post<{ success: boolean; companion: CompanionRoom | null }>(
        '/api/church/space-channel-links/set',
        { orgId: trimmed, ...input },
      );
    },
    onSuccess: (_result, input) => {
      void queryClient.invalidateQueries({ queryKey: channelLinksQueryKey(userId, trimmed) });
      void queryClient.invalidateQueries({
        queryKey: spaceCompanionQueryKey(userId, input.spaceId),
      });
      if (input.channelSpaceId) {
        void queryClient.invalidateQueries({
          queryKey: spaceCompanionQueryKey(userId, input.channelSpaceId),
        });
      }
    },
  });
}
