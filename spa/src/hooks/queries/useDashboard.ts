import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

export type DashboardFilter = 'all' | 'threads' | 'notes' | 'scripture' | 'resources';

export interface ContentItem {
  id: string;
  type: 'note' | 'thread';
  title: string | null;
  content: string | null;
  createdAt: string;
  updatedAt: string;
  threadId?: string;
  threadTitle?: string;
  threadColor?: string;
  backgroundGradient?: string;
  noteCount?: number;
  tags?: string[];
}

interface ContentPage {
  items: ContentItem[];
  hasMore: boolean;
  offset: number;
  limit: number;
}

export function useDashboardContent(
  filter: DashboardFilter = 'all',
  limit = 20,
  options?: { enabled?: boolean }
) {
  return useInfiniteQuery({
    queryKey: ['dashboard', 'content', filter],
    enabled: options?.enabled !== false,
    queryFn: ({ pageParam = 0 }) =>
      api.get<ContentPage>('/api/content/load-more', { offset: pageParam, limit, filter }),
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.offset + lastPage.limit : undefined,
    initialPageParam: 0,
    staleTime: 30_000,
  });
}
