import { useAuth } from '@clerk/clerk-react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { APIError } from '../../lib/api';
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
  /** 'personal' | 'shared' | 'public' — absent on some legacy cached snapshots, treat as 'personal'. */
  type?: 'personal' | 'shared' | 'public';
  /** Present on memberOfSpaces entries only. */
  role?: 'owner' | 'leader' | 'member';
  /** Notes updated since this member last opened the space dashboard. */
  newNoteCount?: number;
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

function writeCachedNav(data: NavigationData) {
  try {
    sessionStorage.setItem(NAV_SESSION_CACHE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

/** Append a newly created owned shared space so useActiveSpace resolves before refetch. */
export function appendOwnedSpaceToNavCache(
  queryClient: QueryClient,
  userId: string,
  space: {
    id: string;
    title: string;
    color: string | null;
    backgroundGradient: string | null;
  },
): void {
  const key = getNavigationQueryKey(userId);
  const normalizedId = space.id.startsWith('space_') ? space.id : `space_${space.id}`;

  queryClient.setQueryData<NavigationData>(key, (old) => {
    const base: NavigationData = old ?? {
      threads: [],
      spaces: [],
      memberOfSpaces: [],
      inboxCount: 0,
    };
    if (base.spaces.some((s) => s.id === normalizedId || s.id === space.id)) {
      return base;
    }
    const row: NavSpace = {
      id: normalizedId,
      title: space.title,
      color: space.color,
      backgroundGradient: space.backgroundGradient ?? '',
      ownerId: userId,
      memberCount: 1,
      type: 'shared',
    };
    return { ...base, spaces: [...base.spaces, row] };
  });

  const updated = queryClient.getQueryData<NavigationData>(key);
  if (updated) writeCachedNav(updated);
}

/** Remove a deleted owned space from navigation cache before refetch completes. */
export function removeOwnedSpaceFromNavCache(
  queryClient: QueryClient,
  userId: string,
  spaceId: string,
): void {
  const key = getNavigationQueryKey(userId);
  const normalizedId = spaceId.startsWith('space_') ? spaceId : `space_${spaceId}`;

  queryClient.setQueryData<NavigationData>(key, (old) => {
    if (!old) return old;
    const spaces = old.spaces.filter((s) => s.id !== normalizedId && s.id !== spaceId);
    if (spaces.length === old.spaces.length) return old;
    return { ...old, spaces };
  });

  const updated = queryClient.getQueryData<NavigationData>(key);
  if (updated) writeCachedNav(updated);
}

export function useNavigation(options?: { enabled?: boolean }) {
  const { userId, isLoaded, isSignedIn } = useAuth();
  const sessionHint = hasClerkSessionCookieHint();
  const effectiveUserId =
    userId ?? (sessionHint ? readClerkUserIdForProfileCache() : undefined);
  const cachedForSession =
    effectiveUserId && sessionHint ? getCachedNav() : undefined;

  const query = useQuery({
    queryKey: userId ? getNavigationQueryKey(userId) : ['navigation', effectiveUserId ?? ''],
    enabled: (options?.enabled !== false) && isLoaded && isSignedIn && !!userId,
    queryFn: async () => {
      const res = await fetch('/api/navigation/data', { credentials: 'include' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new APIError(res.status, (body as { error?: string })?.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as NavigationData;
      writeCachedNav(data);
      return data;
    },
    staleTime: 30_000,
    placeholderData: cachedForSession,
    initialData: cachedForSession,
    initialDataUpdatedAt: cachedForSession ? Date.now() - 15_000 : undefined,
    retry: 2,
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
