import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, APIError } from '../../lib/api';
import { navigationQueryKeyPrefix } from '../queries/useNavigation';
import { runOfflineFirst } from './withOfflineQueue';
import { disconnectNotesOffline } from '@/utils/offline-mutations';

export interface DisconnectNoteVariables {
  fromNoteId: string;
  toNoteId: string;
}

/**
 * Removes an edge from the NoteConnections graph via DELETE /api/notes/connect-link.
 * Invalidates the thread graph and note detail caches for both endpoints.
 */
export function useDisconnectNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (vars: DisconnectNoteVariables) => {
      const outcome = await runOfflineFirst({
        online: () =>
          api.delete<{ success: boolean }>('/api/notes/connect-link', {
            fromNoteId: vars.fromNoteId,
            toNoteId: vars.toNoteId,
          }),
        offline: (userId) =>
          disconnectNotesOffline(userId, vars.fromNoteId, vars.toNoteId).then(() => undefined),
      });
      if (outcome.queued) {
        return { success: true };
      }
      return outcome.online!;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) &&
          query.queryKey[0] === 'prototype' &&
          query.queryKey[1] === 'note' &&
          query.queryKey[3] === 'thread',
      });
      queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) &&
          query.queryKey[0] === 'prototype' &&
          query.queryKey[1] === 'space' &&
          query.queryKey[3] === 'study-threads',
      });
      queryClient.invalidateQueries({ queryKey: ['note', vars.fromNoteId] });
      queryClient.invalidateQueries({ queryKey: ['note', vars.toNoteId] });
      queryClient.invalidateQueries({ queryKey: ['connectNoteCandidates'] });
      queryClient.invalidateQueries({ queryKey: [...navigationQueryKeyPrefix] });
      try {
        window.dispatchEvent(new CustomEvent('noteUpdated', { detail: { noteId: vars.fromNoteId } }));
        window.dispatchEvent(new CustomEvent('noteUpdated', { detail: { noteId: vars.toNoteId } }));
      } catch {
        /* ignore */
      }
    },
    onError: (err) => {
      const msg =
        err instanceof APIError ? err.message : err instanceof Error ? err.message : 'Could not disconnect note';
      try {
        window.toast?.error(msg);
      } catch {
        /* ignore */
      }
    },
  });
}
