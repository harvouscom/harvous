import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

interface UpdateNoteInput {
  noteId: string;
  title: string;
  content: string;
}

interface UpdateNoteResponse {
  success: boolean;
  note?: {
    id: string;
    title: string;
    content: string;
    updatedAt: string;
  };
  scriptureResults?: unknown;
}

/**
 * Mutation hook for updating a note (title + content).
 *
 * Usage:
 *   const updateNote = useUpdateNote();
 *   await updateNote.mutateAsync({ noteId, title, content });
 *
 * On success, invalidates the note detail cache so the UI reflects the latest save.
 */
export function useUpdateNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ noteId, title, content }: UpdateNoteInput) =>
      api.put<UpdateNoteResponse>('/api/notes/update', { noteId, title, content }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['note', variables.noteId] });
      window.dispatchEvent(new CustomEvent('noteUpdated', { detail: { noteId: variables.noteId } }));
    },
  });
}
