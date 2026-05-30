import React, { useState, useEffect, useMemo, useRef, useId } from 'react';
import SpaceButton from './SpaceButton';
import PersistentNavigation from './PersistentNavigation';
import SquareButton from '../SquareButton';
import { getThreadTextColorCSS, type ThreadColor } from '@/utils/colors';
import ButtonSmall from '../ButtonSmall';
import Icon from '../Icon';
import { setSelectedSpaceId, useSelectedSpaceId } from './selectedSpace';
import { shouldForceRefresh, refreshBadgeCountsWithVerification } from '@/utils/badge-count-refresh';
import { useNavigation } from './NavigationContext';
import { idToUrl, extractIdFromPath } from '@/utils/url-helpers';
import { getBackTarget, popNavStack } from '@/utils/nav-stack';
import { isClassicAppSurface } from '@/lib/prototype-path';
import { safeNavigate } from '@/utils/safe-navigate';
import { MY_PILE_THREAD_TITLE } from '@/utils/my-pile-thread';

/**
 * Check if Clerk authentication is ready
 * Returns true if auth cookies/tokens are present
 */
function isAuthReady(): boolean {
  if (typeof window === 'undefined') return false;
  
  // Check for Clerk session cookie or token
  const cookies = document.cookie.split(';');
  const hasClerkCookie = cookies.some(cookie => 
    cookie.trim().startsWith('__clerk') || 
    cookie.trim().startsWith('__session')
  );
  
  // Also check if we're on a protected route (not sign-in/sign-up)
  const isProtectedRoute = !window.location.pathname.includes('/sign-in') && 
                          !window.location.pathname.includes('/sign-up');
  
  return hasClerkCookie || isProtectedRoute;
}

interface Space {
  id: string;
  title: string;
  totalItemCount: number;
  backgroundGradient: string;
  isShared?: boolean;
}

interface ActiveThread {
  id: string;
  title: string;
  noteCount: number;
  backgroundGradient: string;
  spaceId?: string | null;
  userId?: string | null;
}

interface CurrentSpace {
  id: string;
}

interface NavigationColumnProps {
  inboxCount?: number;
  spaces?: Space[];
  activeThread?: ActiveThread | null;
  currentSpace?: CurrentSpace | null;
  isNote?: boolean;
  currentId?: string;
  showProfile?: boolean;
  initials?: string;
  /** Clerk profile photo (mobile nav only; desktop uses name pill). */
  avatarImageUrl?: string | null;
  userDisplayName?: string;
  userColor?: string;
  pathname?: string;
  search?: string;
  viewerUserId?: string | null;
}

