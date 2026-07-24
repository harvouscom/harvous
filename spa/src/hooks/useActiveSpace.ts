import { useEffect, useMemo } from 'react';
import { useProtoShell } from '../layouts/proto-shell-context';
import { usePrototypeHomeSpaceId } from './usePrototypeHomeSpaceId';
import { useNavigation, type NavSpace, type NavigationData } from './queries/useNavigation';
import { getCachedSpaceBootstrap, useSpace } from './queries/useSpace';

function normalizeSpaceId(id: string): string {
  return id.startsWith('space_') ? id : `space_${id}`;
}

/**
 * When nav has not matched a persisted shared-space id yet, treat a selection that
 * differs from personal My Home as shared so the shell does not flash home content.
 */
export function resolveOptimisticSharedSpaceSelection(
  persistedId: string | null | undefined,
  homeSpaceId: string | null | undefined,
): { activeSpaceId: string; isSharedSpace: true } | null {
  if (!persistedId || !homeSpaceId) return null;
  const normalized = normalizeSpaceId(persistedId);
  const personalNorm = normalizeSpaceId(homeSpaceId);
  if (normalized === personalNorm) return null;
  return { activeSpaceId: normalized, isSharedSpace: true };
}

/** Best-effort shared space title for toolbar chrome before/without a full nav row. */
export function resolveSharedSpaceTitle(
  spaceId: string | null | undefined,
  options?: {
    nav?: NavigationData | null;
    spaceDetailTitle?: string | null;
    bootstrapTitle?: string | null;
  },
): string | null {
  if (!spaceId) return null;
  const normalized = normalizeSpaceId(spaceId);
  const nav = options?.nav;

  if (nav) {
    const owned = (nav.spaces ?? []).find((s) => normalizeSpaceId(s.id) === normalized && s.type !== 'personal');
    const memberOf = (nav.memberOfSpaces ?? []).find((s) => normalizeSpaceId(s.id) === normalized);
    const fromNav = (owned ?? memberOf)?.title?.trim();
    if (fromNav) return fromNav;
  }

  const fromDetail = options?.spaceDetailTitle?.trim();
  if (fromDetail) return fromDetail;

  const fromBootstrap = options?.bootstrapTitle?.trim();
  if (fromBootstrap) return fromBootstrap;

  return null;
}

/** Toolbar chrome only after nav confirms a shared space — avoids stale optimistic flash. */
export function resolveSpaceSwitcherToolbarState(options: {
  space: NavSpace | null;
  spaceTitle: string | null;
  hasHome: boolean;
  /** My Church hub (no space selected) or channel under church mode. */
  myChurchMode?: boolean;
  myChurchName?: string | null;
}): {
  showSharedSpaceToolbar: boolean;
  label: string | null;
  triggerTitle: string;
} {
  if (options.myChurchMode && !options.space) {
    return {
      /** Same circular orb chrome as My Home — not the shared-space title pill. */
      showSharedSpaceToolbar: false,
      label: null,
      triggerTitle: options.myChurchName?.trim()
        ? `My Church — ${options.myChurchName.trim()}`
        : 'My Church',
    };
  }
  const showSharedSpaceToolbar = Boolean(options.space);
  const label = showSharedSpaceToolbar
    ? options.spaceTitle?.trim() || options.space?.title?.trim() || null
    : null;
  const triggerTitle =
    showSharedSpaceToolbar && label
      ? label
      : options.hasHome
        ? 'My Home'
        : 'No My Home yet — finish setup in the classic app';
  return { showSharedSpaceToolbar, label, triggerTitle };
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
  /** Display title for the active shared space; null on My Home or before any source resolves. */
  spaceTitle: string | null;
  authReady: boolean;
  navReady: boolean;
} {
  const { activeSpaceId: persistedId, setActiveSpaceId } = useProtoShell();
  const { homeSpaceId, authReady, navReady } = usePrototypeHomeSpaceId();
  const { data: nav, isFetching: navFetching } = useNavigation();

  const optimisticSelection = useMemo(
    () => resolveOptimisticSharedSpaceSelection(persistedId, homeSpaceId),
    [persistedId, homeSpaceId],
  );

  const resolved = useMemo(() => {
    if (!persistedId) return null;
    const normalized = normalizeSpaceId(persistedId);
    const owned = (nav?.spaces ?? []).find((s) => normalizeSpaceId(s.id) === normalized && s.type !== 'personal');
    const memberOf = (nav?.memberOfSpaces ?? []).find((s) => normalizeSpaceId(s.id) === normalized);
    const match = owned ?? memberOf;
    return match ? { normalized, match, isOwner: Boolean(owned) } : null;
  }, [persistedId, nav?.spaces, nav?.memberOfSpaces]);

  const sharedSpaceIdForTitle = resolved?.normalized ?? optimisticSelection?.activeSpaceId ?? null;
  const isSharedSpaceActive = Boolean(resolved || optimisticSelection);
  const { data: spaceDetail } = useSpace(isSharedSpaceActive && sharedSpaceIdForTitle ? sharedSpaceIdForTitle : '');

  const bootstrapTitle = useMemo(() => {
    if (!sharedSpaceIdForTitle) return null;
    return getCachedSpaceBootstrap(sharedSpaceIdForTitle)?.space?.title ?? null;
  }, [sharedSpaceIdForTitle]);

  const spaceTitle = useMemo(() => {
    if (!isSharedSpaceActive) return null;
    return resolveSharedSpaceTitle(sharedSpaceIdForTitle, {
      nav,
      spaceDetailTitle: spaceDetail?.title,
      bootstrapTitle,
    });
  }, [isSharedSpaceActive, sharedSpaceIdForTitle, nav, spaceDetail?.title, bootstrapTitle]);

  // Stale persisted id (left/removed/deleted) — fall back to My Home once nav has
  // settled with space rows and the id still does not resolve.
  useEffect(() => {
    if (navFetching || !navReady || !persistedId || resolved) return;
    const navHasSpaces = (nav?.spaces?.length ?? 0) > 0 || (nav?.memberOfSpaces?.length ?? 0) > 0;
    if (!navHasSpaces) return;
    setActiveSpaceId(null);
  }, [persistedId, navReady, resolved, setActiveSpaceId, navFetching, nav?.spaces?.length, nav?.memberOfSpaces?.length]);

  return useMemo(() => {
    if (!resolved) {
      if (optimisticSelection) {
        return {
          activeSpaceId: optimisticSelection.activeSpaceId,
          homeSpaceId,
          isSharedSpace: true,
          isOwner: spaceDetail?.isOwner ?? false,
          space: null,
          spaceTitle,
          authReady,
          navReady,
        };
      }
      return {
        activeSpaceId: homeSpaceId,
        homeSpaceId,
        isSharedSpace: false,
        isOwner: true,
        space: null,
        spaceTitle: null,
        authReady,
        navReady,
      };
    }
    return {
      activeSpaceId: resolved.normalized,
      homeSpaceId,
      isSharedSpace: true,
      isOwner: resolved.isOwner,
      space: resolved.match,
      spaceTitle,
      authReady,
      navReady,
    };
  }, [resolved, optimisticSelection, homeSpaceId, authReady, navReady, spaceTitle, spaceDetail?.isOwner]);
}
