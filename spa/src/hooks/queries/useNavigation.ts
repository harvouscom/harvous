import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, APIError } from '../../lib/api';

export interface NavThread {
  id: string;
  title: string;
  color: string | null;
  noteCount: number;
  spaceId: string | null;
  backgroundGradient: string;
  accentColor: string;
  isPinned: boolean;
}

export interface NavSpace {
  id: string;
  title: string;
  color: string | null;
  backgroundGradient: string;
  ownerId: string;
  memberCount: number;
  isPublic?: boolean;
}

export interface NavigationData {
  threads: NavThread[];
  spaces: NavSpace[];
  memberOfSpaces: NavSpace[];
  inboxCount: number;
}

export const navigationQueryKey = ['navigation'] as const;

const NAV_CACHE_KEY = 'harvous-nav-cache';

function getCachedNav(): NavigationData | undefined {
  try {
    const raw = sessionStorage.getItem(NAV_CACHE_KEY);
    return raw ? JSON.parse(raw) : undefined;
  } catch { return undefined; }
}

function setCachedNav(data: NavigationData) {
  try { sessionStorage.setItem(NAV_CACHE_KEY, JSON.stringify(data)); } catch { /* ignore */ }
}

export function useNavigation(options?: { enabled?: boolean }) {
  const cached = getCachedNav();
  return useQuery({
    queryKey: navigationQueryKey,
    enabled: options?.enabled !== false,
    queryFn: async () => {
      const res = await fetch('/api/navigation/data', { credentials: 'include' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new APIError(res.status, (body as { error?: string })?.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as NavigationData;
      setCachedNav(data);
      return data;
    },
    staleTime: 30_000,
    initialData: cached,
    initialDataUpdatedAt: cached ? Date.now() - 15_000 : undefined,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(500 * 2 ** attemptIndex, 2000),
  });
}

export function useRefreshNavigation() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: navigationQueryKey });
}
