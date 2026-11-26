/**
 * Publish a study plan from your own study into a church channel you lead.
 * An independent copy: the Home plan stays yours (see server/utils/study-plan-publish.ts).
 *
 * One publish per plan per person. A second tap comes back `alreadyPublished`
 * with the channel the first one went to, which the caller says plainly.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';
import { navigationQueryKeyPrefix } from '../queries/useNavigation';
import { spaceGroupThreadsQueryKey } from '../queries/useSpaceGroupThreads';

export type PublishPlanChannel = { id: string; title: string; orgId: string | null };

export type PublishStudyPlanResult = {
  success: boolean;
  threadId: string;
  channelSpaceId: string;
  noteCount: number;
  alreadyPublished: boolean;
  pinned: boolean;
};

/** Church channels the viewer leads. Empty for everyone who is not church staff. */
export function usePublishPlanChannels(enabled: boolean) {
  const { userId } = useAuth();
  const authReady = useAuthReady();
  return useQuery({
    queryKey: ['publish-plan-channels', userId ?? 'none'],
    enabled: enabled && authReady && !!userId,
    queryFn: () => api.get<{ channels: PublishPlanChannel[] }>('/api/church/publish-plan/channels'),
    staleTime: 5 * 60_000,
  });
}

export function usePublishStudyPlanToChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ threadId, channelSpaceId }: { threadId: string; channelSpaceId: string }) =>
      api.post<PublishStudyPlanResult>(`/api/threads/${encodeURIComponent(threadId)}/publish-to-channel`, {
        channelSpaceId,
      }),
    onSuccess: (result) => {
      if (result.alreadyPublished) return;
      void queryClient.invalidateQueries({ queryKey: [...navigationQueryKeyPrefix] });
      void queryClient.invalidateQueries({ queryKey: spaceGroupThreadsQueryKey(result.channelSpaceId) });
      void queryClient.invalidateQueries({ queryKey: ['space', result.channelSpaceId, 'bootstrap'] });
    },
  });
}
