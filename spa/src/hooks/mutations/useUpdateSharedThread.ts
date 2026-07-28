import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { navigationQueryKeyPrefix } from '../queries/useNavigation';
import { spaceGroupThreadsQueryKey, type SpaceGroupStudyThread } from '../queries/useSpaceGroupThreads';
import { normalizePrototypeApiSpaceId } from '../../utils/prototype-space-api-id';
import { validSharedThreadColor } from './useCreateSharedThread';

export type UpdateSharedThreadInput = {
  spaceId: string;
  threadId: string;
  title: string;
  color?: string | null;
};

type UpdateSharedThreadResponse = {
  success?: string;
  thread?: SpaceGroupStudyThread;
  error?: string;
};

export function buildUpdateSharedThreadFormData(input: UpdateSharedThreadInput): FormData {
  const formData = new FormData();
  formData.set('id', input.threadId);
  formData.set('title', input.title.trim());
  formData.set('color', validSharedThreadColor(input.color));
  return formData;
}

export function useUpdateSharedThread() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateSharedThreadInput) => {
      const response = await api.post<UpdateSharedThreadResponse>(
        '/api/threads/update',
        buildUpdateSharedThreadFormData(input),
      );
      if (response.error) throw new Error(response.error);
      if (!response.thread?.id) throw new Error('Thread update did not return a Thread');
      return response.thread;
    },
    onSuccess: (thread, variables) => {
      window.toast?.success('Thread renamed');
      const spaceId = normalizePrototypeApiSpaceId(variables.spaceId);
      queryClient.invalidateQueries({ queryKey: spaceGroupThreadsQueryKey(spaceId) });
      if (spaceId) {
        queryClient.invalidateQueries({ queryKey: ['space', spaceId, 'bootstrap'] });
      }
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: [...navigationQueryKeyPrefix] });
      queryClient.invalidateQueries({
        queryKey: ['thread', thread.id, 'notes'],
      });
    },
  });
}
