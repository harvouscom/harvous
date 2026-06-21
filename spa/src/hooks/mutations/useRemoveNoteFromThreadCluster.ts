import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { navigationQueryKeyPrefix } from '../queries/useNavigation';
import { normalizePrototypeApiSpaceId } from '../../utils/prototype-space-api-id';

interface RemoveNoteFromThreadClusterInput {
  spaceId: string;
  memberIds: string[];
  noteId: string;
}

interface RemoveNoteFromThreadClusterResponse {
  success?: boolean;
  removedEdgeCount?: number;
  error?: string;
}

/** Disconnect a single note from a study-thread cluster (other cluster members stay connected). */
export function useRemoveNoteFromThreadCluster() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ spaceId, memberIds, noteId }: RemoveNoteFromThreadClusterInput) => {
      const sid = normalizePrototypeApiSpaceId(spaceId);
      return api.post<RemoveNoteFromThreadClusterResponse>(
        `/api/spaces/${encodeURIComponent(sid)}/threads/remove`,
        { memberIds, noteId },
      );
    },
    onSuccess: (_data, variables) => {
      const sid = normalizePrototypeApiSpaceId(variables.spaceId);
      queryClient.invalidateQueries({ queryKey: ['prototype', 'space', sid, 'study-threads'] });
      queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) &&
          query.queryKey[0] === 'prototype' &&
          query.queryKey[1] === 'note' &&
          query.queryKey[3] === 'thread',
      });
      for (const id of variables.memberIds) {
        queryClient.invalidateQueries({ queryKey: ['note', id] });
      }
      queryClient.invalidateQueries({ queryKey: ['connectNoteCandidates'] });
      queryClient.invalidateQueries({ queryKey: [...navigationQueryKeyPrefix] });
    },
  });
}
