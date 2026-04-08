import { useAuth } from '@clerk/clerk-react';
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { APIError } from '../../lib/api';
import { HARVOUS_FEATURED_DISMISSED_CACHE_KEY } from '@/utils/user-cache-keys';

export type DismissedFeaturedItem = {
  id: string;
  contentType: 'space' | 'thread' | 'recall' | 'challenge' | 'church';
  title: string;
  description: string | null;
  refId: string | null;
  shareToken: string | null;
  color: string | null;
  dismissedAt: string | null;
};

type CachedDismissedPayload = {
  userId: string;
  items: DismissedFeaturedItem[];
};

/** Invalidate all per-user dismissed featured queries. */
export const featuredDismissedQueryPrefix = ['featured', 'dismissed'] as const;

export function getFeaturedDismissedQueryKey(userId: string) {
  return [...featuredDismissedQueryPrefix, userId] as const;
}

function readCachedDismissed(userId: string | undefined): DismissedFeaturedItem[] | undefined {
  if (!userId || typeof sessionStorage === 'undefined') return undefined;
  try {
    const raw = sessionStorage.getItem(HARVOUS_FEATURED_DISMISSED_CACHE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as CachedDismissedPayload;
    if (parsed?.userId === userId && Array.isArray(parsed.items)) {
      return parsed.items;
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

export function writeCachedDismissed(userId: string, items: DismissedFeaturedItem[]) {
  try {
    sessionStorage.setItem(HARVOUS_FEATURED_DISMISSED_CACHE_KEY, JSON.stringify({ userId, items }));
  } catch {
    /* ignore */
  }
}

async function fetchFeaturedDismissed(): Promise<DismissedFeaturedItem[]> {
  const res = await fetch('/api/featured/dismissed', { credentials: 'include', cache: 'no-store' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new APIError(res.status, (body as { error?: string })?.error ?? `HTTP ${res.status}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? (data as DismissedFeaturedItem[]) : [];
}

export function useFeaturedDismissed(options?: { enabled?: boolean }) {
  const { userId, isLoaded, isSignedIn } = useAuth();
  const enabled = (options?.enabled !== false) && isLoaded && isSignedIn && !!userId;
  const cached = userId ? readCachedDismissed(userId) : undefined;

  return useQuery({
    queryKey: userId ? getFeaturedDismissedQueryKey(userId) : [...featuredDismissedQueryPrefix, ''],
    queryFn: async () => {
      const data = await fetchFeaturedDismissed();
      if (userId) writeCachedDismissed(userId, data);
      return data;
    },
    enabled,
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    placeholderData: cached,
    initialData: cached,
    initialDataUpdatedAt: cached ? Date.now() - 20_000 : undefined,
    retry: 1,
    retryDelay: 400,
  });
}

/**
 * Hydrate React Query + session snapshot, then fetch so My Inbox opens without waiting on cold cache.
 * Call when `userId` is known (e.g. AppLayout after Clerk is ready).
 */
export function prefetchFeaturedDismissed(queryClient: QueryClient, userId: string) {
  const cached = readCachedDismissed(userId);
  const key = getFeaturedDismissedQueryKey(userId);
  if (cached) {
    queryClient.setQueryData(key, cached);
  }
  return queryClient.prefetchQuery({
    queryKey: key,
    queryFn: async () => {
      const data = await fetchFeaturedDismissed();
      writeCachedDismissed(userId, data);
      return data;
    },
    staleTime: 30_000,
  });
}
