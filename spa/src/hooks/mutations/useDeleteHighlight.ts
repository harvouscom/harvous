import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { normalizePrototypeApiSpaceId } from '../../utils/prototype-space-api-id';
import { runOfflineFirst } from './withOfflineQueue';
import { deleteStudyThreadEntryOffline } from '@/utils/offline-mutations';
import { invalidatePrototypeStudyThreadListQueries } from '@/utils/prototype-study-thread-list-sync';

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
    onSuccess: (_data, variables) => {
      invalidatePrototypeStudyThreadListQueries(
        queryClient,
        variables.spaceId,
        variables.parentNoteId,
      );
    },
  });
}
