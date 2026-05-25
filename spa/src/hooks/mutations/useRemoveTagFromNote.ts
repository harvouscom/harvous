import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

interface RemoveTagInput {
  noteId: string;
  tagId: string;
}

interface RemoveTagResponse {
  success: boolean;
  message?: string;
}

export function useRemoveTagFromNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ noteId, tagId }: RemoveTagInput) =>
      api.delete<RemoveTagResponse>(
        `/api/note-tags/remove?noteId=${encodeURIComponent(noteId)}&tagId=${encodeURIComponent(tagId)}`,
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['note', variables.noteId] });
      queryClient.invalidateQueries({ queryKey: ['tags-list'] });
    },
  });
}