const NavigationColumn: React.FC<NavigationColumnProps> = ({
  inboxCount = 0,
  spaces = [],
  activeThread = null,
  currentSpace = null,
  isNote = false,
  currentId = null,
  showProfile = false,
  initials = "DJ",
  userDisplayName = 'User',
  userColor = "blue",
  pathname = '/',
  search = '',
  viewerUserId = null,
}) => {
  const [localSpaces, setLocalSpaces] = useState<Space[]>(spaces);
  const [dismissedMismatchKey, setDismissedMismatchKey] = useState<string | null>(null);
  const [isShowingExistingSpaces, setIsShowingExistingSpaces] = useState(false);
  const { navigationHistory, refreshNavigation, removeFromNavigationHistory, addToNavigationHistory, updateNavigationItemCount } = useNavigation();
  // Track hydration state to prevent SSR/client mismatch in dropdown
  const [isHydrated, setIsHydrated] = useState(false);
  // Top gradient: show only when scrolled down (same as Tiptap editor)
  const [navScrollHasScrolledDown, setNavScrollHasScrolledDown] = useState(false);
  const navColumnScrollRef = useRef<HTMLDivElement>(null);
  // IDs of spaces deleted this session so dropdown and "Add Existing Space" don't show them until refresh
  const deletedSpaceIdsRef = useRef<Set<string>>(new Set());
  const spaceSwitcherMenuId = useId();
  const spaceSwitcherExistingRegionId = useId();

  // IMPORTANT: derive initial selection from props (SSR + client must match to avoid hydration mismatch).
  // Prefer explicit ?space=..., then /space_... route.
  const routeSelectedSpaceId = useMemo(() => {
    // TanStack Router may pass search as a parsed object (e.g. { space: 'space_xxx' })
    // or as a string. Handle both, with direct window.location.search as final fallback.
    try {
      if (search && typeof search === 'object') {
        const space = (search as Record<string, unknown>).space;
        if (typeof space === 'string' && space.startsWith('space_')) return space.replace(/\/$/, '');
      }
      const params = new URLSearchParams(typeof search === 'string' ? search : '');
      const fromQuery = params.get('space');
      if (fromQuery && fromQuery.startsWith('space_')) return fromQuery.replace(/\/$/, '');
    } catch {
      // ignore
    }
    // Direct URL fallback for SPA navigation where props might lag
    if (typeof window !== 'undefined') {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const fromUrl = urlParams.get('space');
        if (fromUrl && fromUrl.startsWith('space_')) return fromUrl.replace(/\/$/, '');
      } catch { /* ignore */ }
    }
    if (pathname.startsWith('/space/')) {
      const id = extractIdFromPath(pathname);
      return id ? id.replace(/\/$/, '') : null;
    }
    return null;
  }, [pathname, search]);

  // Selected space from storage (hydrated after mount). Seed with route value for SSR consistency.
  const selectedSpaceId = useSelectedSpaceId(routeSelectedSpaceId);
  // Prefer URL (?space= or /space/xxx) over storage so "current space" is where the user is now.
  const effectiveSelectedSpaceId = routeSelectedSpaceId ?? selectedSpaceId;
  const [profileData, setProfileData] = useState({
    initials: initials,
    userColor: userColor,
  });
  const [optimisticDisplayName, setOptimisticDisplayName] = useState<string | null>(null);
  const effectiveUserDisplayName = optimisticDisplayName ?? userDisplayName;
  // Sync avatar when parent passes updated profile (e.g. useProfile() resolve after sign-in)
  useEffect(() => {
    setProfileData({ initials, userColor });
  }, [initials, userColor]);
  useEffect(() => {
    setOptimisticDisplayName(null);
  }, [userDisplayName]);
  // Initialize currentItemId from pathname prop (works on both server and client)
  const [currentItemId, setCurrentItemId] = useState(() => {
    return extractIdFromPath(pathname) || '';
  });
  const [updatedActiveThread, setUpdatedActiveThread] = useState<ActiveThread | null>(activeThread);
  const [isMovingThreadToSpace, setIsMovingThreadToSpace] = useState(false);
  // Space from current URL (?space=) — updated on page load so add-to-space prompt sees it after client nav.
  const [urlSpaceId, setUrlSpaceId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const s = new URLSearchParams(window.location.search).get('space');
      return s && s.startsWith('space_') ? s : null;
    } catch {
      return null;
    }
  });

  // Determine if we're on the dashboard page
  // Use pathname prop which is available on both server and client (from Astro.url.pathname)
  // This ensures SSR and client render the same value, preventing hydration mismatches
  const isDashboard = useMemo(() => {
    return pathname === '/' || pathname === '/dashboard';
  }, [pathname]);

  // The switcher is driven by the user's selected space, not by the current route.
  const selectedSpace = useMemo(() => {
    if (!effectiveSelectedSpaceId) return null;
    const fromList = localSpaces.find((s) => s.id === effectiveSelectedSpaceId) ?? null;
    if (fromList) return fromList;

    // Fallback (mainly for View Transition edge cases):
    // if we're literally on the selected space page, use SSR-provided dataset for label/gradient.
    if (typeof window !== 'undefined' && currentItemId === effectiveSelectedSpaceId) {
      const navigationElement = document.querySelector('[slot="navigation"]') as HTMLElement | null;
      if (navigationElement?.dataset?.spaceTitle) {
        return {
          id: effectiveSelectedSpaceId,
          title: navigationElement.dataset.spaceTitle,
          totalItemCount: parseInt(navigationElement.dataset.spaceItemCount || '0'),
          backgroundGradient: navigationElement.dataset.spaceBackgroundGradient || 'var(--color-paper)',
        } satisfies Space;
      }
    }

    return null;
  }, [effectiveSelectedSpaceId, localSpaces, currentItemId]);

  // Route-aware display: on dashboard show "My Home"; on other pages show stored selected space (so profile/search keep last space).
  const displaySelectedSpaceId = isDashboard ? null : (effectiveSelectedSpaceId && !deletedSpaceIdsRef.current.has(effectiveSelectedSpaceId) ? effectiveSelectedSpaceId : null);
  const displaySelectedSpace = useMemo(() => {
    if (!displaySelectedSpaceId) return null;
    const fromList = localSpaces.find((s) => s.id === displaySelectedSpaceId) ?? null;
    if (fromList) return fromList;
    if (typeof window !== 'undefined' && currentItemId === displaySelectedSpaceId) {
      const navigationElement = document.querySelector('[slot="navigation"]') as HTMLElement | null;
      if (navigationElement?.dataset?.spaceTitle) {
        return {
          id: displaySelectedSpaceId,
          title: navigationElement.dataset.spaceTitle,
          totalItemCount: parseInt(navigationElement.dataset.spaceItemCount || '0'),
          backgroundGradient: navigationElement.dataset.spaceBackgroundGradient || 'var(--color-paper)',
        } satisfies Space;
      }
    }
    return null;
  }, [displaySelectedSpaceId, localSpaces, currentItemId]);

  const topSpaceHref = displaySelectedSpaceId ? idToUrl(displaySelectedSpaceId) : '/';
  const topSpaceIsActive = displaySelectedSpaceId ? currentItemId === displaySelectedSpaceId : isDashboard;

  const currentThreadForMismatch = updatedActiveThread || activeThread;
  const isThreadPage = currentItemId.startsWith('thread_');
  const threadSpaceId = currentThreadForMismatch?.spaceId ?? null;
  // Prefer URL ?space= (from urlSpaceId, updated on page load) for add-to-space prompt so it shows after client nav.
  const selectedSpaceForMismatch = urlSpaceId ?? effectiveSelectedSpaceId;
  const mismatchKey = currentThreadForMismatch?.id && selectedSpaceForMismatch
    ? `${currentThreadForMismatch.id}|${selectedSpaceForMismatch}`
    : null;
  const threadOwnerId = currentThreadForMismatch?.userId ?? null;
  const suppressMismatchForNonOwner =
    !!viewerUserId && !!threadOwnerId && threadOwnerId !== viewerUserId;
  const baseSpaceMismatchPrompt =
    !!selectedSpaceForMismatch &&
    isThreadPage &&
    !!currentThreadForMismatch?.id &&
    currentThreadForMismatch.id !== 'thread_unorganized' &&
    threadSpaceId !== selectedSpaceForMismatch &&
    !suppressMismatchForNonOwner;
  const showSpaceMismatchPrompt = baseSpaceMismatchPrompt && mismatchKey !== dismissedMismatchKey;

  // Debounce the mismatch prompt by ~600ms so it never flashes for loading-state mismatches
  // (e.g. nav cache has spaceId=null before the nav refresh completes after adding a thread to a space).
  const [debouncedShowMismatch, setDebouncedShowMismatch] = useState(false);
  useEffect(() => {
    if (!showSpaceMismatchPrompt) {
      setDebouncedShowMismatch(false);
      return;
    }
    const timer = setTimeout(() => setDebouncedShowMismatch(true), 600);
    return () => clearTimeout(timer);
  }, [showSpaceMismatchPrompt]);

  const selectedSpaceTitleForMismatch = selectedSpaceForMismatch
    ? (localSpaces.find((s) => s.id === selectedSpaceForMismatch)?.title ?? selectedSpace?.title ?? 'this space')
    : 'this space';
  const threadSpaceTitleForMismatch = threadSpaceId
    ? localSpaces.find((s) => s.id === threadSpaceId)?.title ?? 'its current space'
    : 'My Home';

  useEffect(() => {
    // If mismatch resolved (or we're not in mismatch context), clear any dismissal.
    if (!baseSpaceMismatchPrompt) setDismissedMismatchKey(null);
  }, [baseSpaceMismatchPrompt]);

  const moveThreadToSelectedSpace = async () => {
    if (!selectedSpaceForMismatch) return;
    if (!currentThreadForMismatch?.id) return;
    if (currentThreadForMismatch.id === 'thread_unorganized') return;
    if (isMovingThreadToSpace) return;

    setIsMovingThreadToSpace(true);
    try {
      const response = await fetch(`/api/spaces/${selectedSpaceForMismatch}/add-thread`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: currentThreadForMismatch.id }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const message = data?.error || 'Failed to add thread to space. Please try again.';
        if (typeof window !== 'undefined' && (window as any).toast?.error) {
          (window as any).toast.error(message);
        }
        return;
      }

      // Optimistically update the active thread spaceId so the prompt disappears immediately.
      setUpdatedActiveThread((prev) => (prev ? { ...prev, spaceId: selectedSpaceForMismatch } : prev));
      window.dispatchEvent(new CustomEvent('threadUpdated', { detail: { threadId: currentThreadForMismatch.id } }));

      if (typeof window !== 'undefined' && (window as any).toast?.success) {
        (window as any).toast.success(`Added to ${selectedSpaceTitleForMismatch}`);
      }
    } catch (error) {
      if (typeof window !== 'undefined' && (window as any).toast?.error) {
        (window as any).toast.error('Failed to add thread to space. Please try again.');
      }
    } finally {
      setIsMovingThreadToSpace(false);
    }
  };

  const switchSelectedSpaceToThreadSpace = () => {
    if (!currentThreadForMismatch) return;
    setSelectedSpaceId(threadSpaceId);
  };

  const dismissSpaceMismatchPrompt = () => {
    if (!mismatchKey) return;
    setDismissedMismatchKey(mismatchKey);
  };

  // Get raw navigation history from storage (including spaces)
  // NavigationContext filters out spaces, so we need to read directly from storage
  const getRawNavigationHistory = (): any[] => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = window.localStorage.getItem('harvous-navigation-history-v2');
      const parsed = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error('Error getting raw navigation history:', error);
      return [];
    }
  };

  // Space IDs the user has closed from the switcher (so they stay out of the dropdown).
  // MUST use window.localStorage directly — safeGetItem can bounce to sessionStorage
  // and return an empty/partial list, which causes split-brain with the context's
  // window.localStorage writes and can erase closed threads.
  const getClosedSpaceIds = (): Set<string> => {
    if (typeof window === 'undefined') return new Set();
    try {
      const stored = window.localStorage.getItem('harvous-closed-navigation-items');
      const parsed = stored ? (JSON.parse(stored) as unknown) : [];
      const ids = Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
      return new Set(ids.filter((id) => id.startsWith('space_')));
    } catch {
      return new Set();
    }
  };

  // Force re-render when navigation history updates (critical for View Transitions)
  const [, forceUpdate] = useState(0);
  
  // Mark as hydrated after mount to prevent SSR/client mismatch
  useEffect(() => {
    setIsHydrated(true);
  }, []);
  
  // Filter spaces to only show those in navigation history (spaces that have been opened/visited)
  // Use raw navigation history from storage since NavigationContext filters out spaces
  // IMPORTANT: Only filter by navigation history after hydration to prevent SSR/client mismatch
  // Include spaces from raw history that aren't in localSpaces (e.g. after remount when navigating to My Home)
  const filteredSpaces = useMemo(() => {
    // During SSR and initial render, return empty array to match server
    if (!isHydrated) {
      return [];
    }
    
    const rawHistory = getRawNavigationHistory();
    const rawSpaceItems = rawHistory.filter(
      (item: any) => item.id && item.id.startsWith('space_')
    );
    const navigationSpaceIds = new Set(rawSpaceItems.map((item: any) => item.id));
    
    const fromLocal = localSpaces.filter(space => navigationSpaceIds.has(space.id));
    const localIds = new Set(fromLocal.map(s => s.id));
    const fromRaw = rawSpaceItems
      .filter((item: any) => !localIds.has(item.id))
      .map((item: any) => ({
        id: item.id,
        title: item.title || 'Space',
        totalItemCount: typeof item.count === 'number' ? item.count : 0,
        backgroundGradient: item.backgroundGradient || 'var(--color-paper)',
        isShared: item.isShared ?? false,
      } satisfies Space));
    
    const combined = [...fromLocal, ...fromRaw];
    const deleted = deletedSpaceIdsRef.current;
    return deleted.size === 0 ? combined : combined.filter(s => !deleted.has(s.id));
  }, [localSpaces, forceUpdate, isHydrated]);

  // Calculate spaces to show in dropdown - include current space even if not in history yet
  // IMPORTANT: During SSR and initial render, only include currentSpace to prevent hydration mismatch
  const spacesForDropdown = useMemo(() => {
    const spacesById = new Map<string, Space>();
    
    // After hydration, include filtered spaces (from navigation history)
    if (isHydrated) {
      // Add all filtered spaces
      for (const space of filteredSpaces) {
        spacesById.set(space.id, space);
      }
    }
    
    // Always ensure current space is included if we're viewing it (from selectedSpace fallback)
    // This handles timing issues where trackNavigationAccess() hasn't run yet
    if (selectedSpace && selectedSpace.id && selectedSpace.id.startsWith('space_')) {
      if (!spacesById.has(selectedSpace.id)) {
        spacesById.set(selectedSpace.id, selectedSpace);
      }
    }
    
    // Also ensure current space from props is included (if we're on a space page)
    // This ensures SSR and client render the same initial state
    if (currentSpace && currentSpace.id && currentSpace.id.startsWith('space_')) {
      if (!spacesById.has(currentSpace.id)) {
        // Build a full Space object from the CurrentSpace (use localSpaces so newly created space is found)
        const currentSpaceData = localSpaces.find(s => s.id === currentSpace.id);
        if (currentSpaceData) {
          spacesById.set(currentSpace.id, currentSpaceData);
        }
      }
    }

    // Ensure the currently selected/display space is in the dropdown (so top label can resolve its title on find/profile etc.)
    const spaceIdToInclude = isDashboard ? null : effectiveSelectedSpaceId;
    if (spaceIdToInclude && !spacesById.has(spaceIdToInclude)) {
      const fromLocal = localSpaces.find((s) => s.id === spaceIdToInclude);
      if (fromLocal) spacesById.set(spaceIdToInclude, fromLocal);
    }

    // Exclude spaces the user has closed from the switcher (so they stay removed after re-renders/sync)
    const closedSpaceIds = getClosedSpaceIds();
    return Array.from(spacesById.values()).filter((s) => !closedSpaceIds.has(s.id));
  }, [filteredSpaces, selectedSpace, currentSpace, spaces, localSpaces, isHydrated, isDashboard, effectiveSelectedSpaceId]);

  // Fallback to spacesForDropdown so we show the actual space name (e.g. "MySpace") when the space is in the dropdown but not in localSpaces (e.g. find page).
  const displaySpaceForLabel = displaySelectedSpace ?? (displaySelectedSpaceId ? spacesForDropdown.find((s) => s.id === displaySelectedSpaceId) ?? null : null);
  const resolvedTopSpaceLabel = displaySpaceForLabel ? displaySpaceForLabel.title : 'My Home';
  const resolvedTopSpaceBackground = displaySpaceForLabel?.backgroundGradient || 'var(--color-paper)';

  // Calculate available spaces that aren't in the dropdown (exclude deleted so they disappear without refresh)
  const availableSpaces = useMemo(() => {
    const dropdownSpaceIds = new Set(spacesForDropdown.map(s => s.id));
    const deleted = deletedSpaceIdsRef.current;
    return spaces
      .filter(space => !dropdownSpaceIds.has(space.id) && !deleted.has(space.id))
      .sort((a, b) => {
        const titleA = (a.title || "").toLowerCase();
        const titleB = (b.title || "").toLowerCase();
        return titleA.localeCompare(titleB);
      });
  }, [spaces, spacesForDropdown]);

  // Keep local spaces in sync with server-rendered props (but preserve locally-added ones; never re-add deleted)
  useEffect(() => {
    const deleted = deletedSpaceIdsRef.current;
    setLocalSpaces(prev => {
      const byId = new Map<string, Space>();
      for (const s of spaces) {
        if (!deleted.has(s.id)) byId.set(s.id, s);
      }
      for (const s of prev) {
        if (!deleted.has(s.id)) byId.set(s.id, s);
      }
      return Array.from(byId.values());
    });
  }, [spaces]);

  // Remove deleted space from dropdown and "Add Existing Space" when user erases a space
  useEffect(() => {
    const handleSpaceDeleted = (event: CustomEvent) => {
      const spaceId = event.detail?.spaceId;
      if (!spaceId) return;
      deletedSpaceIdsRef.current.add(spaceId);
      setLocalSpaces(prev => prev.filter(s => s.id !== spaceId));
      // Prune the deleted space from the "closed" list so stale IDs don't accumulate.
      // MUST use window.localStorage directly to stay consistent with NavigationContext.
      try {
        const stored = window.localStorage.getItem('harvous-closed-navigation-items');
        if (stored) {
          const pruned = (JSON.parse(stored) as string[]).filter((id) => id !== spaceId);
          window.localStorage.setItem('harvous-closed-navigation-items', JSON.stringify(pruned));
        }
      } catch { /* ignore */ }
    };
    window.addEventListener('spaceDeleted', handleSpaceDeleted as EventListener);
    return () => window.removeEventListener('spaceDeleted', handleSpaceDeleted as EventListener);
  }, []);

  // Update dropdown immediately when a new space is created
  useEffect(() => {
    const handleSpaceCreated = (event: CustomEvent) => {
      const space = event.detail?.space as Partial<Space> | undefined;
      if (!space?.id || !space.title) return;
      setLocalSpaces(prev => {
        const byId = new Map<string, Space>();
        for (const s of prev) byId.set(s.id, s);
        const next: Space = {
          id: space.id!,
          title: space.title!,
          totalItemCount: typeof space.totalItemCount === 'number' ? space.totalItemCount : 0,
          backgroundGradient: space.backgroundGradient || 'var(--color-paper)',
          isShared: space.isShared ?? false,
        };
        byId.set(next.id, next);
        return Array.from(byId.values());
      });
    };
    window.addEventListener('spaceCreated', handleSpaceCreated as EventListener);
    return () => window.removeEventListener('spaceCreated', handleSpaceCreated as EventListener);
  }, []);

  // Update dropdown immediately when a space is updated
  useEffect(() => {
    const handleSpaceUpdated = (event: CustomEvent) => {
      const { spaceId, title, backgroundGradient } = event.detail || {};
      if (!spaceId || !title) return;
      
      setLocalSpaces(prev => {
        const byId = new Map<string, Space>();
        for (const s of prev) byId.set(s.id, s);
        
        // Update existing space if found
        const existingSpace = byId.get(spaceId);
        if (existingSpace) {
          byId.set(spaceId, {
            ...existingSpace,
            title: title,
            backgroundGradient: backgroundGradient || existingSpace.backgroundGradient || 'var(--color-paper)',
          });
        }
        
        return Array.from(byId.values());
      });
    };
    
    window.addEventListener('spaceUpdated', handleSpaceUpdated as EventListener);
    return () => window.removeEventListener('spaceUpdated', handleSpaceUpdated as EventListener);
  }, []);

  useEffect(() => {
    const handleProfileUpdate = (event: CustomEvent) => {
      const { firstName, lastName, selectedColor } = event.detail;
      if (firstName && lastName && selectedColor) {
        const newInitials = `${firstName.charAt(0) || ''}${lastName.charAt(0) || ''}`.toUpperCase();
        setProfileData({
          initials: newInitials,
          userColor: selectedColor
        });
        setOptimisticDisplayName(`${firstName} ${lastName}`.trim());
      }
    };
  
    window.addEventListener('updateProfile', handleProfileUpdate as EventListener);
  
    return () => {
      window.removeEventListener('updateProfile', handleProfileUpdate as EventListener);
    };
  }, []);

  // Track when counts were last updated via events to prevent server data from overwriting
  const lastEventUpdateTimeRef = useRef<number>(0);
  const eventUpdatedCountRef = useRef<number | null>(null);
  const spaceSwitcherDetailsRef = useRef<HTMLDetailsElement>(null);

  // Close space dropdown on click outside or Escape (desktop).
  // Read ref inside handlers so listeners are always attached and we always use the current element.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const detailsEl = spaceSwitcherDetailsRef.current;
      if (!detailsEl || event.key !== 'Escape' || !detailsEl.open) return;
      event.preventDefault();
      detailsEl.removeAttribute('open');
    };

    const handlePointerDown = (event: Event) => {
      const target = event.target as Node | null;
      if (!target) return;
      const detailsEl = spaceSwitcherDetailsRef.current;
      if (!detailsEl?.open) return;
      if ((target as HTMLElement).closest?.('.space-switcher-anchor__toggle')) return;
      if (detailsEl.contains(target)) return;
      detailsEl.removeAttribute('open');
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('touchstart', handlePointerDown, { passive: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('touchstart', handlePointerDown);
    };
  }, []);

  // Space switcher open: handled in keyboard-shortcuts.ts (openDesktopSpaceSwitcher).
  // Plain Arrow Up/Down cycles all primary rows (scroll + footer "New Space"), including when focus is on <summary>.
  useEffect(() => {
    const getOrderedFocusables = (): HTMLElement[] => {
      const detailsEl = spaceSwitcherDetailsRef.current;
      if (!detailsEl?.open) return [];
      // Whole <details>: footer lives outside __scroll but inside the panel; query from details so order is DOM order.
      const nodes = detailsEl.querySelectorAll<HTMLElement>(
        'a.space-switcher-dropdown__item, button.space-switcher-dropdown__item',
      );
      return Array.from(nodes).filter((el) => {
        if (el.hasAttribute('disabled')) return false;
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden';
      });
    };

    const onKeyDownCapture = (event: KeyboardEvent) => {
      const detailsEl = spaceSwitcherDetailsRef.current;
      if (!detailsEl?.open) return;
      // Include <summary> focus: it is not inside .space-switcher-details__panel, so use details.contains.
      if (!detailsEl.contains(event.target as Node)) return;
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      // Let Cmd/Ctrl+Option+↑/↓ reach global shortcuts (cycle open items / tabs); plain arrows move within the list.
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;

      const items = getOrderedFocusables();
      if (items.length === 0) return;

      event.preventDefault();
      event.stopPropagation();

      const active = document.activeElement as HTMLElement | null;
      let idx = items.indexOf(active as HTMLElement);
      if (idx < 0) {
        idx = event.key === 'ArrowDown' ? -1 : items.length;
      }
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      const next = (idx + delta + items.length) % items.length;
      const el = items[next];
      el?.focus();
      el?.scrollIntoView({ block: 'nearest' });
    };

    window.addEventListener('keydown', onKeyDownCapture, true);
    return () => {
      window.removeEventListener('keydown', onKeyDownCapture, true);
    };
  }, []);

  // Sync updatedActiveThread when activeThread prop changes
  // But don't overwrite if we recently updated via events (within 2 seconds)
  useEffect(() => {
    const now = Date.now();
    const timeSinceEventUpdate = now - lastEventUpdateTimeRef.current;
    
    // If we recently updated via events (within 2 seconds), preserve the event-updated count
    if (timeSinceEventUpdate < 2000 && eventUpdatedCountRef.current !== null && activeThread) {
      // Only update if the server data is actually different and we haven't just updated via events
      setUpdatedActiveThread(prev => {
        if (prev && prev.noteCount === eventUpdatedCountRef.current) {
          // Keep the event-updated count, but update other properties from server
          return {
            ...activeThread,
            noteCount: eventUpdatedCountRef.current!
          };
        }
        return activeThread;
      });
    } else {
      // No recent event updates, safe to use server data
      setUpdatedActiveThread(activeThread);
      eventUpdatedCountRef.current = null;
    }
  }, [activeThread]);

  // Ensure the active thread is tracked in navigation history with correct data from React props.
  // In SPA mode, DOM data attributes don't exist, so trackNavigationAccess() (which relies on DOM)
  // cannot add/update the thread. This effect bridges the gap using React-sourced data.
  // Also sync on activeThread prop changes (not just updatedActiveThread) to handle the first
  // render after SPA navigation, when updatedActiveThread hasn't been set yet.
  const activeThreadForHistory = updatedActiveThread || activeThread;

  // Use a ref for effectiveSelectedSpaceId so that switching spaces does NOT re-fire
  // the addToNavigationHistory effect below. Without this, changing spaces causes the
  // still-mounted previous thread to be re-scoped to the new space (because the URL
  // hasn't changed yet when setSelectedSpaceId fires).
  const effectiveSelectedSpaceIdRef = useRef(effectiveSelectedSpaceId);
  effectiveSelectedSpaceIdRef.current = effectiveSelectedSpaceId;

  // Capture URL space for thread/note routes when the active thread id or `?space=` changes
  // (same thread can be opened in multiple spaces). Uses routeSelectedSpaceId so we stay in
  // sync with NavigationColumn’s URL resolution without re-firing on storage-only space changes.
  const spaceIdForHistoryRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeThreadForHistory?.id) return;
    const path = typeof window !== 'undefined' ? window.location.pathname : pathname;
    if (!path.startsWith('/thread/') && !path.startsWith('/note/')) {
      spaceIdForHistoryRef.current = null;
      return;
    }
    let captured: string | null = routeSelectedSpaceId;
    if (captured && !captured.startsWith('space_')) captured = null;
    spaceIdForHistoryRef.current = captured;
  }, [activeThreadForHistory?.id, routeSelectedSpaceId, pathname]);

  useEffect(() => {
    if (!activeThreadForHistory?.id || !activeThreadForHistory.id.startsWith('thread_')) return;
    // Only scope the thread when we're actually viewing a thread or note page.
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      if (!path.startsWith('/thread/') && !path.startsWith('/note/')) return;
      // Prevent resurrecting a thread the user just closed: noteCount updates can re-run this
      // effect before navigation completes, which would call removeFromClosedItems too early.
      try {
        const raw = window.sessionStorage?.getItem('harvous-recently-closed-items');
        if (raw) {
          const items: Array<{ itemId: string; closedAt: number }> = JSON.parse(raw);
          const fiveSecondsAgo = Date.now() - 5000;
          if (
            Array.isArray(items) &&
            items.some((e) => e.itemId === activeThreadForHistory.id && e.closedAt > fiveSecondsAgo)
          ) {
            return;
          }
        }
      } catch {
        /* ignore */
      }
    }
    const openedInSpaceId = spaceIdForHistoryRef.current;
    addToNavigationHistory({
      id: activeThreadForHistory.id,
      title: activeThreadForHistory.id === 'thread_unorganized' ? MY_PILE_THREAD_TITLE : (activeThreadForHistory.title || 'Thread'),
      count: activeThreadForHistory.noteCount ?? 0,
      backgroundGradient: activeThreadForHistory.backgroundGradient || 'var(--color-gradient-gray)',
      spaceId: activeThreadForHistory.spaceId ?? null,
      openedInSpaceIds: [openedInSpaceId],
      openedInSpaceId: openedInSpaceId,
    });
  }, [activeThreadForHistory?.id, activeThreadForHistory?.title, activeThreadForHistory?.backgroundGradient, activeThreadForHistory?.noteCount, routeSelectedSpaceId]);

  // currentItemId is already initialized from pathname in useState
  // This useEffect just updates it when the page changes

  // Listen for page changes to update currentItemId when pathname changes
  useEffect(() => {
    setCurrentItemId(extractIdFromPath(pathname) || '');

    // Debounce to avoid multiple rapid updates during navigation
    let timeoutRef: ReturnType<typeof setTimeout> | null = null;
    
    const handlePageLoad = () => {
      // Clear any pending updates
      if (timeoutRef) clearTimeout(timeoutRef);
      
      // Use requestAnimationFrame for immediate visual update
      requestAnimationFrame(() => {
        if (typeof window !== 'undefined') {
          const newPath = extractIdFromPath(window.location.pathname) || '';
          setCurrentItemId(newPath);

          // If we navigated to a space route, make that the selected space.
          if (newPath.startsWith('space_')) {
            setSelectedSpaceId(newPath);
          }

          // If we navigated from a space context (e.g., opening a note from a space page),
          // preserve that selected space via query param.
          try {
            const params = new URLSearchParams(window.location.search);
            const fromSpace = params.get('space');
            if (fromSpace && fromSpace.startsWith('space_')) {
              setSelectedSpaceId(fromSpace);
            }
          } catch {
            // ignore
          }
          
          // Re-render is already triggered by setCurrentItemId above.
          // Do NOT call setUpdatedActiveThread(activeThread) here — the closure
          // captures a stale activeThread (null before useThread resolves) and
          // overwrites the correct value set by useEffect([activeThread]).
        }
      });
    };

    document.addEventListener('app:route-change', handlePageLoad);
    return () => {
      if (timeoutRef) clearTimeout(timeoutRef);
      document.removeEventListener('app:route-change', handlePageLoad);
    };
  }, [pathname, activeThread]);

  // If user navigates to a space route or thread/note with ?space=, sync the selected space and urlSpaceId for mismatch prompt.
  // Re-run when pathname/search change so view transitions that update props also persist URL space to storage.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncFromLocation = () => {
      const path = window.location.pathname || '/';
      try {
        const params = new URLSearchParams(window.location.search);
        const fromSpace = params.get('space');
        if (fromSpace && fromSpace.startsWith('space_')) {
          setUrlSpaceId(fromSpace);
          setSelectedSpaceId(fromSpace);
          return;
        }
      } catch {
        // ignore
      }
      setUrlSpaceId(null);
      if (path.startsWith('/space/')) {
        const id = extractIdFromPath(path);
        if (id) setSelectedSpaceId(id);
      }
    };

    syncFromLocation();
    document.addEventListener('app:route-change', syncFromLocation);
    return () => {
      document.removeEventListener('app:route-change', syncFromLocation);
    };
  }, [pathname, search]);

  // Spaces only switch via explicit user action (?space= in URL handled by the effect above,
  // or direct space navigation). Do not auto-select based on thread/note content.

  useEffect(() => {
    const handleNavigationUpdate = () => {
      forceUpdate(prev => prev + 1);
    };

    window.addEventListener('navigationHistoryUpdated', handleNavigationUpdate);
    
    // Also listen for storage events (if storage is changed elsewhere)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'harvous-navigation-history-v2') {
        handleNavigationUpdate();
      }
    };
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('navigationHistoryUpdated', handleNavigationUpdate);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // No longer using active thread button - threads appear only in persistent navigation
  // trackNavigationAccess() handles adding them automatically

  // Listen for note count changes to refresh activeThread count
  useEffect(() => {
    if (!activeThread) return;

    const lastRefreshTimeRef = { current: 0 };
    const pendingTimeoutRef = { current: null as NodeJS.Timeout | null };
    const DEBOUNCE_WINDOW_MS = 2000; // 2 seconds minimum between refreshes

    const refreshActiveThreadCount = async (skipDebounce: boolean = false) => {
      // Debounce: Check if enough time has passed since last refresh
      // Skip debounce for note creation events (they're infrequent and important)
      if (!skipDebounce) {
        const now = Date.now();
        const timeSinceLastRefresh = now - lastRefreshTimeRef.current;
        if (timeSinceLastRefresh < DEBOUNCE_WINDOW_MS) {
          // Too soon since last refresh, skip this one
          return;
        }
        lastRefreshTimeRef.current = now;
      } else {
        // Update last refresh time even when skipping debounce
        lastRefreshTimeRef.current = Date.now();
      }

      // Check if auth is ready before making API call
      if (!isAuthReady()) {
        // Auth not ready yet, skip silently
        return;
      }

      // Skip network requests when offline - use cached data
      if (!navigator.onLine) {
        return;
      }

      // Get expected count from current state
      const expectedCount = updatedActiveThread?.noteCount || activeThread?.noteCount || 0;
      
      // Use verification-based refresh if we have recent changes
      const forceRefresh = shouldForceRefresh(activeThread.id);
      
      try {
        let threadData: any = null;
        
        if (forceRefresh && skipDebounce) {
          // For recent changes, verify with polling
          const verifiedCount = await refreshBadgeCountsWithVerification(activeThread.id, expectedCount);
          if (verifiedCount !== null) {
            // Fetch full thread data via prefetch (handles shared space + unorganized threads)
            const response = await fetch(`/api/threads/${activeThread.id}/prefetch`, {
              credentials: 'include',
              cache: 'no-store'
            });
            if (response.ok) {
              const data = await response.json();
              threadData = data.thread;
            }
          }
        } else {
          // Regular fetch via prefetch (handles shared space + unorganized threads)
          const response = await fetch(`/api/threads/${activeThread.id}/prefetch`, {
            credentials: 'include',
            cache: 'no-store'
          });

          // Handle 401 errors gracefully - auth may not be fully established yet
          if (response.status === 401) {
            // Silently fail - auth will establish soon
            return;
          }

          if (response.ok) {
            const data = await response.json();
            threadData = data.thread;
          }
        }
        
        if (threadData) {
          // Track that we updated via API (not events)
          const now = Date.now();
          const timeSinceEventUpdate = now - lastEventUpdateTimeRef.current;
          
          setUpdatedActiveThread((prev) => {
            // Check if anything changed (count, title, or color)
            const countChanged = prev?.noteCount !== threadData.noteCount;
            const titleChanged = prev?.title !== threadData.title;
            const colorChanged = prev?.backgroundGradient !== threadData.backgroundGradient;
            
            if (!countChanged && !titleChanged && !colorChanged) {
              return prev;
            }
            
            // If we recently updated via events, use the higher count (event might be more recent)
            if (timeSinceEventUpdate < 2000 && eventUpdatedCountRef.current !== null) {
              const eventCount = eventUpdatedCountRef.current;
              const serverCount = threadData.noteCount;
              // Use the higher count (event updates are immediate, server might lag)
              const finalCount = Math.max(eventCount, serverCount);
              eventUpdatedCountRef.current = finalCount;
              lastEventUpdateTimeRef.current = now;
              
              return {
                ...activeThread,
                title: threadData.title || activeThread.title,
                noteCount: finalCount,
                backgroundGradient: threadData.backgroundGradient || activeThread.backgroundGradient
              };
            }
            
            // No recent event updates, use server data
            eventUpdatedCountRef.current = threadData.noteCount;
            return {
              ...activeThread,
              title: threadData.title || activeThread.title,
              noteCount: threadData.noteCount,
              backgroundGradient: threadData.backgroundGradient || activeThread.backgroundGradient
            };
          });

          // Sync the API-fetched count back to navigation history so inactive threads show correct badges
          updateNavigationItemCount(activeThread.id, threadData.noteCount);
        }
      } catch (error) {
        // Silently fail - network errors are expected during auth establishment
        // Don't log errors during initial load
      }
    };

    // Use verification-based refresh instead of arbitrary delays
    const scheduleRefresh = async (skipDebounce: boolean = false) => {
      // Clear any pending timeout first
      if (pendingTimeoutRef.current) {
        clearTimeout(pendingTimeoutRef.current);
      }
      
      // For note creation, refresh immediately with verification
      // For other events, use debounce window but still verify
      if (skipDebounce) {
        // Immediate refresh with verification
        await refreshActiveThreadCount(true);
      } else {
        // Use debounce window but still verify
        const now = Date.now();
        const timeSinceLastRefresh = now - lastRefreshTimeRef.current;
        if (timeSinceLastRefresh < DEBOUNCE_WINDOW_MS) {
          return; // Too soon, skip
        }
        await refreshActiveThreadCount(false);
      }
    };

    const handleNoteCreated = (event: Event) => {
      const customEvent = event as CustomEvent;
      // PHASE 2: Use event detail as primary source (includes threadId)
      // Use threadId from event detail first, then actualThreadId, then note.threadId
      const actualThreadId = customEvent.detail?.threadId || customEvent.detail?.actualThreadId || customEvent.detail?.note?.threadId;
      
      // Only refresh if the note was created in the active thread
      if (actualThreadId === activeThread.id) {
        // Immediately update count optimistically (event-based update)
        setUpdatedActiveThread((prev) => {
          if (prev) {
            const newCount = (prev.noteCount || 0) + 1;
            // Track event update
            lastEventUpdateTimeRef.current = Date.now();
            eventUpdatedCountRef.current = newCount;
            return {
              ...prev,
              noteCount: newCount
            };
          }
          return prev;
        });
        
        // Then refresh from API to get accurate count (verification-based, no delay)
        scheduleRefresh(true);
      }
      // If note was created in a different thread, skip refresh
    };

    const handleNoteDeleted = () => {
      scheduleRefresh();
    };

    const handleNoteRemovedFromThread = (event: CustomEvent) => {
      const { threadId } = event.detail;
      if (threadId === activeThread.id) {
        scheduleRefresh();
      }
    };

    const handleNoteAddedToThread = (event: CustomEvent) => {
      const { threadId } = event.detail;
      if (threadId === activeThread.id) {
        scheduleRefresh();
      }
    };

    const handleThreadUpdated = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { threadId } = customEvent.detail || {};
      if (threadId === activeThread.id) {
        // Force immediate refresh for thread updates (title/color changes should be visible immediately)
        refreshActiveThreadCount(true);
      }
    };

    // Register event listeners
    window.addEventListener('noteCreated', handleNoteCreated as EventListener);
    window.addEventListener('noteDeleted', handleNoteDeleted);
    window.addEventListener('noteRemovedFromThread', handleNoteRemovedFromThread as EventListener);
    window.addEventListener('noteAddedToThread', handleNoteAddedToThread as EventListener);
    window.addEventListener('threadUpdated', handleThreadUpdated as EventListener);

    // Cleanup
    return () => {
      window.removeEventListener('noteCreated', handleNoteCreated as EventListener);
      window.removeEventListener('noteDeleted', handleNoteDeleted);
      window.removeEventListener('noteRemovedFromThread', handleNoteRemovedFromThread as EventListener);
      window.removeEventListener('noteAddedToThread', handleNoteAddedToThread as EventListener);
      window.removeEventListener('threadUpdated', handleThreadUpdated as EventListener);
      // Clear pending timeout on cleanup
      if (pendingTimeoutRef.current) {
        clearTimeout(pendingTimeoutRef.current);
        pendingTimeoutRef.current = null;
      }
    };
  }, [activeThread]);

  // Manually add space to navigation history (bypassing addToNavigationHistory's early return for spaces)
  const addSpaceToNavigationHistory = (space: Space) => {
    if (typeof window === 'undefined') return;
    
    try {
      // When (re-)adding a space to the opened list, remove it from the closed list so it shows in the dropdown.
      // MUST use window.localStorage directly to stay consistent with NavigationContext.
      try {
        const closedStored = window.localStorage.getItem('harvous-closed-navigation-items');
        const closedParsed = closedStored ? (JSON.parse(closedStored) as unknown) : [];
        const closedIds = Array.isArray(closedParsed) ? closedParsed.filter((x) => typeof x === 'string') : [];
        const filtered = closedIds.filter((id) => id !== space.id);
        if (filtered.length !== closedIds.length) {
          window.localStorage.setItem('harvous-closed-navigation-items', JSON.stringify(filtered));
        }
      } catch {
        // ignore
      }

      const stored = window.localStorage.getItem('harvous-navigation-history-v2');
      const history = stored ? JSON.parse(stored) : [];
      
      // Check if space already exists
      const existingIndex = history.findIndex((item: any) => item.id === space.id);
      
      if (existingIndex !== -1) {
        // Update existing space
        history[existingIndex] = {
          ...history[existingIndex],
          title: space.title,
          backgroundGradient: space.backgroundGradient,
          isShared: space.isShared ?? history[existingIndex].isShared ?? false,
          lastAccessed: Date.now()
        };
      } else {
        // Add new space
        history.push({
          id: space.id,
          title: space.title,
          backgroundGradient: space.backgroundGradient,
          isShared: space.isShared ?? false,
          firstAccessed: Date.now(),
          lastAccessed: Date.now()
        });
      }
      
      // Sort by firstAccessed to maintain chronological order
      history.sort((a: any, b: any) => {
        const aFirst = (a.firstAccessed != null) ? a.firstAccessed : Number.MAX_SAFE_INTEGER;
        const bFirst = (b.firstAccessed != null) ? b.firstAccessed : Number.MAX_SAFE_INTEGER;
        return aFirst - bFirst;
      });
      
      // Limit to 10 items
      const limitedHistory = history.length > 10 ? history.slice(0, 10) : history;
      
      // Save to storage
      try {
        window.localStorage.setItem('harvous-navigation-history-v2', JSON.stringify(limitedHistory));
      } catch {
        try { window.sessionStorage?.setItem('harvous-navigation-history-v2', JSON.stringify(limitedHistory)); } catch { /* ignore */ }
      }
      
      // Refresh navigation context to update React state
      if (refreshNavigation) {
        refreshNavigation();
      }
      
      // Dispatch event to update UI (for components that listen to this event)
      window.dispatchEvent(new CustomEvent('navigationHistoryUpdated'));
    } catch (error) {
      console.error('Error adding space to navigation history:', error);
    }
  };

  const closeSpaceFromSwitcher = async (spaceId: string, spaceTitle: string) => {
    if (typeof window === 'undefined') return;
    if (!spaceId.startsWith('space_')) return;

    // Remove immediately from this dropdown list for instant feedback
    setLocalSpaces((prev) => prev.filter((s) => s.id !== spaceId));

    // If the user just closed the selected space, clear the selection
    // removeFromNavigationHistory will handle navigation to next available item
    const isSelected = effectiveSelectedSpaceId === spaceId;
    if (isSelected) {
      setSelectedSpaceId(null);
    }

    // Mark as closed and navigate to next available item
    // removeFromNavigationHistory will handle navigation to next available space
    removeFromNavigationHistory(spaceId);
  };

  // Top gradient: show only when thread list is scrolled down (same as Tiptap)
  const SCROLL_TOP_THRESHOLD = 3; // px; avoid subpixel/flicker at exact top
  useEffect(() => {
    const el = navColumnScrollRef.current;
    if (!el) return;
    const update = () => setNavScrollHasScrolledDown(el.scrollTop > SCROLL_TOP_THRESHOLD);
    el.addEventListener('scroll', update);
    // Run after layout so initial scrollTop is correct
    const raf = requestAnimationFrame(() => update());
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('scroll', update);
    };
  }, []);

  return (
    <>
      <div className="nav-column-wrapper">
        <div className="nav-column-layout">
        {/* Top Section - Navigation */}
        <div className="nav-column-top">
          {/* Navigation Buttons */}
          <div className="nav-column-buttons">
            <div className="space-switcher-anchor">
              <a
                href={topSpaceHref}
                className="nav-link"
                aria-current={topSpaceIsActive ? 'page' : undefined}
                data-navigation-item={displaySelectedSpaceId ?? '__dashboard_home__'}
                data-persistent-nav-active={topSpaceIsActive ? 'true' : undefined}
                data-open-space-switcher-on-enter="true"
                onClick={(e) => {
                  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                  const noteIdFromPath = extractIdFromPath(window.location.pathname);
                  const noteIdFromDom = (document.querySelector('[data-note-id]') as HTMLElement | null)?.dataset.noteId ?? null;
                  const currentNoteId = (noteIdFromPath?.startsWith('note_') ? noteIdFromPath : null)
                    ?? (noteIdFromDom?.startsWith('note_') ? noteIdFromDom : null);
                  const activeThreadId = currentThreadForMismatch?.id;
                  if (!currentNoteId || !activeThreadId?.startsWith('thread_')) return;
                  const backTarget = getBackTarget(currentNoteId, activeThreadId, displaySelectedSpaceId);
                  if (backTarget.startsWith('/note/')) {
                    e.preventDefault();
                    popNavStack(activeThreadId);
                    safeNavigate(backTarget);
                  }
                }}
              >
                <SpaceButton
                  as="div"
                  text={resolvedTopSpaceLabel}
                  count={inboxCount}
                  state="WithCount"
                  rightAccessory="none"
                  isActive={topSpaceIsActive}
                  backgroundGradient={resolvedTopSpaceBackground}
                />
              </a>
              {/* Native dropdown so it works even without React hydration */}
              <details ref={spaceSwitcherDetailsRef} className="space-switcher-details">
                <summary
                  className="space-btn__badge-wrapper space-switcher-anchor__toggle"
                  aria-label="Switch space"
                  aria-controls={spaceSwitcherMenuId}
                >
                  <span className="space-btn__toggle-icon" aria-hidden="true">
                    <Icon name="sort" size={20} />
                  </span>
                </summary>
                <div
                  id={spaceSwitcherMenuId}
                  className="space-switcher-details__panel space-switcher-dropdown__panel"
                  role="dialog"
                  aria-label="Switch space"
                  aria-modal="false"
                >
                  <div className="space-switcher-dropdown__scroll">
                  <a
                    href="/"
                    className={`space-switcher-dropdown__item ${!displaySelectedSpaceId ? 'is-active' : ''}`}
                    aria-current={!displaySelectedSpaceId ? 'page' : undefined}
                    onClick={() => setSelectedSpaceId(null)}
                  >
                    <span className="space-switcher-dropdown__label">My Home</span>
                    <span className="space-switcher-dropdown__icon-slot" aria-hidden="true">
                      {!displaySelectedSpaceId ? (
                        <span className="space-switcher-dropdown__check">
                          <Icon name="check" size={20} style={{ color: 'var(--color-deep-grey)' }} />
                        </span>
                      ) : null}
                    </span>
                  </a>
                  {spacesForDropdown.map((s) => {
                    const isActive = displaySelectedSpaceId ? s.id === displaySelectedSpaceId : false;
                    return (
                      <a
                        key={s.id}
                        href={idToUrl(s.id)}
                        className={`space-switcher-dropdown__item ${isActive ? 'is-active' : ''}`}
                        aria-current={isActive ? 'page' : undefined}
                        onClick={() => setSelectedSpaceId(s.id)}
                      >
                        <span className="space-switcher-dropdown__icon-prefix" aria-hidden="true">
                          <Icon name={s.isShared ? 'user-group' : 'user'} size={16} style={{ color: 'var(--color-deep-grey)' }} />
                        </span>
                        <span className="space-switcher-dropdown__label">{s.title}</span>
                        <span className="space-switcher-dropdown__icon-slot" aria-hidden={isActive ? 'true' : undefined}>
                          {isActive ? (
                            <span className="space-switcher-dropdown__check" aria-hidden="true">
                              <Icon name="check" size={20} style={{ color: 'var(--color-deep-grey)' }} />
                            </span>
                          ) : null}
                          <button
                            type="button"
                            className="space-switcher-dropdown__close-btn"
                            aria-label={`Close ${s.title}`}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              void closeSpaceFromSwitcher(s.id, s.title);
                            }}
                          >
                            <Icon name="xmark" size={20} style={{ color: 'var(--color-deep-grey)' }} />
                          </button>
                        </span>
                      </a>
                    );
                  })}
                  {availableSpaces.length > 0 && (
                    <>
                      <div className="space-switcher-dropdown__divider" />
                      <button
                        type="button"
                        className="space-switcher-dropdown__item"
                        style={{ width: '100%' }}
                        aria-expanded={isShowingExistingSpaces}
                        aria-controls={spaceSwitcherExistingRegionId}
                        onClick={() => setIsShowingExistingSpaces(!isShowingExistingSpaces)}
                      >
                        <span className="space-switcher-dropdown__label">Add Existing Space</span>
                        <span className="space-switcher-dropdown__icon-slot" aria-hidden="true">
                          <Icon name={isShowingExistingSpaces ? "chevron-up" : "chevron-down"} size={20} style={{ color: 'var(--color-deep-grey)' }} />
                        </span>
                      </button>
                      <div
                        id={spaceSwitcherExistingRegionId}
                        role="region"
                        aria-label="Spaces to add"
                        hidden={!isShowingExistingSpaces}
                      >
                        {isShowingExistingSpaces &&
                          availableSpaces.map((s) => {
                            return (
                              <a
                                key={s.id}
                                href={idToUrl(s.id)}
                                className="space-switcher-dropdown__item"
                                onClick={() => {
                                  setSelectedSpaceId(s.id);
                                  addSpaceToNavigationHistory(s);
                                  setIsShowingExistingSpaces(false);
                                }}
                              >
                                <span className="space-switcher-dropdown__icon-prefix" aria-hidden="true">
                                  <Icon name={s.isShared ? 'user-group' : 'user'} size={16} style={{ color: 'var(--color-deep-grey)' }} />
                                </span>
                                <span className="space-switcher-dropdown__label">{s.title}</span>
                              </a>
                            );
                          })}
                      </div>
                    </>
                  )}
                  </div>
                  {!isClassicAppSurface() ? (
                    <div className="space-switcher-dropdown__footer">
                      <div className="space-switcher-dropdown__divider" />
                      <a href="/new-space" className="space-switcher-dropdown__item space-switcher-dropdown__new-space">
                        <span className="space-switcher-dropdown__label">New Space</span>
                        <span className="space-switcher-dropdown__check" aria-hidden="true">
                          <Icon name="plus" size={20} style={{ color: 'var(--color-deep-grey)' }} />
                        </span>
                      </a>
                    </div>
                  ) : null}
                </div>
              </details>
            </div>

            {debouncedShowMismatch ? (
              <div className="space-mismatch-banner" role="alert" aria-label="Thread space mismatch">
                <div className="space-mismatch-banner__text">
                  <p className="space-mismatch-banner__copy">
                    Would you like to add this thread to {selectedSpaceTitleForMismatch}?
                  </p>
                </div>
                <div className="space-mismatch-banner__actions">
                  <ButtonSmall state="Default" onClick={moveThreadToSelectedSpace} disabled={isMovingThreadToSpace}>
                    {isMovingThreadToSpace ? 'Adding…' : `Add to ${selectedSpaceTitleForMismatch}`}
                  </ButtonSmall>
                  <ButtonSmall state="Secondary" onClick={dismissSpaceMismatchPrompt}>
                    Not Now
                  </ButtonSmall>
                </div>
              </div>
            ) : null}
            
            {/* Persistent Navigation - scrollable thread list (desktop); gradient overlays top of list only */}
            <div className="nav-column-scroll-wrapper">
              <div
                className={`nav-column-top-gradient-band ${navScrollHasScrolledDown ? 'is-visible' : ''}`}
                aria-hidden="true"
              />
              <div
                ref={navColumnScrollRef}
                className={`nav-column-scroll ${navScrollHasScrolledDown ? 'nav-column-scroll--top-fade' : ''}`}
              >
                <PersistentNavigation
                  activeThread={updatedActiveThread || activeThread}
                  effectiveSpaceIdForLinks={effectiveSelectedSpaceId}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Bottom gradient overlay (desktop) - indicates more content below */}
        <div className="nav-column-bottom-gradient" aria-hidden="true" />

        {/* Bottom Section: profile name (fills width) + search fixed on the right */}
        <div className="nav-column-bottom">
          <div className="nav-column-bottom__profile-slot">
            {showProfile ? (
              <a href="/" aria-label="Go to dashboard" className="nav-column-bottom__profile-back">
                <SquareButton variant="Back" />
              </a>
            ) : (
              <a
                href="/profile"
                aria-label={`Profile: ${effectiveUserDisplayName}`}
                className="nav-column-bottom__profile-link"
              >
                <div
                  className="nav-column-bottom__profile-pill"
                  style={{ background: `var(--color-${profileData.userColor})` }}
                >
                  <span
                    className="nav-column-bottom__profile-name"
                    style={{ color: getThreadTextColorCSS(profileData.userColor as ThreadColor) }}
                  >
                    {effectiveUserDisplayName}
                  </span>
                </div>
              </a>
            )}
          </div>
          <button
            type="button"
            aria-label="Search"
            className="mobile-nav__search-btn nav-column-bottom__search-link"
            onClick={() => window.dispatchEvent(new CustomEvent('openSpotlightSearch'))}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
              <svg viewBox="0 0 512 512" aria-hidden="true">
                <path d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z" />
              </svg>
            </div>
          </button>
        </div>
        </div>
      </div>

    </>
  );
};

export default NavigationColumn;
