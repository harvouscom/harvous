/**
 * Curriculum handoff: copy a ministry channel's study plan into My Home or a
 * group the viewer leads. An independent copy — the church's plan is untouched.
 *
 * One copy per person per plan (the server's dedupe index). A second tap comes
 * back `alreadyCopied` with where the first copy lives, which the caller says
 * plainly rather than pretending it made another.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { navigationQueryKeyPrefix } from '../queries/useNavigation';
import { spaceGroupThreadsQueryKey } from '../queries/useSpaceGroupThreads';

export type CopyStudyPlanResult = {
  success: boolean;
  threadId: string;
  /** Where the copy lives: a Shared Space id, or null for My Home. */
  spaceId: string | null;
  noteCount: number;
  alreadyCopied: boolean;
  pinned: boolean;
};

export function useCopyStudyPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      channelSpaceId,
      threadId,
      targetSpaceId,
    }: {
      channelSpaceId: string;
      threadId: string;
      /** Omit for My Home. */
      targetSpaceId?: string | null;
    }) =>
      api.post<CopyStudyPlanResult>(
        `/api/church/channels/${encodeURIComponent(channelSpaceId)}/threads/${encodeURIComponent(threadId)}/copy`,
        targetSpaceId ? { targetSpaceId } : {},
      ),
    onSuccess: (result) => {
      if (result.alreadyCopied) return;
      void queryClient.invalidateQueries({ queryKey: [...navigationQueryKeyPrefix] });
      /* A Home copy is a personal reading plan; Home's card lists those. */
      void queryClient.invalidateQueries({ queryKey: ['reading-plans'] });
      if (result.spaceId) {
        void queryClient.invalidateQueries({ queryKey: spaceGroupThreadsQueryKey(result.spaceId) });
        void queryClient.invalidateQueries({ queryKey: ['space', result.spaceId, 'bootstrap'] });
      }
    },
  });
}
