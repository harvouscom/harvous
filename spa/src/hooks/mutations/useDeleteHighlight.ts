import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { normalizePrototypeApiSpaceId } from '../../utils/prototype-space-api-id';
import { runOfflineFirst } from './withOfflineQueue';
import { deleteStudyThreadEntryOffline } from '@/utils/offline-mutations';
import { invalidatePrototypeStudyThreadListQueries } from '@/utils/prototype-study-thread-list-sync';
import type { PrototypeHighlightStudyThreadRow } from '../queries/usePrototypeSpaceStudyThreadHighlights';

interface DeleteHighlightInput {
  id: string;
  spaceId: string;
  parentNoteId?: string;
}

interface DeleteHighlightResponse {
  success?: boolean;
  deletedId?: string;
  error?: string;
}

export function useDeleteHighlight() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id }: DeleteHighlightInput) => {
      const outcome = await runOfflineFirst({
        online: () =>
          api.delete<DeleteHighlightResponse>(`/api/study-threads/${encodeURIComponent(id)}`),
        offline: (userId) => deleteStudyThreadEntryOffline(userId, id).then(() => undefined),
      });
      if (outcome.queued) {
        return { success: true, deletedId: id } satisfies DeleteHighlightResponse;
      }
      return outcome.online!;
    },
    /*
     * Gone from the list on confirm, not a round trip later. The row used to sit in a busy
     * state with the confirm still open until the DELETE returned; it now leaves at once and
     * comes back only if the server refuses.
     */
    onMutate: async (variables) => {
      const key = highlightListKey(variables.spaceId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<PrototypeHighlightStudyThreadRow[]>(key);
      if (previous) {
        queryClient.setQueryData<PrototypeHighlightStudyThreadRow[]>(
          key,
          previous.filter((row) => row.id !== variables.id),
        );
      }
      return { previous };
    },
    onError: (_err, variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(highlightListKey(variables.spaceId), context.previous);
      }
    },
    // Settled, not success: after a refusal the list needs the server's copy as much as after
    // a delete does.
    onSettled: (_data, _err, variables) => {
      invalidatePrototypeStudyThreadListQueries(
        queryClient,
        variables.spaceId,
        variables.parentNoteId,
      );
    },
  });
}

/** Same key `usePrototypeSpaceStudyThreadHighlights` reads. */
function highlightListKey(spaceId: string) {
  return ['prototype', 'space', normalizePrototypeApiSpaceId(spaceId), 'study-thread-highlights'] as const;
}
