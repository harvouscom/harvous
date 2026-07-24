import { useMutation, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { navigationQueryKeyPrefix } from '../queries/useNavigation';
import { clearCachedNoteDetail, clearNoteParentThreadLocalCache } from '../queries/useNote';
import { clearStudyDockStackLocalCache } from '@/utils/study-dock-stack';
import { deleteNoteOffline } from '@/utils/offline-mutations';
import { runOfflineFirst } from './withOfflineQueue';
import {
  normalizeSpaceIdForCache,
  removeSpaceNoteFromCache,
  spaceNotesQueryKey,
  type SpaceNotesPage,
} from '../../lib/space-notes-cache';
import { invalidatePrototypeSpaceDerivedQueries } from '../../lib/prototype-space-query-keys';

function purgeDeletedNoteClientCaches(queryClient: QueryClient, noteId: string) {
  queryClient.removeQueries({ queryKey: ['note', noteId] });
  clearCachedNoteDetail(noteId);
  clearNoteParentThreadLocalCache(noteId);
  clearStudyDockStackLocalCache(noteId);
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
      // Online-first: only enqueue the offline delete if the network call fails offline,
      // otherwise the background loop would push a redundant delete and surface a false failure.
      return runOfflineFirst({
        online: () =>
          api.delete<DeleteNoteResponse>(`/api/notes/delete?noteId=${encodeURIComponent(noteId)}`),
        offline: (userId) => deleteNoteOffline(userId, noteId),
      });
    },
    onMutate: async (variables) => {
      const sid = normalizeSpaceIdForCache(variables.spaceId);
      if (!sid) return { previous: undefined, sid: '' };
      const key = spaceNotesQueryKey(sid);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<InfiniteData<SpaceNotesPage, number>>(key);
      removeSpaceNoteFromCache(queryClient, sid, variables.noteId);
      return { previous, sid };
    },
    onError: (_err, _variables, context) => {
      if (context?.previous && context.sid) {
        queryClient.setQueryData(spaceNotesQueryKey(context.sid), context.previous);
      }
    },
    onSuccess: (_data, variables) => {
      const sid = normalizeSpaceIdForCache(variables.spaceId);
      if (!sid) return;

      removeSpaceNoteFromCache(queryClient, sid, variables.noteId);
      purgeDeletedNoteClientCaches(queryClient, variables.noteId);

      queryClient.invalidateQueries({ queryKey: ['space', sid, 'bootstrap'] });
      queryClient.invalidateQueries({ queryKey: [...navigationQueryKeyPrefix] });
      queryClient.invalidateQueries({ queryKey: ['prototype', 'space', sid, 'study-threads'] });
      queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) &&
          query.queryKey[0] === 'prototype' &&
          query.queryKey[1] === 'note' &&
          query.queryKey[3] === 'thread',
      });
      invalidatePrototypeSpaceDerivedQueries(queryClient, sid);

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
