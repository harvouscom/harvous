import { useMutation, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { navigationQueryKeyPrefix } from '../queries/useNavigation';
import { clearCachedNoteDetail, clearNoteParentThreadLocalCache } from '../queries/useNote';
import { deleteNoteOffline } from '@/utils/offline-mutations';
import { getPersistedUserId } from '@/utils/user-id';
import {
  removeSpaceNoteFromCache,
  spaceNotesQueryKey,
  type SpaceNotesPage,
} from '../../lib/space-notes-cache';

function purgeDeletedNoteClientCaches(queryClient: QueryClient, noteId: string) {
  queryClient.removeQueries({ queryKey: ['note', noteId] });
  clearCachedNoteDetail(noteId);
  clearNoteParentThreadLocalCache(noteId);
}

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
 * Permanently delete a note (same endpoint as classic app). Optimistically removes from space note lists.
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
    onMutate: async (variables) => {
      const sid = variables.spaceId.startsWith('space_') ? variables.spaceId : `space_${variables.spaceId}`;
      const key = spaceNotesQueryKey(sid);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<InfiniteData<SpaceNotesPage, number>>(key);
      removeSpaceNoteFromCache(queryClient, sid, variables.noteId);
      purgeDeletedNoteClientCaches(queryClient, variables.noteId);
      return { previous, sid };
    },
    onError: (_err, _variables, context) => {
      if (context?.previous && context.sid) {
        queryClient.setQueryData(spaceNotesQueryKey(context.sid), context.previous);
      }
    },
    onSuccess: (_data, variables) => {
      const sid = variables.spaceId.startsWith('space_') ? variables.spaceId : `space_${variables.spaceId}`;
      purgeDeletedNoteClientCaches(queryClient, variables.noteId);
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
    onSettled: (_data, _err, variables) => {
      const sid = variables.spaceId.startsWith('space_') ? variables.spaceId : `space_${variables.spaceId}`;
      void queryClient.invalidateQueries({ queryKey: ['space', sid, 'notes'] });
    },
  });
}
