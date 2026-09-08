/**
 * A member marks a study plan finished — or takes it back.
 *
 * The **individual** completion, the twin of `useCloseThreadRun`'s cohort one.
 * They write different tables on purpose: a leader closing the run says "we are
 * done with this study", and someone who fell behind did not finish because the
 * room moved on. So neither hook may ever be reached for the other's job.
 *
 * Never derived. `openedNoteIds` records that a step was *opened*, which is not
 * reading it and not finishing it, so the server takes an explicit boolean both
 * ways and this hook always sends one — "actually, not yet" is a thing a person
 * says, and an absent key is a bad request rather than a silent toggle.
 *
 * A closed run can still be completed, and a completed plan can still be
 * reopened. Closed is a label, not a lock.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

export function useCompleteThreadPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ threadId, completed }: { threadId: string; completed: boolean }) =>
      api.post<{ success: boolean; completedAt: string | null }>(
        `/api/threads/${encodeURIComponent(threadId)}/complete`,
        { completed },
      ),
    onSuccess: (_res, { threadId }) => {
      /* `viewerCompletedAt` rides the notes payload, beside `sequence` and `pulse`. */
      void queryClient.invalidateQueries({ queryKey: ['thread', threadId, 'notes'] });
      /*
        And Home's card, which is the surface this actually unblocks: the
        reading-plans route drops finished plans, so until something could mark
        one finished, a personal plan sat on Home forever.
      */
      void queryClient.invalidateQueries({ queryKey: ['reading-plans'] });
    },
  });
}
