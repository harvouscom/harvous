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
  restoreSpaceNotesCaches,
  snapshotSpaceNotesCaches,
  spaceNotesQueryKey,
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
      await queryClient.cancelQueries({ queryKey: spaceNotesQueryKey(sid) });
      const previous = snapshotSpaceNotesCaches(queryClient, sid);
      removeSpaceNoteFromCache(queryClient, sid, variables.noteId);
      return { previous, sid };
    },
    onError: (_err, _variables, context) => {
      restoreSpaceNotesCaches(queryClient, context?.previous);
    },
    onSettled: (_data, _err, variables) => {
      const sid = normalizeSpaceIdForCache(variables.spaceId);
      if (!sid) return;
      // The notes list was never invalidated here, so a deleted note lingered in the
      // cache until a window-focus refetch — long enough to keep feeding Home's
      // "Pick up where you left off", which just reads the live notes array.
      // Prefix-matches every unseenSince variant. In onSettled so a failed delete
      // resyncs too.
      queryClient.invalidateQueries({ queryKey: ['space', sid, 'notes'] });
    },
    onSuccess: (_data, variables) => {
      const sid = normalizeSpaceIdForCache(variables.spaceId);
      if (!sid) return;

      removeSpaceNoteFromCache(queryClient, sid, variables.noteId);
      purgeDeletedNoteClientCaches(queryClient, variables.noteId);

      queryClient.invalidateQueries({ queryKey: ['space', sid, 'bootstrap'] });
      queryClient.invalidateQueries({ queryKey: [...navigationQueryKeyPrefix] });
      queryClient.invalidateQueries({ queryKey: ['prototype', 'space', sid, 'study-threads'] });
      // Home's greeting derives its canon-section line from every fingerprint, not just
      // those of live notes, so a stale list keeps the deleted note's themes on screen.
      queryClient.invalidateQueries({ queryKey: ['note-fingerprints'] });
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
