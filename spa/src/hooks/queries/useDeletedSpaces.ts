import { useQuery } from '@tanstack/react-query';
import type { SpaceCoverBg } from '@/utils/space-cover';
import { api } from '../../lib/api';

export interface DeletedSpaceItem {
  id: string;
  title: string;
  color: string | null;
  backgroundGradient: string | null;
  coverBgLight: SpaceCoverBg | null;
  coverBgDark: SpaceCoverBg | null;
  deletedAt: string;
  recoveryUntil: string;
}

export interface DeletedSpacesResponse {
  spaces: DeletedSpaceItem[];
}

export const deletedSpacesQueryKey = ['spaces', 'deleted'] as const;

export function useDeletedSpaces() {
  return useQuery({
    queryKey: deletedSpacesQueryKey,
    queryFn: () => api.get<DeletedSpacesResponse>('/api/spaces/deleted'),
    staleTime: 30_000,
  });
}
