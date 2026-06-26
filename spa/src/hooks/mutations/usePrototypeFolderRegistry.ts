import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthReady } from '../useAuthReady';
import { api } from '../../lib/api';
import { normalizePrototypeApiSpaceId } from '../../utils/prototype-space-api-id';

interface FolderRegistryResponse {
  labels: string[];
}

export function prototypeFolderRegistryQueryKey(spaceId: string | undefined) {
  const id = normalizePrototypeApiSpaceId(spaceId);
  return ['prototype', 'space', id, 'folder-registry'] as const;
}

export function usePrototypeFolderRegistry(spaceId: string | undefined) {
  const authReady = useAuthReady();
  const id = normalizePrototypeApiSpaceId(spaceId);
  return useQuery({
    queryKey: prototypeFolderRegistryQueryKey(id),
    enabled: authReady && Boolean(id),
    queryFn: async () => {
      const res = await api.get<FolderRegistryResponse>(
        `/api/spaces/${encodeURIComponent(id!)}/folder-registry`,
      );
      return res.labels ?? [];
    },
    staleTime: 30_000,
  });
}

interface CreateFolderRegistryInput {
  spaceId: string;
  folderName: string;
}

export function useCreateFolderRegistryLabel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ spaceId, folderName }: CreateFolderRegistryInput) => {
      const sid = normalizePrototypeApiSpaceId(spaceId);
      return api.post<{ success?: boolean; labels?: string[] }>(
        `/api/spaces/${encodeURIComponent(sid)}/folders/create`,
        { folderName },
      );
    },
    onSuccess: (data, variables) => {
      const sid = normalizePrototypeApiSpaceId(variables.spaceId);
      queryClient.setQueryData(prototypeFolderRegistryQueryKey(sid), data.labels ?? []);
      queryClient.invalidateQueries({ queryKey: ['space', sid, 'notes'] });
    },
  });
}
