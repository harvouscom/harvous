import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

interface UpdateNoteInput {
  noteId: string;
  title: string;
  content: string;
  primaryCollection?: string | null;
  collectionPinned?: boolean;
  collectionUserOverride?: boolean;
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
    mutationFn: (input: UpdateNoteInput) => {
      const { noteId, title, content, primaryCollection, collectionPinned, collectionUserOverride } = input;
      const body: Record<string, unknown> = { noteId, title, content };
      if (primaryCollection !== undefined) body.primaryCollection = primaryCollection;
      if (collectionPinned !== undefined) body.collectionPinned = collectionPinned;
      if (collectionUserOverride !== undefined) body.collectionUserOverride = collectionUserOverride;
      return api.put<UpdateNoteResponse>('/api/notes/update', body as any);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['note', variables.noteId] });
      window.dispatchEvent(new CustomEvent('noteUpdated', { detail: { noteId: variables.noteId } }));
    },
  });
}
