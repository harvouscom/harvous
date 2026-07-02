import { useEffect, useMemo } from 'react';
import { useProtoShell } from '../layouts/proto-shell-context';
import { usePrototypeHomeSpaceId } from './usePrototypeHomeSpaceId';
import { useNavigation, type NavSpace } from './queries/useNavigation';

function normalizeSpaceId(id: string): string {
  return id.startsWith('space_') ? id : `space_${id}`;
}

/**
 * The space the prototype shell is currently showing: the selected shared/public
 * space if one is active and still valid, otherwise the personal My Home space.
 *
 * A persisted `activeSpaceId` that no longer resolves against nav data (left,
 * removed, or deleted) silently falls back to My Home rather than erroring.
 */
export function useActiveSpace(): {
  /** Resolved space id in scope — never null once nav is ready. */
  activeSpaceId: string | null;
  /** Personal My Home space id (unaffected by the switcher). */
  homeSpaceId: string | null;
  /** True when activeSpaceId is a shared/public space, not My Home. */
  isSharedSpace: boolean;
  /** True when the viewer owns the active shared space. */
  isOwner: boolean;
  /** Nav row for the active space when it's shared/public; null for My Home. */
  space: NavSpace | null;
  authReady: boolean;
  navReady: boolean;
} {
  const { activeSpaceId: persistedId, setActiveSpaceId } = useProtoShell();
  const { homeSpaceId, authReady, navReady } = usePrototypeHomeSpaceId();
  const { data: nav } = useNavigation();

  const resolved = useMemo(() => {
    if (!persistedId) return null;
    const normalized = normalizeSpaceId(persistedId);
    const owned = (nav?.spaces ?? []).find((s) => normalizeSpaceId(s.id) === normalized && s.type !== 'personal');
    const memberOf = (nav?.memberOfSpaces ?? []).find((s) => normalizeSpaceId(s.id) === normalized);
    const match = owned ?? memberOf;
    return match ? { normalized, match, isOwner: Boolean(owned) } : null;
  }, [persistedId, nav?.spaces, nav?.memberOfSpaces]);

  // Stale persisted id (left/removed/deleted) — fall back to My Home once nav has
  // actually settled, so we don't wipe a valid selection during the loading window.
  useEffect(() => {
    if (persistedId && navReady && !resolved) setActiveSpaceId(null);
  }, [persistedId, navReady, resolved, setActiveSpaceId]);

  return useMemo(() => {
    if (!resolved) {
      return { activeSpaceId: homeSpaceId, homeSpaceId, isSharedSpace: false, isOwner: true, space: null, authReady, navReady };
    }
    return {
      activeSpaceId: resolved.normalized,
      homeSpaceId,
      isSharedSpace: true,
      isOwner: resolved.isOwner,
      space: resolved.match,
      authReady,
      navReady,
    };
  }, [resolved, homeSpaceId, authReady, navReady]);
}
