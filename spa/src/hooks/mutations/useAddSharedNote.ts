import { useMutation } from '@tanstack/react-query';
import { api } from '../../lib/api';

interface AddSharedNoteResult {
  success: boolean;
  message?: string;
  createdIds?: { noteId: string };
}

/**
 * Mutation hook for importing a shared note into the user's Harvous.
 *
 * Usage:
 *   const addSharedNote = useAddSharedNote();
 *   const result = await addSharedNote.mutateAsync(shareToken);
 */
export function useAddSharedNote() {
  return useMutation({
    mutationFn: (shareToken: string) =>
      api.post<AddSharedNoteResult>('/api/shared/add-note-to-harvous', { shareToken }),
  });
}
