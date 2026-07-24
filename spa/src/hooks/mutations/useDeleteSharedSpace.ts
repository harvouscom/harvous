import { useAuth } from '@clerk/clerk-react';
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { HARVOUS_SPACE_NOTES_CACHE_PREFIX } from '@/utils/user-cache-keys';
import { api, APIError } from '../../lib/api';
import {
  navigationQueryKeyPrefix,
  removeOwnedSpaceFromNavCache,
} from '../queries/useNavigation';
import { deletedSpacesQueryKey } from '../queries/useDeletedSpaces';
import { clearCachedSpaceBootstrap } from '../queries/useSpace';
import { PROTO_LAST_SPACE_KEY } from '../../layouts/proto-session-keys';

function normalizedSpaceIdForApi(spaceId: string): string {
  return spaceId.startsWith('space_') ? spaceId : `space_${spaceId}`;
}

function clearDeletedSpaceSessionCaches(spaceId: string) {
  try {
    clearCachedSpaceBootstrap(spaceId);
    sessionStorage.removeItem(`${HARVOUS_SPACE_NOTES_CACHE_PREFIX}${spaceId}`);
    if (localStorage.getItem(PROTO_LAST_SPACE_KEY) === spaceId) {
      localStorage.removeItem(PROTO_LAST_SPACE_KEY);
    }
    const justJoinedRaw = sessionStorage.getItem('harvous_just_joined_space');
    if (justJoinedRaw) {
      const justJoined = JSON.parse(justJoinedRaw) as { id?: string };
      const joinedId = justJoined.id ? normalizedSpaceIdForApi(justJoined.id) : null;
      if (joinedId === spaceId) sessionStorage.removeItem('harvous_just_joined_space');
    }
  } catch {
    // Cache cleanup must never block deletion.
  }
}

export function applyDeletedSpaceClientState(
  queryClient: QueryClient,
  userId: string | null | undefined,
  spaceId: string,
) {
  const sid = normalizedSpaceIdForApi(spaceId);
  if (userId) removeOwnedSpaceFromNavCache(queryClient, userId, sid);
  clearDeletedSpaceSessionCaches(sid);
  queryClient.removeQueries({ queryKey: ['space', sid] });
  void queryClient.invalidateQueries({ queryKey: navigationQueryKeyPrefix });
  void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  void queryClient.invalidateQueries({ queryKey: ['spaces'] });
  void queryClient.invalidateQueries({ queryKey: deletedSpacesQueryKey });
  void queryClient.invalidateQueries({ queryKey: ['thread'] });
  void queryClient.invalidateQueries({ queryKey: ['space'] });
}

export function isDeletedSpaceUnavailableError(error: unknown): boolean {
  return error instanceof APIError && (error.status === 404 || error.status === 409);
}

/** Soft-delete a shared space into its owner-only recovery window. */
export function useDeleteSharedSpace() {
  const queryClient = useQueryClient();
  const { userId } = useAuth();

  return useMutation({
    mutationFn: (spaceId: string) => {
      const sid = normalizedSpaceIdForApi(spaceId);
      return api.delete<{
        success: string;
        spaceId: string;
        deletedAt: string;
        recoveryUntil: string;
        recoverable: true;
      }>(`/api/spaces/delete?spaceId=${encodeURIComponent(sid)}`);
    },
    onSuccess: (_data, spaceId) => {
      applyDeletedSpaceClientState(queryClient, userId, spaceId);
    },
    onError: (error, spaceId) => {
      if (isDeletedSpaceUnavailableError(error)) {
        applyDeletedSpaceClientState(queryClient, userId, spaceId);
      }
    },
  });
}
