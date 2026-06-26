import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { normalizePrototypeApiSpaceId } from '../../utils/prototype-space-api-id';
import { prototypeFolderRegistryQueryKey } from './usePrototypeFolderRegistry';

interface RemoveFolderRegistryLabelInput {
  spaceId: string;
  folderName: string;
}

/** Remove a label from the empty-folder registry after notes carry it. */
export function useRemoveFolderRegistryLabel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ spaceId, folderName }: RemoveFolderRegistryLabelInput) => {
      const sid = normalizePrototypeApiSpaceId(spaceId);
      return api.post<{ success?: boolean; labels?: string[] }>(
        `/api/spaces/${encodeURIComponent(sid)}/folder-registry/remove-label`,
        { folderName },
      );
    },
    onSuccess: (data, variables) => {
      const sid = normalizePrototypeApiSpaceId(variables.spaceId);
      queryClient.setQueryData(prototypeFolderRegistryQueryKey(sid), data.labels ?? []);
    },
  });
}
