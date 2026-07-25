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
  /** Clerk org id when this is an org-owned ministry broadcast space. */
  orgId?: string | null;
  /** Churches.name for org-owned ministry spaces (null when not registered / inactive). */
  churchName?: string | null;
  /** Churches.city / state for hub header location line. */
  churchCity?: string | null;
  churchState?: string | null;
  /** Present on memberOfSpaces entries only. */
  role?: 'owner' | 'leader' | 'member';
  /** Notes updated since this member last opened the space dashboard. */
  newNoteCount?: number;
  /** Ministry channels: staff-declared publish cadence. */
  publishCadence?: import('@/utils/channel-publish-cadence').PublishCadence | null;
  /** True when observed curriculum lag exceeds 2× the declared interval. */
  cadenceStale?: boolean;
  /** Ministry channels: ISO timestamp of latest curriculum note (if any). */
  lastCurriculumAt?: string | null;
}

export interface NavigationData {
  threads: NavThread[];
  spaces: NavSpace[];
  memberOfSpaces: NavSpace[];
  inboxCount: number;
}

export type NavigationSharedSpaceAccess = {
  space: NavSpace;
  role: 'owner' | 'leader' | 'member';
  isOwner: boolean;
};

function normalizeNavigationSpaceId(spaceId: string): string {
  const trimmed = spaceId.trim();
  return trimmed.startsWith('space_') ? trimmed : trimmed ? `space_${trimmed}` : '';
}

/** Resolve collaborative-space role for one explicit context. Unknown and personal spaces fail closed. */
export function resolveNavigationSharedSpaceAccess(
  navigation: NavigationData | null | undefined,
  spaceId: string | null | undefined,
): NavigationSharedSpaceAccess | null {
  const targetId = normalizeNavigationSpaceId(spaceId ?? '');
  if (!navigation || !targetId) return null;

  const owned = navigation.spaces.find(
    (space) =>
      normalizeNavigationSpaceId(space.id) === targetId &&
      (space.type === 'shared' || space.type === 'public'),
  );
  if (owned) return { space: owned, role: 'owner', isOwner: true };

  const membership = navigation.memberOfSpaces.find(
    (space) => normalizeNavigationSpaceId(space.id) === targetId,
  );
  if (!membership?.role) return null;
  return {
    space: membership,
    role: membership.role,
    isOwner: membership.role === 'owner',
  };
}

/** Prefix for invalidating all per-user navigation queries. */
export const navigationQueryKeyPrefix = ['navigation'] as const;

export function getNavigationQueryKey(userId: string) {
  return ['navigation', userId] as const;
}

/** SessionStorage key for nav snapshot (must clear on thread delete / sign-out). */
export const NAV_SESSION_CACHE_KEY = HARVOUS_NAV_CACHE_KEY;

/** Shared React Query defaults — session cache must never suppress a network refetch. */
export const NAVIGATION_QUERY_DEFAULTS = {
  staleTime: 30_000,
  refetchOnMount: 'always' as const,
} as const;

/** Browser fetch cache mode for `/api/navigation/data` (auth-scoped; must not reuse HTTP cache). */
export const NAVIGATION_FETCH_CACHE: RequestCache = 'no-store';

/**
 * Hydration options for navigation: paint from sessionStorage via placeholder only.
 * Do not pass `initialData` / synthetic `initialDataUpdatedAt` — that made stale
 * snapshots look fresh for ~15s and hid shared spaces until a manual refresh.
 */
export function getNavigationQueryHydrationOptions(cached: NavigationData | undefined) {
  return {
    ...NAVIGATION_QUERY_DEFAULTS,
    placeholderData: cached,
  };
}

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
    type?: 'personal' | 'shared' | 'public';
    orgId?: string | null;
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
      type: space.type ?? 'shared',
      orgId: space.orgId ?? null,
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
    const threads = old.threads.filter(
      (thread) => !thread.spaceId || normalizeNavigationSpaceId(thread.spaceId) !== normalizedId,
    );
    if (spaces.length === old.spaces.length && threads.length === old.threads.length) return old;
    return { ...old, spaces, threads };
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
      const res = await fetch('/api/navigation/data', {
        credentials: 'include',
        cache: NAVIGATION_FETCH_CACHE,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new APIError(res.status, (body as { error?: string })?.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as NavigationData;
      writeCachedNav(data);
      return data;
    },
    ...getNavigationQueryHydrationOptions(cachedForSession),
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

/** Navigation-backed access for a route/context space ID; never falls back to the active shell space. */
export function useNavigationSharedSpaceAccess(spaceId: string | null | undefined) {
  const query = useNavigation({ enabled: Boolean(spaceId?.trim()) });
  const access = resolveNavigationSharedSpaceAccess(query.data, spaceId);
  return {
    ...query,
    access,
    isAccessKnown: access !== null,
  };
}

export function useRefreshNavigation() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: navigationQueryKeyPrefix });
}
