import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { api } from '../../lib/api';
import {
  churchChannelsQueryKey,
  type ChurchChannelsResponse,
} from '../queries/useChurchChannels';
import { navigationQueryKeyPrefix } from '../queries/useNavigation';

type FollowResponse = {
  success?: boolean;
  spaceId?: string;
  following?: boolean;
  reason?: string | null;
  error?: string;
  code?: string;
};

/**
 * Follow / unfollow a ministry channel.
 *
 * Patches the channels cache optimistically so the row moves lanes on tap, then
 * invalidates navigation — a follow writes a SpaceMemberships row, which is what
 * puts the channel into `nav.memberOfSpaces` and therefore into the hub.
 */
export function useFollowChannel() {
  const queryClient = useQueryClient();
  const { userId } = useAuth();
  const channelsKey = churchChannelsQueryKey(userId);

  return useMutation({
    mutationFn: ({ spaceId, follow }: { spaceId: string; follow: boolean }) =>
      api.post<FollowResponse>(
        `/api/church/channels/${encodeURIComponent(spaceId)}/${follow ? 'follow' : 'unfollow'}`,
        {},
      ),

    onMutate: async ({ spaceId, follow }) => {
      await queryClient.cancelQueries({ queryKey: channelsKey });
      const previous = queryClient.getQueryData<ChurchChannelsResponse>(channelsKey);
      queryClient.setQueryData<ChurchChannelsResponse>(channelsKey, (old) =>
        old
          ? {
              ...old,
              channels: old.channels.map((channel) =>
                channel.id === spaceId
                  ? { ...channel, isFollowing: follow, role: follow ? 'member' : null }
                  : channel,
              ),
            }
          : old,
      );
      return { previous };
    },

    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(channelsKey, context.previous);
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: channelsKey });
      void queryClient.invalidateQueries({ queryKey: navigationQueryKeyPrefix });
      void queryClient.invalidateQueries({ queryKey: ['church-feed'] });
    },
  });
}
