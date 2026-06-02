import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

interface RemoveTagInput {
  noteId: string;
  /** Remove a single tag link by id. */
  tagId?: string;
  /** Remove all tag links whose name matches (case-insensitive). */
  tagName?: string;
}

interface RemoveTagResponse {
  success: boolean;
  message?: string;
  removed?: number;
}

export function useRemoveTagFromNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ noteId, tagId, tagName }: RemoveTagInput) => {
      if (tagName?.trim()) {
        return api.delete<RemoveTagResponse>(
          `/api/note-tags/remove-by-name?noteId=${encodeURIComponent(noteId)}&name=${encodeURIComponent(tagName.trim())}`,
        );
      }
      if (!tagId) throw new Error('tagId or tagName is required');
      return api.delete<RemoveTagResponse>(
        `/api/note-tags/remove?noteId=${encodeURIComponent(noteId)}&tagId=${encodeURIComponent(tagId)}`,
      );
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['note', variables.noteId] });
      queryClient.invalidateQueries({ queryKey: ['tags-list'] });
    },
  });
}
