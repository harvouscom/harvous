import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api, APIError } from '../../lib/api';
import { deletedSpacesQueryKey, type DeletedSpacesResponse } from '../queries/useDeletedSpaces';
import { navigationQueryKeyPrefix } from '../queries/useNavigation';

function normalizedSpaceIdForApi(spaceId: string): string {
  return spaceId.startsWith('space_') ? spaceId : `space_${spaceId}`;
}

function removeDeletedSpaceRow(queryClient: QueryClient, spaceId: string) {
  const sid = normalizedSpaceIdForApi(spaceId);
  queryClient.setQueryData<DeletedSpacesResponse>(deletedSpacesQueryKey, (current) =>
    current ? { spaces: current.spaces.filter((space) => space.id !== sid) } : current,
  );
}

export async function invalidateRestoredSpaceQueries(queryClient: QueryClient, spaceId: string) {
  removeDeletedSpaceRow(queryClient, spaceId);

  await Promise.all([
    queryClient.invalidateQueries({ queryKey: navigationQueryKeyPrefix }),
    queryClient.invalidateQueries({ queryKey: deletedSpacesQueryKey }),
    queryClient.invalidateQueries({ queryKey: ['spaces'] }),
    queryClient.invalidateQueries({ queryKey: ['space'] }),
    queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
    queryClient.invalidateQueries({ queryKey: ['thread'] }),
  ]);
}

export function isUnavailableDeletedSpaceError(error: unknown): boolean {
  return error instanceof APIError && (error.status === 404 || error.status === 409);
}

export async function refetchUnavailableDeletedSpace(queryClient: QueryClient, spaceId: string) {
  removeDeletedSpaceRow(queryClient, spaceId);
  await queryClient.invalidateQueries({ queryKey: deletedSpacesQueryKey });
  await queryClient.refetchQueries({ queryKey: deletedSpacesQueryKey, type: 'active' });
}

export function useRestoreSpace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (spaceId: string) => {
      const sid = normalizedSpaceIdForApi(spaceId);
      return api.post<{ success: boolean; space: { id: string } }>(`/api/spaces/${encodeURIComponent(sid)}/restore`);
    },
    onSuccess: (_response, spaceId) => invalidateRestoredSpaceQueries(queryClient, spaceId),
    onError: (error, spaceId) => {
      if (isUnavailableDeletedSpaceError(error)) {
        return refetchUnavailableDeletedSpace(queryClient, spaceId);
      }
    },
  });
}
