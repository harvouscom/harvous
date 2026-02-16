import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

export interface SpaceDetail {
  id: string;
  title: string;
  color: string | null;
  backgroundGradient: string;
  ownerId: string;
  memberCount: number;
  isPublic: boolean;
}

export interface SpaceItem {
  id: string;
  type: 'note' | 'thread';
  title: string | null;
  content: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SpaceItemsPage {
  items: SpaceItem[];
  hasMore: boolean;
  offset: number;
  limit: number;
}

export function useSpace(spaceId: string) {
  return useQuery({
    queryKey: ['space', spaceId],
    // Prefetch endpoint returns { space: SpaceDetail }
    queryFn: () =>
      api.get<{ space: SpaceDetail }>(`/api/spaces/${spaceId}/prefetch`)
        .then(res => res.space),
    enabled: !!spaceId,
    staleTime: 30_000,
  });
}

export function useSpaceNotes(spaceId: string, limit = 20) {
  return useInfiniteQuery({
    queryKey: ['space', spaceId, 'notes'],
    queryFn: ({ pageParam = 0 }) =>
      api.get<SpaceItemsPage>(`/api/spaces/${spaceId}/notes`, { offset: pageParam, limit }),
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.offset + lastPage.limit : undefined,
    initialPageParam: 0,
    enabled: !!spaceId,
    staleTime: 30_000,
  });
}

export function useSpaceMembers(spaceId: string) {
  return useQuery({
    queryKey: ['space', spaceId, 'members'],
    queryFn: () => api.get<{ members: unknown[] }>(`/api/spaces/${spaceId}/members`),
    enabled: !!spaceId,
  });
}
