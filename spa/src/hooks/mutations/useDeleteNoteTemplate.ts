import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import {
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
    },
  });
}
