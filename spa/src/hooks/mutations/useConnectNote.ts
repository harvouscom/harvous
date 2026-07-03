import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, APIError } from '../../lib/api';
import { navigationQueryKeyPrefix } from '../queries/useNavigation';
import { runOfflineFirst } from './withOfflineQueue';
import { connectNotesOffline } from '@/utils/offline-mutations';

export interface ConnectNoteVariables {
  parentNoteId: string;
  linkedNoteId: string;
  spaceId: string;
}

interface ConnectNoteResponse {
  success?: boolean;
  alreadyLinked?: boolean;
  error?: string;
  code?: string;
}

function normalizeSpaceId(spaceId: string): string {
  const t = (spaceId ?? '').trim();
  return t.startsWith('space_') ? t : t ? `space_${t}` : '';
}

/** Persists `/prototype` strip edge: picked note becomes child of parent (`linkedFromNoteId`). */
export function useConnectNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (vars: ConnectNoteVariables) => {
      const sid = normalizeSpaceId(vars.spaceId);
      const outcome = await runOfflineFirst({
        online: () =>
          api.post<ConnectNoteResponse>('/api/notes/connect-link', {
            parentNoteId: vars.parentNoteId,
            linkedNoteId: vars.linkedNoteId,
          }),
        offline: (userId) =>
          connectNotesOffline(userId, {
            fromNoteId: vars.parentNoteId,
            toNoteId: vars.linkedNoteId,
            spaceId: sid || null,
          }),
      });
      if (outcome.queued) {
        return { success: true } satisfies ConnectNoteResponse;
      }
      return outcome.online!;
    },
    onSuccess: (_data, vars) => {
      const sid = normalizeSpaceId(vars.spaceId);
      queryClient.invalidateQueries({ queryKey: ['note', vars.parentNoteId] });
      queryClient.invalidateQueries({ queryKey: ['note', vars.linkedNoteId] });
      // Study thread tree can be re-rooted from either endpoint of the new edge.
      queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) &&
          query.queryKey[0] === 'prototype' &&
          query.queryKey[1] === 'note' &&
          query.queryKey[3] === 'thread',
      });
      queryClient.invalidateQueries({ queryKey: ['prototype', 'space', sid, 'study-threads'] });
      queryClient.invalidateQueries({ queryKey: ['space', sid, 'notes'] });
      queryClient.invalidateQueries({ queryKey: ['space', sid, 'bootstrap'] });
      queryClient.invalidateQueries({ queryKey: ['connectNoteCandidates'] });
      queryClient.invalidateQueries({ queryKey: [...navigationQueryKeyPrefix] });
      try {
        window.dispatchEvent(
          new CustomEvent('noteUpdated', { detail: { noteId: vars.parentNoteId } }),
        );
        window.dispatchEvent(
          new CustomEvent('noteUpdated', { detail: { noteId: vars.linkedNoteId } }),
        );
      } catch {
        /* ignore */
      }
    },
    onError: (err) => {
      const msg =
        err instanceof APIError ? err.message : err instanceof Error ? err.message : 'Could not connect note';
      try {
        window.toast?.error(msg);
      } catch {
        /* ignore */
      }
    },
  });
}
