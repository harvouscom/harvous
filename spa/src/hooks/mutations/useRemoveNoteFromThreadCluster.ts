import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { navigationQueryKeyPrefix } from '../queries/useNavigation';
import { normalizePrototypeApiSpaceId } from '../../utils/prototype-space-api-id';
import { runOfflineFirst } from './withOfflineQueue';
import { removeNoteFromThreadClusterOffline } from '@/utils/offline-mutations';

interface RemoveNoteFromThreadClusterInput {
  spaceId: string;
  memberIds: string[];
  noteId: string;
  edges?: Array<{ fromNoteId: string; toNoteId: string }>;
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
    mutationFn: async ({ spaceId, memberIds, noteId, edges }: RemoveNoteFromThreadClusterInput) => {
      const sid = normalizePrototypeApiSpaceId(spaceId);
      const outcome = await runOfflineFirst({
        online: () =>
          api.post<RemoveNoteFromThreadClusterResponse>(
            `/api/spaces/${encodeURIComponent(sid)}/threads/remove`,
            { memberIds, noteId },
          ),
        offline: (userId) =>
          removeNoteFromThreadClusterOffline(userId, { memberIds, noteId, edges }).then(() => undefined),
      });
      if (outcome.queued) {
        return { success: true } satisfies RemoveNoteFromThreadClusterResponse;
      }
      return outcome.online!;
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
