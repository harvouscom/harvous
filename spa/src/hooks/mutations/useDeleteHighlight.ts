import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { normalizePrototypeApiSpaceId } from '../../utils/prototype-space-api-id';

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
    mutationFn: ({ id }: DeleteHighlightInput) =>
      api.delete<DeleteHighlightResponse>(`/api/study-threads/${encodeURIComponent(id)}`),
    onSuccess: (_data, variables) => {
      const sid = normalizePrototypeApiSpaceId(variables.spaceId);
      queryClient.invalidateQueries({
        queryKey: ['prototype', 'space', sid, 'study-thread-highlights'],
      });
      queryClient.invalidateQueries({
        queryKey: ['prototype', 'space', sid, 'study-threads-by-scripture'],
      });
      if (variables.parentNoteId) {
        queryClient.invalidateQueries({ queryKey: ['note', variables.parentNoteId] });
      }
    },
  });
}
