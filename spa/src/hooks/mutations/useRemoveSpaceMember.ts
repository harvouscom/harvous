import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { navigationQueryKeyPrefix } from '../queries/useNavigation';

function normalizedSpaceIdForApi(spaceId: string): string {
  return spaceId.startsWith('space_') ? spaceId : `space_${spaceId}`;
}

/** Remove a member from a shared space, or leave when removing yourself. */
export function useRemoveSpaceMember(spaceId: string) {
  const queryClient = useQueryClient();
  const sid = normalizedSpaceIdForApi(spaceId);

  return useMutation({
    mutationFn: (userId: string) =>
      api.delete<{ success: boolean; message?: string }>(`/api/spaces/${sid}/members/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['space', sid, 'members'] });
      queryClient.invalidateQueries({ queryKey: navigationQueryKeyPrefix });
    },
  });
}
