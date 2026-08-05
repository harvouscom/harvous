import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import {
  invalidateChurchStarterConsumers,
  invalidateNoteTemplatesQueries,
  removeStoredNoteTemplateFromCaches,
} from '../queries/useNoteTemplates';

interface DeleteNoteTemplateResponse {
  success: boolean;
}

export function useDeleteNoteTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      api.delete<DeleteNoteTemplateResponse>(
        `/api/note-templates/delete?id=${encodeURIComponent(id)}`,
      ),
    onSuccess: (_data, id) => {
      removeStoredNoteTemplateFromCaches(queryClient, id);
      void invalidateNoteTemplatesQueries(queryClient);
      // Unconditional: delete only carries an id, so there is no way to tell
      // whether it was a church starter. One extra refetch on a rare action
      // beats leaving a deleted starter inlined on every congregant's Sunday.
      void invalidateChurchStarterConsumers(queryClient);
    },
  });
}
