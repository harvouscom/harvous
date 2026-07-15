import { useAuth } from '@clerk/clerk-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthReady } from '../useAuthReady';
import { APIError, api } from '../../lib/api';
import { HARVOUS_NAV_CACHE_KEY } from '@/utils/user-cache-keys';
import { hasClerkSessionCookieHint, readClerkUserIdForProfileCache } from './useProfile';

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
  createdAt?: string;
}

export interface NavigationData {
  threads: NavThread[];
  spaces: NavSpace[];
  memberOfSpaces: NavSpace[];
  inboxCount: number;
}

/** Prefix for invalidating all per-user navigation queries. */
export const navigationQueryKeyPrefix = ['navigation'] as const;

export function getNavigationQueryKey(userId: string) {
  return ['navigation', userId] as const;
}

/** SessionStorage key for nav snapshot (must clear on thread delete / sign-out). */
export const NAV_SESSION_CACHE_KEY = HARVOUS_NAV_CACHE_KEY;

function getCachedNav(): NavigationData | undefined {
  try {
    const raw = sessionStorage.getItem(NAV_SESSION_CACHE_KEY);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

function setCachedNav(data: NavigationData) {
  try {
    sessionStorage.setItem(NAV_SESSION_CACHE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

export function useNavigation(options?: { enabled?: boolean }) {
  const { userId } = useAuth();
  const authReady = useAuthReady();
  const sessionHint = hasClerkSessionCookieHint();
  const effectiveUserId =
    userId ?? (sessionHint ? readClerkUserIdForProfileCache() : undefined);
  const cachedForSession =
    effectiveUserId && sessionHint ? getCachedNav() : undefined;

  const query = useQuery({
    queryKey: userId ? getNavigationQueryKey(userId) : ['navigation', effectiveUserId ?? ''],
    enabled: (options?.enabled !== false) && authReady && !!userId,
    queryFn: async () => {
      const data = await api.get<NavigationData>('/api/navigation/data');
      setCachedNav(data);
      return data;
    },
    staleTime: 30_000,
    placeholderData: cachedForSession,
    initialData: cachedForSession,
    initialDataUpdatedAt: cachedForSession ? Date.now() - 15_000 : undefined,
    retry: (failureCount, error) => {
      // Don't retry 401 — authReady waits for JWT; retries only spam the console.
      if (error instanceof APIError && error.status === 401) return false;
      return failureCount < 2;
    },
    retryDelay: (attemptIndex) => Math.min(500 * 2 ** attemptIndex, 2000),
  });

  // When the query is disabled (e.g. Clerk still loading) or mid-refetch with no in-memory
  // data, still surface last session's nav so thread routes don't flash "Thread" / paper.
  return {
    ...query,
    data: query.data ?? cachedForSession,
  };
}

export function useRefreshNavigation() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: navigationQueryKeyPrefix });
}
