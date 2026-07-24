import { getSelectedSpaceId } from '@/components/react/navigation/selectedSpace';
import { useAuth } from '@clerk/clerk-react';
import { useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { PROTO_LAST_SPACE_KEY } from '../layouts/proto-session-keys';
import { readPersistedSidebarNav } from '../pages/prototype/proto-sidebar-nav-store';
import type { NavigationData, NavSpace } from './queries/useNavigation';
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

function normalizeSpaceId(id: string): string {
  return id.startsWith('space_') ? id : `space_${id}`;
}

/**
 * Stale session nav often has My Home but omits shared / memberOf rows. When the
 * shell still has a persisted shared selection that nav cannot resolve, clear the
 * session snapshot and refetch once (empty-spaces repair does not cover this).
 */
export function shouldRepairStaleNavForPersistedSharedSpace(options: {
  navReady: boolean;
  isFetching: boolean;
  homeSpaceId: string | null | undefined;
  persistedActiveSpaceId: string | null | undefined;
  nav: NavigationData | null | undefined;
}): boolean {
  const { navReady, isFetching, homeSpaceId, persistedActiveSpaceId, nav } = options;
  if (!navReady || isFetching || !persistedActiveSpaceId || !homeSpaceId) return false;

  const normalized = normalizeSpaceId(persistedActiveSpaceId);
  if (normalized === normalizeSpaceId(homeSpaceId)) return false;

  const owned = (nav?.spaces ?? []).find(
    (s) => normalizeSpaceId(s.id) === normalized && s.type !== 'personal',
  );
  const memberOf = (nav?.memberOfSpaces ?? []).find((s) => normalizeSpaceId(s.id) === normalized);
  if (owned || memberOf) return false;

  const navHasSpaces =
    (nav?.spaces?.length ?? 0) > 0 || (nav?.memberOfSpaces?.length ?? 0) > 0;
  return navHasSpaces;
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
  const { data: nav, isPending, isFetching, fetchStatus } = useNavigation();
  const sessionHint = hasClerkSessionCookieHint();
  const cachedUserId = readClerkUserIdForProfileCache();
  /** One repair attempt per persisted shared id so a truly gone space cannot invalidate forever. */
  const repairedSharedSelectionRef = useRef<string | null>(null);
  const repairedEmptySpacesRef = useRef(false);

  const authReady = computePrototypeAuthReady(isLoaded, isSignedIn, userId, sessionHint, cachedUserId);

  const navReady =
    Boolean(isLoaded && isSignedIn && userId) &&
    (nav != null || (!isPending && fetchStatus !== 'fetching'));

  const homeSpaceId = useMemo(
    () => resolvePrototypeHomeSpaceId(nav?.spaces, authReady),
    [nav?.spaces, authReady],
  );

  // Stale session nav can list zero spaces before ensurePersonalHomeSpace runs; refetch once.
  // Also repair when My Home is present but a persisted shared selection is missing from nav
  // (incomplete snapshot — shared spaces omitted until a second refresh).
  useEffect(() => {
    if (!userId || !navReady) return;

    const emptySpaces = (nav?.spaces?.length ?? 0) === 0;
    const persistedActiveSpaceId = readPersistedSidebarNav().activeSpaceId;
    const missingPersistedShared = shouldRepairStaleNavForPersistedSharedSpace({
      navReady,
      isFetching,
      homeSpaceId,
      persistedActiveSpaceId,
      nav,
    });

    if (emptySpaces) {
      if (repairedEmptySpacesRef.current) return;
      repairedEmptySpacesRef.current = true;
    } else if (missingPersistedShared && persistedActiveSpaceId) {
      const key = normalizeSpaceId(persistedActiveSpaceId);
      if (repairedSharedSelectionRef.current === key) return;
      repairedSharedSelectionRef.current = key;
    } else {
      return;
    }

    try {
      sessionStorage.removeItem(NAV_SESSION_CACHE_KEY);
    } catch {
      /* ignore */
    }
    void queryClient.invalidateQueries({ queryKey: getNavigationQueryKey(userId) });
  }, [
    userId,
    navReady,
    isFetching,
    homeSpaceId,
    nav,
    nav?.spaces?.length,
    nav?.memberOfSpaces?.length,
    queryClient,
  ]);

  return { homeSpaceId, authReady, navReady };
}
