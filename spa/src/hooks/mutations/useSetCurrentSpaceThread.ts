import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { navigationQueryKeyPrefix } from '../queries/useNavigation';
import { spaceGroupThreadsQueryKey } from '../queries/useSpaceGroupThreads';
import { normalizePrototypeApiSpaceId } from '../../utils/prototype-space-api-id';

export type SetCurrentSpaceThreadInput = {
  spaceId: string;
  threadId: string;
};

export function buildSetCurrentSpaceThreadRequest(input: SetCurrentSpaceThreadInput) {
  const spaceId = normalizePrototypeApiSpaceId(input.spaceId) ?? '';
  return {
    url: `/api/spaces/${encodeURIComponent(spaceId)}/pin-item`,
    body: {
      itemId: input.threadId,
      itemType: 'thread' as const,
      isPinned: true,
    },
  };
}

export async function createThenSetCurrentThread<T extends { id: string }>(
  create: () => Promise<T>,
  setCurrent: (threadId: string) => Promise<unknown>,
): Promise<T> {
  const thread = await create();
  await setCurrent(thread.id);
  return thread;
}

export function useSetCurrentSpaceThread() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SetCurrentSpaceThreadInput) => {
      const request = buildSetCurrentSpaceThreadRequest(input);
      await api.post<{ success: boolean }>(request.url, request.body);
      return input;
    },
    onSuccess: (input) => {
      const spaceId = normalizePrototypeApiSpaceId(input.spaceId);
      queryClient.invalidateQueries({ queryKey: spaceGroupThreadsQueryKey(spaceId) });
      if (spaceId) queryClient.invalidateQueries({ queryKey: ['space', spaceId, 'bootstrap'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: [...navigationQueryKeyPrefix] });
    },
  });
}
