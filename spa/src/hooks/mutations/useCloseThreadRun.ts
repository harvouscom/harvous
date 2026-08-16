/**
 * Close a study plan's run, or reopen it — the **cohort's** completion.
 *
 * "We're done with this study." It writes nothing on any member's own progress, and that
 * separation is the whole point: someone who fell behind did not finish because the room
 * moved on, and recording that they did would tell them something untrue about their own
 * study. A member's own finish is `useCompleteThreadPlan`, on a different table.
 *
 * A closed run stays readable and can still be completed late — closed is a label, not a
 * lock.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

export function useCloseThreadRun() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ threadId, closed }: { threadId: string; closed: boolean }) =>
      api.post<{ success: boolean; closedAt: string | null }>(
        `/api/threads/${encodeURIComponent(threadId)}/close`,
        { closed },
      ),
    onSuccess: (_res, { threadId }) => {
      /* The closed state rides on the notes payload, beside `sequence` and `pulse`. */
      void queryClient.invalidateQueries({ queryKey: ['thread', threadId, 'notes'] });
    },
  });
}
