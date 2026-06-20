import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { spaceNotesQueryKey } from '../../lib/space-notes-cache';
import { normalizePrototypeApiSpaceId } from '../../utils/prototype-space-api-id';

interface RemoveFolderInput {
  spaceId: string;
  folderName: string;
}

interface RemoveFolderResponse {
  success?: boolean;
  updatedCount?: number;
  error?: string;
}

export function useRemoveFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ spaceId, folderName }: RemoveFolderInput) => {
      const sid = normalizePrototypeApiSpaceId(spaceId);
      return api.post<RemoveFolderResponse>(`/api/spaces/${encodeURIComponent(sid)}/folders/remove`, {
        folderName,
      });
    },
    onSuccess: (_data, variables) => {
      const sid = normalizePrototypeApiSpaceId(variables.spaceId);
      queryClient.invalidateQueries({ queryKey: spaceNotesQueryKey(sid) });
    },
  });
}
