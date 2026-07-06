import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { navigationQueryKeyPrefix } from '../queries/useNavigation';
import type { ThreadColor } from '@/utils/colors';

interface UpdateSharedSpaceInput {
  spaceId: string;
  title: string;
  color: ThreadColor | string;
  description?: string | null;
}

export function useUpdateSharedSpace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ spaceId, title, color, description }: UpdateSharedSpaceInput) => {
      const sid = spaceId.startsWith('space_') ? spaceId : `space_${spaceId}`;
      const form = new FormData();
      form.set('title', title);
      form.set('color', color);
      if (description !== undefined) {
        form.set('description', description ?? '');
      }
      return api.post<{ success: string; space: { id: string; title: string; color?: string; description?: string | null } }>(
        `/api/spaces/${encodeURIComponent(sid)}/update`,
        form,
      );
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: navigationQueryKeyPrefix });
      void queryClient.invalidateQueries({ queryKey: ['space', variables.spaceId] });
    },
  });
}
