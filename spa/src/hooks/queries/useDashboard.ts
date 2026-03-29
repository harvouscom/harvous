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

const DASHBOARD_CACHE_KEY = 'harvous-dashboard-cache';

function getCachedDashboard(filter: string): { pages: ContentPage[]; pageParams: number[] } | undefined {
  try {
    const raw = sessionStorage.getItem(`${DASHBOARD_CACHE_KEY}-${filter}`);
    return raw ? JSON.parse(raw) : undefined;
  } catch { return undefined; }
}

function setCachedDashboard(filter: string, pages: ContentPage[], pageParams: number[]) {
  try {
    sessionStorage.setItem(`${DASHBOARD_CACHE_KEY}-${filter}`, JSON.stringify({ pages: pages.slice(0, 1), pageParams: pageParams.slice(0, 1) }));
  } catch { /* ignore */ }
}

export function useDashboardContent(
  filter: DashboardFilter = 'all',
  limit = 20,
  options?: { enabled?: boolean }
) {
  const cached = getCachedDashboard(filter);
  return useInfiniteQuery({
    queryKey: ['dashboard', 'content', filter],
    enabled: options?.enabled !== false,
    queryFn: ({ pageParam = 0 }) =>
      api.get<ContentPage>('/api/content/load-more', { offset: pageParam, limit, filter })
        .then(page => {
          if (pageParam === 0) {
            setCachedDashboard(filter, [page], [0]);
          }
          return page;
        }),
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.offset + lastPage.limit : undefined,
    initialPageParam: 0,
    initialData: cached,
    initialDataUpdatedAt: cached ? Date.now() - 15_000 : undefined,
    staleTime: 30_000,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(500 * 2 ** attemptIndex, 2000),
  });
}
