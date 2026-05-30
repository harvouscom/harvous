import { getSelectedSpaceId } from '@/components/react/navigation/selectedSpace';
import { useAuth } from '@clerk/clerk-react';
import { useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { PROTO_LAST_SPACE_KEY } from '../layouts/proto-session-keys';
import { getNavigationQueryKey, NAV_SESSION_CACHE_KEY, useNavigation } from './queries/useNavigation';
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

/**
 * Canonical personal “My Home” space id for `/prototype/` (owned spaces only; same heuristic as classic).
 */
export function usePrototypeHomeSpaceId(): {
  homeSpaceId: string | null;
  /** True when Clerk signed in + user known; sidebar can paint from merged nav/session cache once available. */
  navReady: boolean;
} {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const queryClient = useQueryClient();
  const { data: nav, isPending, fetchStatus } = useNavigation();

  const navReady =
    Boolean(isLoaded && isSignedIn && userId) &&
    (nav != null || (!isPending && fetchStatus !== 'fetching'));

  const homeSpaceId = useMemo(() => {
    const fromNav = resolvePersonalHomeSpaceId(nav?.spaces ?? []);
    if (fromNav) return fromNav;
    if (!navReady) return null;
    return readProtoLastSpaceId() ?? getSelectedSpaceId();
  }, [nav?.spaces, navReady]);

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

  return { homeSpaceId, navReady };
}
