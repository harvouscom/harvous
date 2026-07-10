import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { navigationQueryKeyPrefix } from '../queries/useNavigation';
import { spaceGroupThreadsQueryKey } from '../queries/useSpaceGroupThreads';
import { normalizePrototypeApiSpaceId } from '../../utils/prototype-space-api-id';

export type DeleteSharedThreadInput = {
  spaceId: string;
  threadId: string;
};

export function buildDeleteSharedThreadRequest(threadId: string) {
  return {
    url: `/api/threads/delete?threadId=${encodeURIComponent(threadId)}`,
  };
}

export function useDeleteSharedThread() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ threadId }: DeleteSharedThreadInput) => {
      const { url } = buildDeleteSharedThreadRequest(threadId);
      return api.delete<{ success?: string; threadId?: string }>(url);
    },
    onSuccess: (_data, variables) => {
      const spaceId = normalizePrototypeApiSpaceId(variables.spaceId);
      queryClient.invalidateQueries({ queryKey: spaceGroupThreadsQueryKey(spaceId) });
      if (spaceId) {
        queryClient.invalidateQueries({ queryKey: ['space', spaceId, 'bootstrap'] });
        queryClient.invalidateQueries({ queryKey: ['space', spaceId, 'notes'] });
      }
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: [...navigationQueryKeyPrefix] });
      queryClient.invalidateQueries({
        queryKey: ['thread', variables.threadId, 'notes'],
      });
    },
  });
}
