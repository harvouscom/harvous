import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, APIError } from '../../lib/api';
import { navigationQueryKeyPrefix } from '../queries/useNavigation';

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

/** Persists `/prototype` strip edge: picked note becomes child of parent (`linkedFromNoteId`). */
export function useConnectNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (vars: ConnectNoteVariables) =>
      api.post<ConnectNoteResponse>('/api/notes/connect-link', {
        parentNoteId: vars.parentNoteId,
        linkedNoteId: vars.linkedNoteId,
      }),
    onSuccess: (_data, vars) => {
      const sid = vars.spaceId.startsWith('space_') ? vars.spaceId : `space_${vars.spaceId}`;
      queryClient.invalidateQueries({ queryKey: ['note', vars.parentNoteId] });
      queryClient.invalidateQueries({ queryKey: ['note', vars.linkedNoteId] });
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
