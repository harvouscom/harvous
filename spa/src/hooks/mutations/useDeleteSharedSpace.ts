import { useAuth } from '@clerk/clerk-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import {
  navigationQueryKeyPrefix,
  removeOwnedSpaceFromNavCache,
} from '../queries/useNavigation';

function normalizedSpaceIdForApi(spaceId: string): string {
  return spaceId.startsWith('space_') ? spaceId : `space_${spaceId}`;
}

/** Permanently delete a shared space (owner-only; server enforces ownership). */
export function useDeleteSharedSpace() {
  const queryClient = useQueryClient();
  const { userId } = useAuth();

  return useMutation({
    mutationFn: (spaceId: string) => {
      const sid = normalizedSpaceIdForApi(spaceId);
      return api.delete<{ success: string; spaceId: string }>(`/api/spaces/delete?spaceId=${encodeURIComponent(sid)}`);
    },
    onSuccess: (_data, spaceId) => {
      if (userId) {
        removeOwnedSpaceFromNavCache(queryClient, userId, spaceId);
      }
      queryClient.invalidateQueries({ queryKey: navigationQueryKeyPrefix });
    },
  });
}
