import { useAuth } from '@clerk/clerk-react';
import { useMemo } from 'react';
import { useNavigation } from './queries/useNavigation';
import { resolvePersonalHomeSpaceId } from '../utils/personal-home-space';

/**
 * Canonical personal “My Home” space id for `/prototype/` (owned spaces only; same heuristic as classic).
 */
export function usePrototypeHomeSpaceId(): {
  homeSpaceId: string | null;
  /** True when Clerk signed in + user known; sidebar can paint from merged nav/session cache once available. */
  navReady: boolean;
} {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { data: nav, isPending, fetchStatus } = useNavigation();

  const homeSpaceId = useMemo(() => resolvePersonalHomeSpaceId(nav?.spaces ?? []), [nav?.spaces]);

  // Session/placeholder `nav` (merged in useNavigation) should unblock immediately; otherwise wait until the
  // first navigation fetch cycle finishes (handles pre-fetch window where !isLoading but still pending/no data).
  const navReady =
    Boolean(isLoaded && isSignedIn && userId) &&
    (nav != null || (!isPending && fetchStatus !== 'fetching'));

  return { homeSpaceId, navReady };
}
