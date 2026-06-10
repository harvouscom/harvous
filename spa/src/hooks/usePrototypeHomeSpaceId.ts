import { getSelectedSpaceId } from '@/components/react/navigation/selectedSpace';
import { useAuth } from '@clerk/clerk-react';
import { useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { PROTO_LAST_SPACE_KEY } from '../layouts/proto-session-keys';
import type { NavSpace } from './queries/useNavigation';
import { getNavigationQueryKey, NAV_SESSION_CACHE_KEY, useNavigation } from './queries/useNavigation';
import { hasClerkSessionCookieHint, readClerkUserIdForProfileCache } from './queries/useProfile';
import { resolvePersonalHomeSpaceId } from '../utils/personal-home-space';

function readProtoLastSpaceId(): string | null {
  try {
    const raw = localStorage.getItem(PROTO_LAST_SPACE_KEY);
    if (!raw?.trim()) return null;
    return raw.startsWith('space_') ? raw : `space_${raw}`;
  } catch {
    return null;
  }
}

/** Session / Clerk gate for painting prototype chrome before navigation fetch settles. */
export function computePrototypeAuthReady(
  isLoaded: boolean,
  isSignedIn: boolean,
  userId: string | null | undefined,
  sessionHint: boolean,
  cachedUserId: string | undefined,
): boolean {
  return Boolean(isLoaded && isSignedIn && userId) || Boolean(sessionHint && cachedUserId);
}

/** Resolves home space id from nav, then optimistic client fallbacks when auth is ready. */
export function resolvePrototypeHomeSpaceId(
  navSpaces: NavSpace[] | undefined,
  authReady: boolean,
  lastSpaceId: string | null = readProtoLastSpaceId(),
  selectedSpaceId: string | null = getSelectedSpaceId(),
): string | null {
  const fromNav = resolvePersonalHomeSpaceId(navSpaces ?? []);
  if (fromNav) return fromNav;
  if (!authReady) return null;
  return lastSpaceId ?? selectedSpaceId;
}

/**
 * Canonical personal “My Home” space id for `/prototype/` (owned spaces only; same heuristic as classic).
 */
export function usePrototypeHomeSpaceId(): {
  homeSpaceId: string | null;
  /** True when a signed-in session is known (Clerk or session cookie + cached user id). */
  authReady: boolean;
  /** True when Clerk signed in + user known and navigation fetch has settled (internal / setup edge cases). */
  navReady: boolean;
} {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const queryClient = useQueryClient();
  const { data: nav, isPending, fetchStatus } = useNavigation();
  const sessionHint = hasClerkSessionCookieHint();
  const cachedUserId = readClerkUserIdForProfileCache();

  const authReady = computePrototypeAuthReady(isLoaded, isSignedIn, userId, sessionHint, cachedUserId);

  const navReady =
    Boolean(isLoaded && isSignedIn && userId) &&
    (nav != null || (!isPending && fetchStatus !== 'fetching'));

  const homeSpaceId = useMemo(
    () => resolvePrototypeHomeSpaceId(nav?.spaces, authReady),
    [nav?.spaces, authReady],
  );

  // Stale session nav can list zero spaces before ensurePersonalHomeSpace runs; refetch once.
  useEffect(() => {
    if (!userId || !navReady || (nav?.spaces?.length ?? 0) > 0) return;
    try {
      sessionStorage.removeItem(NAV_SESSION_CACHE_KEY);
    } catch {
      /* ignore */
    }
    void queryClient.invalidateQueries({ queryKey: getNavigationQueryKey(userId) });
  }, [userId, navReady, nav?.spaces?.length, queryClient]);

  return { homeSpaceId, authReady, navReady };
}
