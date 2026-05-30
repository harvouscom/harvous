import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

export interface OwnedSharedSpaceItem {
  id: string;
  title: string;
  color?: string | null;
  memberCount: number;
  shareToken?: string | null;
  shareUrl?: string;
}

export interface MySharedSpacesResponse {
  owned: OwnedSharedSpaceItem[];
  memberOf: OwnedSharedSpaceItem[];
}

export const mySharedSpacesQueryKey = ['profile', 'my-shared-spaces'] as const;

export function useMySharedSpaces() {
  return useQuery({
    queryKey: mySharedSpacesQueryKey,
    queryFn: () => api.get<MySharedSpacesResponse>('/api/profile/my-shared-spaces'),
    staleTime: 30_000,
  });
}
