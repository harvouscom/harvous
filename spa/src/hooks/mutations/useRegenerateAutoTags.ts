import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

interface RegenerateInput {
  noteId: string;
  noteTitle: string;
  noteContent: string;
}

interface RegenerateResponse {
  success: boolean;
  result?: unknown;
}

/**
 * Re-runs auto-tagging on a note. Server clears existing auto tags and
 * re-applies based on current content. Used by the "Use auto suggestion"
 * action on the folder/tag editor.
 */
export function useRegenerateAutoTags() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ noteId, noteTitle, noteContent }: RegenerateInput) =>
      api.post<RegenerateResponse>('/api/notes/auto-tags', {
        noteId,
        noteTitle,
        noteContent,
        action: 'regenerate',
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['note', variables.noteId] });
      queryClient.invalidateQueries({ queryKey: ['tags-list'] });
    },
  });
}
