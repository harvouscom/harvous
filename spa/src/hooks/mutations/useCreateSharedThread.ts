import { useMutation, useQueryClient } from '@tanstack/react-query';
import { THREAD_COLORS, type ThreadColor } from '@/utils/colors';
import { api } from '../../lib/api';
import { navigationQueryKeyPrefix } from '../queries/useNavigation';
import { spaceGroupThreadsQueryKey, type SpaceGroupStudyThread } from '../queries/useSpaceGroupThreads';
import { normalizePrototypeApiSpaceId } from '../../utils/prototype-space-api-id';

export type CreateSharedThreadInput = {
  spaceId: string;
  title: string;
  color?: string | null;
};

export type CreatedSharedThread = Omit<SpaceGroupStudyThread, 'noteCount' | 'ownerUserId'> & {
  noteCount?: number;
  ownerUserId?: string;
};

type CreateSharedThreadResponse = {
  thread?: CreatedSharedThread;
};

export function validSharedThreadColor(color: string | null | undefined): ThreadColor {
  return THREAD_COLORS.includes(color as ThreadColor) ? (color as ThreadColor) : 'paper';
}

export function buildCreateSharedThreadFormData(input: CreateSharedThreadInput): FormData {
  const formData = new FormData();
  formData.set('title', input.title.trim());
  formData.set('color', validSharedThreadColor(input.color));
  formData.set('spaceId', normalizePrototypeApiSpaceId(input.spaceId) ?? '');
  formData.set('isPublic', 'false');
  formData.set('selectedNoteIds', JSON.stringify([]));
  return formData;
}

export function useCreateSharedThread() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateSharedThreadInput) => {
      const response = await api.post<CreateSharedThreadResponse>(
        '/api/threads/create',
        buildCreateSharedThreadFormData(input),
      );
      if (!response.thread?.id) throw new Error('Thread creation did not return a Thread');
      return response.thread;
    },
    onSuccess: (_thread, variables) => {
      const spaceId = normalizePrototypeApiSpaceId(variables.spaceId);
      queryClient.invalidateQueries({ queryKey: spaceGroupThreadsQueryKey(spaceId) });
      if (spaceId) queryClient.invalidateQueries({ queryKey: ['space', spaceId, 'bootstrap'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: [...navigationQueryKeyPrefix] });
    },
  });
}
