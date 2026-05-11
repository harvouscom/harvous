import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { navigationQueryKeyPrefix } from '../queries/useNavigation';
import { deleteNoteOffline } from '@/utils/offline-mutations';
import { getPersistedUserId } from '@/utils/user-id';

interface DeleteNoteVariables {
  noteId: string;
  spaceId: string;
}

interface DeleteNoteResponse {
  success?: string;
  noteId?: string;
  threadId?: string;
  error?: string;
}

/**
 * Permanently delete a note (same endpoint as classic app). Invalidates space note lists and navigation.
 */
export function useDeleteNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ noteId }: DeleteNoteVariables) => {
      const userId = getPersistedUserId();
      if (userId) {
        try {
          await deleteNoteOffline(userId, noteId);
        } catch {
          /* continue with server */
        }
      }
      return api.delete<DeleteNoteResponse>(
        `/api/notes/delete?noteId=${encodeURIComponent(noteId)}`,
      );
    },
    onSuccess: (_data, variables) => {
      const sid = variables.spaceId.startsWith('space_') ? variables.spaceId : `space_${variables.spaceId}`;
      queryClient.removeQueries({ queryKey: ['note', variables.noteId] });
      queryClient.invalidateQueries({ queryKey: ['space', sid, 'notes'] });
      queryClient.invalidateQueries({ queryKey: ['space', sid, 'bootstrap'] });
      queryClient.invalidateQueries({ queryKey: [...navigationQueryKeyPrefix] });
      try {
        window.dispatchEvent(
          new CustomEvent('noteDeleted', { detail: { noteId: variables.noteId, threadId: 'thread_unorganized' } }),
        );
      } catch {
        /* ignore */
      }
    },
  });
}
