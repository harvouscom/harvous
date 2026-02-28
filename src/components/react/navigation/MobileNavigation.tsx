import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigation } from './NavigationContext';
import SpaceButton from './SpaceButton';
import Avatar from './Avatar';
import { getThreadGradientCSS } from '@/utils/colors';
import Icon from '../Icon';
import { formatBadgeCount } from '@/utils/badge-count';
import { setSelectedSpaceId, useSelectedSpaceId } from './selectedSpace';
import ButtonSmall from '../ButtonSmall';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { safeGetItem, safeSetItem } from '@/utils/safe-storage';
import { idToUrl, extractIdFromPath } from '@/utils/url-helpers';
import { useBottomSheetDrag } from '@/hooks/useBottomSheetDrag';
import { safeNavigateSync, preloadSafeNavigate } from '@/utils/safe-navigate';

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

interface Thread {
  id: string;
  title: string;
  noteCount: number;
  backgroundGradient: string;
  spaceId?: string;
}

interface MobileNavigationProps {
  spaces?: Space[];
  threads?: Thread[];
  inboxCount?: number;
  currentSpace?: Space | null;
  currentThread?: Thread | null;
  initials?: string;
  userColor?: string;
  /** Current pathname for route-derived selected space and currentItemId sync */
  pathname?: string;
  /** Current search string for ?space= */
  search?: string;
  /** Server-provided path (e.g. 'note_xxx') to ensure SSR/client match */
  initialPath?: string;
  /** Optional SPA navigation handler for client-side routing */
  onNavigate?: (href: string) => void;
}

const MobileNavigation: React.FC<MobileNavigationProps> = ({
  spaces = [],
  threads = [],
  inboxCount = 0,
  currentSpace = null,
  currentThread = null,
  initials = 'U',
  userColor = 'paper',
  pathname: pathnameProp = '',
  search: searchProp = '',
  initialPath = '',
  onNavigate,
}) => {
  const navigate = onNavigate || safeNavigateSync;
  const selectedSpaceId = useSelectedSpaceId();
  // Route-derived space (same logic as NavigationColumn): from ?space= or /space/...
  const routeSelectedSpaceId = useMemo(() => {
    try {
      const params = new URLSearchParams(searchProp || '');
      const fromQuery = params.get('space');
      if (fromQuery && fromQuery.startsWith('space_')) return fromQuery.replace(/\/$/, '');
    } catch {
      // ignore
    }
    if (pathnameProp.startsWith('/space/')) {
      const id = extractIdFromPath(pathnameProp);
      return id ? id.replace(/\/$/, '') : null;
    }
    return null;
  }, [pathnameProp, searchProp]);
  // Prefer route, then current space when on thread/note, then storage (so resize from desktop shows correct space)
  const isThreadOrNoteRoute = pathnameProp.startsWith('/thread/') || pathnameProp.startsWith('/note/');
  const effectiveSelectedSpaceId = routeSelectedSpaceId ?? (isThreadOrNoteRoute && currentSpace?.id ? currentSpace.id : null) ?? selectedSpaceId;
  const [dismissedMismatchKey, setDismissedMismatchKey] = useState<string | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isSpacePanelOpen, setIsSpacePanelOpen] = useState(false);
  const [isShowingExistingSpaces, setIsShowingExistingSpaces] = useState(false);
  const sheetFocusRef = useRef<HTMLButtonElement | null>(null);
  // Use initialPath from server to ensure SSR and client initial render match
  const [currentItemId, setCurrentItemId] = useState(initialPath);
  const { navigationHistory, removeFromNavigationHistory } = useNavigation();
  const [updatedCurrentThread, setUpdatedCurrentThread] = useState(currentThread);
  const [updatedCurrentSpace, setUpdatedCurrentSpace] = useState<Space | null>(currentSpace);
  const [activeThreadFromDom, setActiveThreadFromDom] = useState<Thread | null>(null);
  // Track recent event updates to prevent sync effect and DOM reads from overwriting them
  const lastEventUpdateRef = useRef<{ spaceId: string; timestamp: number } | null>(null);
  // Local state for spaces that gets updated when spaces are modified
  const [localSpaces, setLocalSpaces] = useState<Space[]>(spaces);
  // Track which items are in "close mode" (showing close icon instead of badge)
  const [itemsInCloseMode, setItemsInCloseMode] = useState<Set<string>>(new Set());
  // Track items explicitly closed this session so they stay hidden until nav history propagates
  const [closedItemIds, setClosedItemIds] = useState<Set<string>>(new Set());
  // IDs of spaces deleted this session so dropdown and "Add Existing Space" don't show them (match desktop)
  const deletedSpaceIdsRef = useRef<Set<string>>(new Set());
  // Profile data state for avatar updates
  const [profileData, setProfileData] = useState({
    initials: initials,
    userColor: userColor,
  });
  // Sync avatar when parent passes updated profile (e.g. useProfile() resolve after sign-in)
  useEffect(() => {
    setProfileData({ initials, userColor });
  }, [initials, userColor]);

  // Keep localSpaces in sync with spaces prop (match desktop: merge, never re-add deleted)
  useEffect(() => {
    const deleted = deletedSpaceIdsRef.current;
    setLocalSpaces((prev) => {
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

  // Sync updatedCurrentThread when currentThread prop changes
  useEffect(() => {
    setUpdatedCurrentThread(currentThread);
  }, [currentThread]);

  // Sync updatedCurrentSpace when currentSpace prop changes
  // BUT only if we don't already have a more recent update for this space.
  // Depend on stable primitives (id, title, backgroundGradient) so we don't re-run every
  // render when parent passes a new object reference for the same space (which causes
  // "Maximum update depth exceeded"). Do NOT include updatedCurrentSpace in deps — the
  // effect updates it, so including it would cause an infinite loop.
  const currentSpaceId = currentSpace?.id ?? null;
  const currentSpaceTitle = currentSpace?.title ?? '';
  const currentSpaceGradient = currentSpace?.backgroundGradient ?? '';
  useEffect(() => {
    // Don't sync if we just updated from an event (within last 2 seconds)
    if (lastEventUpdateRef.current && 
        lastEventUpdateRef.current.spaceId === currentSpaceId &&
        Date.now() - lastEventUpdateRef.current.timestamp < 2000) {
      return;
    }
    
    if (!currentSpace) {
      setUpdatedCurrentSpace(null);
      return;
    }
    // Only sync if:
    // 1. We don't have updatedCurrentSpace set, OR
    // 2. The currentSpace ID is different from what we have, OR
    // 3. The currentSpace ID matches but we want to ensure it's in sync
    setUpdatedCurrentSpace(prev => {
      if (!prev || prev.id !== currentSpace.id) {
        return currentSpace;
      }
      // Same space - merge to preserve any updates we have while syncing other fields
      if (prev.backgroundGradient && prev.backgroundGradient !== currentSpace.backgroundGradient) {
        return { ...currentSpace, backgroundGradient: prev.backgroundGradient };
      }
      return currentSpace;
    });
  }, [currentSpaceId, currentSpaceTitle, currentSpaceGradient]);

  // Sync localSpaces when spaces prop changes (e.g., on initial load or navigation)
  useEffect(() => {
    setLocalSpaces(spaces);
  }, [spaces]);

  // Sync selected space to storage when on thread/note so desktop and mobile agree after resize
  useEffect(() => {
    if (isThreadOrNoteRoute && currentSpace?.id) {
      setSelectedSpaceId(currentSpace.id);
    }
  }, [pathnameProp, currentSpace?.id, isThreadOrNoteRoute]);

  // Best-effort fallback: derive the active thread from DOM (for timing / View Transition cases)
  // Defined at component level so handleThreadUpdated (in a separate useEffect) can call it
  const readActiveThreadFromDom = useCallback(() => {
    try {
      const path = window.location.pathname || '/';
      const itemId = extractIdFromPath(path) || (path.startsWith('/') ? path.slice(1) : path);

      // Note page: parent thread data
      if (itemId.startsWith('note_')) {
        const noteEl = document.querySelector('[data-note-id]') as HTMLElement | null;
        const parentThreadId = noteEl?.dataset?.parentThreadId ?? null;
        if (!parentThreadId || !parentThreadId.startsWith('thread_')) {
          setActiveThreadFromDom(null);
          return;
        }
        setActiveThreadFromDom({
          id: parentThreadId,
          title: noteEl?.dataset?.parentThreadTitle || 'Thread',
          noteCount: parseInt(noteEl?.dataset?.parentThreadCount || '0'),
          backgroundGradient: noteEl?.dataset?.parentThreadBackgroundGradient || getThreadGradientCSS('paper'),
          spaceId: noteEl?.dataset?.parentThreadSpaceId || undefined,
        });
        return;
      }

      // Thread page: thread data from navigation dataset (best available)
      if (itemId.startsWith('thread_')) {
        // Try multiple selectors to find thread data (desktop and mobile)
        const navEl =
          (document.querySelector('[data-navigation-active="true"]') as HTMLElement | null) ??
          (document.querySelector('[slot="navigation"]') as HTMLElement | null) ??
          (document.querySelector(`[data-thread-id="${itemId}"]`) as HTMLElement | null) ??
          (document.querySelector(`[data-navigation-item="${itemId}"]`) as HTMLElement | null);
        const threadId = navEl?.dataset?.threadId ?? itemId;
        if (!threadId || !threadId.startsWith('thread_')) {
          setActiveThreadFromDom(null);
          return;
        }
        setActiveThreadFromDom({
          id: threadId,
          title: navEl?.dataset?.threadTitle || navEl?.dataset?.title || 'Thread',
          noteCount: parseInt(navEl?.dataset?.threadNoteCount || '0'),
          backgroundGradient: navEl?.dataset?.threadBackgroundGradient || navEl?.dataset?.backgroundGradient || getThreadGradientCSS('paper'),
          spaceId: (navEl?.dataset?.threadSpaceId as string | undefined) ?? undefined,
        });
        return;
      }

      setActiveThreadFromDom(null);
    } catch {
      setActiveThreadFromDom(null);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    readActiveThreadFromDom();
    document.addEventListener('app:route-change', readActiveThreadFromDom);
    return () => {
      document.removeEventListener('app:route-change', readActiveThreadFromDom);
    };
  }, [readActiveThreadFromDom]);

  // Determine text color - pastel colors use dark text for visibility
  const getTextColor = (gradient: string | undefined, isActive: boolean): string => {
    // All thread colors use dark text (pastel colors)
    return 'var(--color-deep-grey)';
  };

  const isDashboard = currentItemId === '' || currentItemId === 'dashboard';
  const isNote = currentItemId.startsWith('note_');

  const routeActiveItemId = useMemo(() => {
    // Match NavigationContext.getCurrentActiveItemId() behavior.
    // - Thread/space routes: the URL id is the source of truth
    // - Note routes: resolve to parent thread id from DOM datasets
    if (typeof window === 'undefined') return '';

    const current = currentItemId || '';
    if (!current.startsWith('note_')) return current;

    // First priority: SSR-provided currentThread when available (most stable)
    if (currentThread?.id && currentThread.id.startsWith('thread_')) return currentThread.id;

    // Second priority: best-effort DOM-derived thread (View Transition timing cases)
    if (activeThreadFromDom?.id && activeThreadFromDom.id.startsWith('thread_')) return activeThreadFromDom.id;

    // First priority: note element dataset
    const noteElement = document.querySelector('[data-note-id]') as HTMLElement | null;
    const fromNote = noteElement?.dataset?.parentThreadId ?? null;
    if (fromNote && fromNote.startsWith('thread_')) return fromNote;

    // Second priority: stable navigation wrapper dataset
    const navElement =
      (document.querySelector('[data-navigation-active="true"]') as HTMLElement | null) ??
      (document.querySelector('[slot="navigation"]') as HTMLElement | null);
    const fromNav = navElement?.dataset?.parentThreadId ?? null;
    if (fromNav && fromNav.startsWith('thread_')) return fromNav;

    // Final fallback
    return 'thread_unorganized';
  }, [currentItemId, currentThread?.id, activeThreadFromDom?.id]);

  // Initialize current item ID on mount (component is client-only, so window is always available)
  useEffect(() => {
    setCurrentItemId(extractIdFromPath(window.location.pathname) || window.location.pathname.substring(1));
  }, []);

  // Sync currentItemId from pathname prop when it changes (e.g. after navigating on desktop then resizing to mobile)
  useEffect(() => {
    const id = extractIdFromPath(initialPath) || (initialPath.startsWith('/') ? initialPath.substring(1) : initialPath) || '';
    setCurrentItemId(id);
  }, [initialPath]);

  // Listen for page changes to update current item
  useEffect(() => {
    const handlePageLoad = () => {
      // Update current item ID when page changes
      const newPath = extractIdFromPath(window.location.pathname) || window.location.pathname.substring(1);
      setCurrentItemId(newPath);

      // If we navigated to a space route, make that the selected space.
      if (newPath.startsWith('space_')) {
        setSelectedSpaceId(newPath);
      }

      // Preserve space context from query param when opening notes from a space.
      try {
        const params = new URLSearchParams(window.location.search);
        const fromSpace = params.get('space');
        if (fromSpace && fromSpace.startsWith('space_')) {
          setSelectedSpaceId(fromSpace);
        }
      } catch {
        // ignore
      }
    };

    document.addEventListener('app:route-change', handlePageLoad);
    return () => {
      document.removeEventListener('app:route-change', handlePageLoad);
    };
  }, []);

  // Keep selected space in sync when navigating to a space route.
  useEffect(() => {
    const syncFromLocation = () => {
      const path = window.location.pathname || '/';
      try {
        const params = new URLSearchParams(window.location.search);
        const fromSpace = params.get('space');
        if (fromSpace && fromSpace.startsWith('space_')) {
          setSelectedSpaceId(fromSpace);
          return;
        }
      } catch {
        // ignore
      }
      const spaceId = extractIdFromPath(path);
      if (spaceId && spaceId.startsWith('space_')) {
        setSelectedSpaceId(spaceId);
      }
    };

    syncFromLocation();
    document.addEventListener('app:route-change', syncFromLocation);
    return () => {
      document.removeEventListener('app:route-change', syncFromLocation);
    };
  }, []);

  // Listen for note count changes to refresh currentThread count
  useEffect(() => {
    if (!currentThread) return;

    const refreshCurrentThreadCount = async () => {
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
      const expectedCount = updatedCurrentThread?.noteCount || currentThread?.noteCount || 0;
      
      // Use verification-based refresh if we have recent changes
      const badgeRefreshModule = await import('@/utils/badge-count-refresh');
      const forceRefresh = badgeRefreshModule.shouldForceRefresh(currentThread.id);
      
      try {
        let threadData: any = null;
        
        if (forceRefresh) {
          // For recent changes, verify with polling
          const verifiedCount = await badgeRefreshModule.refreshBadgeCountsWithVerification(currentThread.id, expectedCount);
          if (verifiedCount !== null) {
            // Fetch full thread data
            const response = await fetch('/api/threads/list', {
              credentials: 'include',
              cache: 'no-store'
            });
            if (response.ok) {
              const threads = await response.json();
              threadData = threads.find((t: any) => t.id === currentThread.id);
            }
          }
        } else {
          // Regular fetch
          const response = await fetch('/api/threads/list', {
            credentials: 'include',
            cache: 'no-store'
          });

          // Handle 401 errors gracefully - auth may not be fully established yet
          if (response.status === 401) {
            // Silently fail - auth will establish soon
            return;
          }

          if (response.ok) {
            const threads = await response.json();
            threadData = threads.find((t: any) => t.id === currentThread.id);
          }
        }
        
        if (threadData) {
          setUpdatedCurrentThread((prev) => {
            // Check if anything changed (count, title, or color)
            const countChanged = prev?.noteCount !== threadData.noteCount;
            const titleChanged = prev?.title !== threadData.title;
            const colorChanged = prev?.backgroundGradient !== threadData.backgroundGradient;
            
            if (!countChanged && !titleChanged && !colorChanged) {
              return prev;
            }
            
            return {
              ...currentThread,
              title: threadData.title || currentThread.title,
              noteCount: threadData.noteCount,
              backgroundGradient: threadData.backgroundGradient || currentThread.backgroundGradient
            };
          });
        }
      } catch (error) {
        // Silently fail - network errors are expected during auth establishment
        // Don't log errors during initial load
      }
    };

    const handleNoteCreated = async (event: Event) => {
      const customEvent = event as CustomEvent;
      // PHASE 2: Use event detail as primary source (includes threadId)
      // Use threadId from event detail first, then actualThreadId, then note.threadId
      const actualThreadId = customEvent.detail?.threadId || customEvent.detail?.actualThreadId || customEvent.detail?.note?.threadId;
      
      // Only refresh if the note was created in the current thread
      if (actualThreadId === currentThread.id) {
        // Refresh immediately with verification (no delay)
        await refreshCurrentThreadCount();
      }
      // If note was created in a different thread, skip refresh
    };

    const handleNoteDeleted = async () => {
      // Refresh immediately with verification (no delay)
      await refreshCurrentThreadCount();
    };

    const handleNoteRemovedFromThread = async (event: Event) => {
      const { threadId } = (event as CustomEvent).detail || {};
      if (threadId === currentThread.id) {
        // Refresh immediately with verification (no delay)
        await refreshCurrentThreadCount();
      }
    };

    const handleNoteAddedToThread = (event: Event) => {
      const { threadId } = (event as CustomEvent).detail || {};
      if (threadId === currentThread.id) {
        // Refresh count immediately (retry logic handles transient failures)
        refreshCurrentThreadCount();
      }
    };

    // Register event listeners
    window.addEventListener('noteCreated', handleNoteCreated as EventListener);
    window.addEventListener('noteDeleted', handleNoteDeleted);
    window.addEventListener('noteRemovedFromThread', handleNoteRemovedFromThread);
    window.addEventListener('noteAddedToThread', handleNoteAddedToThread);

    // Cleanup
    return () => {
      window.removeEventListener('noteCreated', handleNoteCreated as EventListener);
      window.removeEventListener('noteDeleted', handleNoteDeleted);
      window.removeEventListener('noteRemovedFromThread', handleNoteRemovedFromThread);
      window.removeEventListener('noteAddedToThread', handleNoteAddedToThread);
    };
  }, [currentThread]);
  
  // Separate useEffect for threadUpdated event - works even when currentThread is null
  useEffect(() => {
    const handleThreadUpdated = (event?: Event) => {
      // Get threadId and updated data from event detail if available
      const customEvent = event as CustomEvent;
      const eventThreadId = customEvent?.detail?.threadId;
      const eventTitle = customEvent?.detail?.title;
      const eventColor = customEvent?.detail?.color;
      const eventBackgroundGradient = customEvent?.detail?.backgroundGradient;
      
      // Determine which thread to update
      // Use eventThreadId if available, otherwise check currentThread, otherwise check URL
      const path = window.location.pathname || '/';
      const itemId = extractIdFromPath(path) || (path.startsWith('/') ? path.slice(1) : path);
      const threadIdToCheck = eventThreadId || currentThread?.id || (itemId.startsWith('thread_') ? itemId : null);
      
      // If we have a threadId from event and it doesn't match current thread, skip
      if (eventThreadId && currentThread && eventThreadId !== currentThread.id) {
        return;
      }
      
      // If we don't have a thread to check, skip
      if (!threadIdToCheck) {
        return;
      }
      
      // PRIORITY 1: Use event detail values if available (immediate update, no DOM read needed)
      if (eventTitle || eventBackgroundGradient) {
        setUpdatedCurrentThread((prev) => {
          const titleChanged = eventTitle && prev?.title !== eventTitle;
          const colorChanged = eventBackgroundGradient && prev?.backgroundGradient !== eventBackgroundGradient;
          
          if (!titleChanged && !colorChanged) {
            return prev;
          }
          
          return {
            ...(prev || currentThread),
            id: threadIdToCheck,
            title: eventTitle || prev?.title || currentThread?.title || 'Thread',
            backgroundGradient: eventBackgroundGradient || prev?.backgroundGradient || currentThread?.backgroundGradient || getThreadGradientCSS('paper')
          };
        });
        
        // Also read from DOM as fallback/verification (but don't wait for it)
        readActiveThreadFromDom();
        return; // Early return - we got the data from event, no need to read DOM
      }
      
      // PRIORITY 2: Fall back to DOM read if event detail doesn't have data
      // Use requestAnimationFrame to ensure DOM updates are visible (especially on mobile)
      requestAnimationFrame(() => {
        // First read from DOM (should be updated by EditThreadPanel)
        readActiveThreadFromDom();
        
        // Immediately update updatedCurrentThread from DOM if we can find the data
        // This provides instant UI feedback before the API call completes
        try {
          // Try multiple selectors to find updated thread data (desktop and mobile)
          const navEl =
            (document.querySelector('[data-navigation-active="true"]') as HTMLElement | null) ??
            (document.querySelector('[slot="navigation"]') as HTMLElement | null) ??
            (document.querySelector(`[data-thread-id="${threadIdToCheck}"]`) as HTMLElement | null) ??
            (document.querySelector(`[data-navigation-item="${threadIdToCheck}"]`) as HTMLElement | null);
          
          // Also check CardStack header (the visible header on the page)
          const cardStackHeader = document.querySelector(`.card-stack__header[data-thread-id="${threadIdToCheck}"]`) as HTMLElement | null;
          
          // Get title from CardStack header if available (most reliable source)
          const pageHeading = cardStackHeader?.querySelector('.page-heading p');
          const titleFromHeader = pageHeading?.textContent?.trim();
          
          // Get gradient from CardStack header style if available
          const gradientFromHeader = cardStackHeader?.style?.backgroundColor;
          
          // Combine data from navigation elements and CardStack header
          const newTitle = titleFromHeader || navEl?.dataset?.threadTitle || navEl?.dataset?.title;
          const newGradient = gradientFromHeader || navEl?.dataset?.threadBackgroundGradient || navEl?.dataset?.backgroundGradient;
          
          if (newTitle || newGradient) {
            setUpdatedCurrentThread((prev) => {
              const titleChanged = newTitle && prev?.title !== newTitle;
              const colorChanged = newGradient && prev?.backgroundGradient !== newGradient;
              
              if (!titleChanged && !colorChanged) {
                return prev;
              }
              
              return {
                ...(prev || currentThread),
                id: threadIdToCheck,
                title: newTitle || prev?.title || currentThread?.title || 'Thread',
                backgroundGradient: newGradient || prev?.backgroundGradient || currentThread?.backgroundGradient || getThreadGradientCSS('paper')
              };
            });
          }
          
          // If we have currentThread, also refresh from API to ensure we have latest data (including note count)
          if (currentThread && threadIdToCheck === currentThread.id) {
            // Import and call refreshCurrentThreadCount if available
            // We'll trigger this via a separate mechanism to avoid circular dependencies
            // The API refresh will happen through the navigationHistoryUpdated event
          }
        } catch (error) {
          // Silently fail - will fall back to API refresh
          console.error('[MobileNavigation] Error reading thread data from DOM:', error);
        }
      });
    };

    // Register event listener
    window.addEventListener('threadUpdated', handleThreadUpdated);

    // Cleanup
    return () => {
      window.removeEventListener('threadUpdated', handleThreadUpdated);
    };
  }, [currentThread, readActiveThreadFromDom]);

  // Update localSpaces when a space is updated (for dropdown and other space lists)
  useEffect(() => {
    const handleSpaceUpdated = (event: CustomEvent) => {
      const { spaceId, title, backgroundGradient } = event.detail || {};
      if (!spaceId || !title) {
        return;
      }

      setLocalSpaces(prev => {
        const byId = new Map<string, Space>();
        for (const s of prev) byId.set(s.id, s);

        // Update existing space if found, or create new entry if not found
        const existingSpace = byId.get(spaceId);
        if (existingSpace) {
          byId.set(spaceId, {
            ...existingSpace,
            title: title,
            backgroundGradient: backgroundGradient || existingSpace.backgroundGradient || 'var(--color-paper)',
          });
        } else {
          // Add new space if it doesn't exist (shouldn't happen normally, but handle edge cases)
          byId.set(spaceId, {
            id: spaceId,
            title: title,
            totalItemCount: 0,
            backgroundGradient: backgroundGradient || 'var(--color-paper)',
          });
        }
        
        return Array.from(byId.values());
      });
    };
    
    window.addEventListener('spaceUpdated', handleSpaceUpdated as EventListener);
    return () => window.removeEventListener('spaceUpdated', handleSpaceUpdated as EventListener);
  }, []);

  // When a new space is created, add it to localSpaces and set updatedCurrentSpace so the top bar
  // shows the correct color immediately (nav refetch is async).
  useEffect(() => {
    const handleSpaceCreated = (event: CustomEvent) => {
      const space = event.detail?.space as { id?: string; title?: string; color?: string; backgroundGradient?: string; totalItemCount?: number; isShared?: boolean } | undefined;
      if (!space?.id || !space.title) return;
      const backgroundGradient = space.backgroundGradient ?? getThreadGradientCSS(space.color ?? 'paper');
      const nextSpace: Space = {
        id: space.id,
        title: space.title,
        totalItemCount: typeof space.totalItemCount === 'number' ? space.totalItemCount : 0,
        backgroundGradient,
        isShared: space.isShared ?? false,
      };
      setLocalSpaces((prev) => {
        const byId = new Map<string, Space>();
        for (const s of prev) byId.set(s.id, s);
        byId.set(nextSpace.id, nextSpace);
        return Array.from(byId.values());
      });
      lastEventUpdateRef.current = { spaceId: space.id, timestamp: Date.now() };
      setUpdatedCurrentSpace(nextSpace);
    };
    window.addEventListener('spaceCreated', handleSpaceCreated as EventListener);
    return () => window.removeEventListener('spaceCreated', handleSpaceCreated as EventListener);
  }, []);

  // Separate useEffect for spaceUpdated event - works even when currentSpace is null
  useEffect(() => {
    const handleSpaceUpdated = (event?: Event) => {
      // Get spaceId and updated data from event detail if available
      const customEvent = event as CustomEvent;
      const eventSpaceId = customEvent?.detail?.spaceId;
      const eventTitle = customEvent?.detail?.title;
      const eventBackgroundGradient = customEvent?.detail?.backgroundGradient;

      // Determine which space to update
      // Use eventSpaceId if available, otherwise check currentSpace, selectedSpaceId, or URL
      const path = window.location.pathname || '/';
      const itemId = extractIdFromPath(path) || (path.startsWith('/') ? path.slice(1) : path);
      const spaceIdToCheck = eventSpaceId || currentSpace?.id || selectedSpaceId || (itemId.startsWith('space_') ? itemId : null);
      
      // Update updatedCurrentSpace if the space matches currentSpace OR selectedSpaceId
      // This ensures the button updates even when viewing a different space
      const shouldUpdateCurrentSpace = eventSpaceId && (
        (currentSpace && eventSpaceId === currentSpace.id) ||
        (selectedSpaceId && eventSpaceId === selectedSpaceId)
      );

      // If we have a spaceId from event but it doesn't match current space or selected space, skip
      if (eventSpaceId && !shouldUpdateCurrentSpace) {
        return;
      }

      // If we don't have a space to check, skip
      if (!spaceIdToCheck) {
        return;
      }
      
      // PRIORITY 1: Use event detail values if available (immediate update, no DOM read needed)
      if (eventTitle || eventBackgroundGradient) {
        // Use eventSpaceId directly if available, otherwise fall back to spaceIdToCheck
        // This ensures we use the correct space ID when updating
        const spaceIdForUpdate = eventSpaceId || spaceIdToCheck;
        
        // Always update updatedCurrentSpace if this is the selected space (shown in button)
        // or if it's the current space (being viewed)
        // Check selectedSpaceId first since that's what's displayed in the button
        const isSelectedSpace = eventSpaceId && selectedSpaceId && eventSpaceId === selectedSpaceId;
        const isCurrentSpace = eventSpaceId && currentSpace && eventSpaceId === currentSpace.id;

        // Always update if this space matches selectedSpaceId (the space shown in the button)
        // This is critical for the button to update live
        if (isSelectedSpace) {
          const newSpace = {
            id: spaceIdForUpdate,
            title: eventTitle || currentSpace?.title || 'Space',
            totalItemCount: currentSpace?.totalItemCount || 0,
            backgroundGradient: eventBackgroundGradient || currentSpace?.backgroundGradient || getThreadGradientCSS('paper')
          };
          lastEventUpdateRef.current = { spaceId: spaceIdForUpdate, timestamp: Date.now() };
          setUpdatedCurrentSpace(newSpace);
        } else if (isCurrentSpace) {
          // For current space, only update if something changed
          setUpdatedCurrentSpace((prev) => {
            if (prev && prev.id === spaceIdForUpdate) {
              const titleChanged = eventTitle && prev.title !== eventTitle;
              const colorChanged = eventBackgroundGradient && prev.backgroundGradient !== eventBackgroundGradient;

              // Only skip update if nothing changed
              if (!titleChanged && !colorChanged) {
                return prev;
              }
            }

            // Create or update the space object
            const newSpace = {
              id: spaceIdForUpdate,
              title: eventTitle || prev?.title || currentSpace?.title || 'Space',
              totalItemCount: prev?.totalItemCount || currentSpace?.totalItemCount || 0,
              backgroundGradient: eventBackgroundGradient || prev?.backgroundGradient || currentSpace?.backgroundGradient || getThreadGradientCSS('paper')
            };
            lastEventUpdateRef.current = { spaceId: spaceIdForUpdate, timestamp: Date.now() };
            return newSpace;
          });
        }
        
        // Also read from DOM as fallback/verification (but don't wait for it)
        readActiveSpaceFromDom();
        return; // Early return - we got the data from event, no need to read DOM
      }
      
      // PRIORITY 2: Fall back to DOM read if event detail doesn't have data
      // Use requestAnimationFrame to ensure DOM updates are visible (especially on mobile)
      requestAnimationFrame(() => {
        // Read from DOM (should be updated by EditSpacePanel)
        readActiveSpaceFromDom();
        
        // Immediately update updatedCurrentSpace from DOM if we can find the data
        // This provides instant UI feedback before the API call completes
        try {
          // Try multiple selectors to find updated space data (desktop and mobile)
          const navEl =
            (document.querySelector('[data-navigation-active="true"]') as HTMLElement | null) ??
            (document.querySelector('[slot="navigation"]') as HTMLElement | null) ??
            (document.querySelector(`[data-space-id="${spaceIdToCheck}"]`) as HTMLElement | null) ??
            (document.querySelector(`[data-navigation-item="${spaceIdToCheck}"]`) as HTMLElement | null);
          
          // Also check CardStack header (the visible header on the page)
          const cardStackHeader = document.querySelector(`.card-stack__header[data-space-id="${spaceIdToCheck}"]`) as HTMLElement | null;
          
          // Get title from CardStack header if available (most reliable source)
          const pageHeading = cardStackHeader?.querySelector('.page-heading p');
          const titleFromHeader = pageHeading?.textContent?.trim();
          
          // Get gradient from CardStack header style if available
          const gradientFromHeader = cardStackHeader?.style?.backgroundImage || cardStackHeader?.style?.backgroundColor;
          
          // Combine data from navigation elements and CardStack header
          const newTitle = titleFromHeader || navEl?.dataset?.spaceTitle || navEl?.dataset?.title;
          const newGradient = gradientFromHeader || navEl?.dataset?.spaceBackgroundGradient || navEl?.dataset?.backgroundGradient;
          
          if (newTitle || newGradient) {
            // Don't overwrite if we just updated from an event
            if (lastEventUpdateRef.current && 
                lastEventUpdateRef.current.spaceId === spaceIdToCheck &&
                Date.now() - lastEventUpdateRef.current.timestamp < 2000) {
              return;
            }
            
            setUpdatedCurrentSpace((prev) => {
              const titleChanged = newTitle && prev?.title !== newTitle;
              const colorChanged = newGradient && prev?.backgroundGradient !== newGradient;
              
              if (!titleChanged && !colorChanged) {
                return prev;
              }
              
              return {
                ...(prev || currentSpace),
                id: spaceIdToCheck,
                title: newTitle || prev?.title || currentSpace?.title || 'Space',
                totalItemCount: prev?.totalItemCount || currentSpace?.totalItemCount || 0,
                backgroundGradient: newGradient || prev?.backgroundGradient || currentSpace?.backgroundGradient || getThreadGradientCSS('paper')
              };
            });
          }
        } catch (error) {
          // Silently fail - will fall back to API refresh
          console.error('[MobileNavigation] Error reading space data from DOM:', error);
        }
      });
    };

    // Helper function to read active space from DOM
    const readActiveSpaceFromDom = () => {
      try {
        const path = window.location.pathname || '/';
        const itemId = extractIdFromPath(path) || (path.startsWith('/') ? path.slice(1) : path);

        // Space page: space data
        if (itemId.startsWith('space_')) {
          // Don't overwrite if we just updated from an event
          if (lastEventUpdateRef.current && 
              lastEventUpdateRef.current.spaceId === itemId &&
              Date.now() - lastEventUpdateRef.current.timestamp < 2000) {
            return;
          }
          
          // Try multiple selectors to find space data (desktop and mobile)
          const navEl =
            (document.querySelector('[data-navigation-active="true"]') as HTMLElement | null) ??
            (document.querySelector('[slot="navigation"]') as HTMLElement | null) ??
            (document.querySelector(`[data-space-id="${itemId}"]`) as HTMLElement | null) ??
            (document.querySelector(`[data-navigation-item="${itemId}"]`) as HTMLElement | null);
          
          const spaceId = navEl?.dataset?.spaceId ?? itemId;
          if (!spaceId || !spaceId.startsWith('space_')) {
            return;
          }
          
          const cardStackHeader = document.querySelector(`.card-stack__header[data-space-id="${spaceId}"]`) as HTMLElement | null;
          const pageHeading = cardStackHeader?.querySelector('.page-heading p');
          const titleFromHeader = pageHeading?.textContent?.trim();
          const gradientFromHeader = cardStackHeader?.style?.backgroundImage || cardStackHeader?.style?.backgroundColor;
          
          setUpdatedCurrentSpace({
            id: spaceId,
            title: titleFromHeader || navEl?.dataset?.spaceTitle || navEl?.dataset?.title || 'Space',
            totalItemCount: currentSpace?.totalItemCount || 0,
            backgroundGradient: gradientFromHeader || navEl?.dataset?.spaceBackgroundGradient || navEl?.dataset?.backgroundGradient || getThreadGradientCSS('paper')
          });
        }
      } catch {
        // Silently fail
      }
    };

    // Register event listener
    window.addEventListener('spaceUpdated', handleSpaceUpdated);

    // Cleanup
    return () => {
      window.removeEventListener('spaceUpdated', handleSpaceUpdated);
    };
  }, [currentSpace, selectedSpaceId]);

  // Listen for profile updates to update avatar
  useEffect(() => {
    const handleProfileUpdate = (event: CustomEvent) => {
      const { firstName, lastName, selectedColor } = event.detail;
      if (firstName && lastName && selectedColor) {
        const newInitials = `${firstName.charAt(0) || ''}${lastName.charAt(0) || ''}`.toUpperCase();
        setProfileData({
          initials: newInitials,
          userColor: selectedColor
        });
      }
    };

    window.addEventListener('updateProfile', handleProfileUpdate as EventListener);

    return () => {
      window.removeEventListener('updateProfile', handleProfileUpdate as EventListener);
    };
  }, []);
  
  // Keep for other logic that expects "active item id" semantics; routeActiveItemId is the single source of truth.
  const currentActiveItemId = routeActiveItemId;
  const activeThreadCandidate = updatedCurrentThread || currentThread || activeThreadFromDom;
  
  // Filter out items that shouldn't be shown in persistent navigation
  const getPersistentItems = () => {
    let persistentItems = navigationHistory.filter((item) => {
      // Show all items, including active ones, to match desktop behavior
      // This allows users to see active items and close them if needed
      
      // Don't show dashboard
      if (item.id === 'dashboard') {
        return false;
      }
      
      return true;
    });
    
    // Filter out unorganized thread if it's been closed
    persistentItems = persistentItems.filter((item) => {
      if (item.id === 'thread_unorganized') {
        const isClosed = localStorage.getItem('unorganized-thread-closed') === 'true';
        
        // If we're currently viewing a note that belongs to the unorganized thread,
        // clear the closed state and show it
        if (isClosed && currentActiveItemId === 'thread_unorganized') {
          localStorage.removeItem('unorganized-thread-closed');
          return true; // Show the unorganized thread
        }
        
        return !isClosed;
      }
      return true;
    });

    // CRITICAL: Final deduplication to prevent duplicate items from being rendered
    // This handles race conditions where an item might be added from multiple sources
    const seen = new Set<string>();
    persistentItems = persistentItems.filter((item) => {
      if (seen.has(item.id)) {
        return false;
      }
      seen.add(item.id);
      return true;
    });

    return persistentItems;
  };

  const persistentItems = getPersistentItems();

  // On note page: ensure the active parent thread is in the list (mirrors desktop PersistentNavigation).
  // When viewing a note in unorganized without having opened the thread view first, thread_unorganized
  // may never have been added to navigationHistory — inject it so "Unorganized" appears in the nav.
  const persistentItemsWithActiveParent = (() => {
    // Detect note page: currentItemId can be "note_xxx" (after extractIdFromPath) or pathname "/note/xxx" (SPA initialPath)
    const isOnNotePage = currentItemId.startsWith('note_') || pathnameProp.startsWith('/note/');
    if (!isOnNotePage) return persistentItems;
    // Resolve parent thread id: may already be currentActiveItemId, or resolve when currentItemId is still the path
    let activeParentThreadId = currentActiveItemId;
    if (!activeParentThreadId || !activeParentThreadId.startsWith('thread_')) {
      if (currentThread?.id && currentThread.id.startsWith('thread_')) activeParentThreadId = currentThread.id;
      else if (activeThreadFromDom?.id && activeThreadFromDom.id.startsWith('thread_')) activeParentThreadId = activeThreadFromDom.id;
      else if (typeof document !== 'undefined') {
        const noteEl = document.querySelector('[data-note-id]') as HTMLElement | null;
        const fromNote = noteEl?.dataset?.parentThreadId ?? null;
        if (fromNote && fromNote.startsWith('thread_')) activeParentThreadId = fromNote;
        else {
          const navEl = (document.querySelector('[data-navigation-active="true"]') as HTMLElement | null) ?? (document.querySelector('[slot="navigation"]') as HTMLElement | null);
          const fromNav = navEl?.dataset?.parentThreadId ?? null;
          if (fromNav && fromNav.startsWith('thread_')) activeParentThreadId = fromNav;
          else activeParentThreadId = 'thread_unorganized';
        }
      } else activeParentThreadId = 'thread_unorganized';
    }
    if (!activeParentThreadId || !activeParentThreadId.startsWith('thread_')) return persistentItems;
    if (persistentItems.some((i: any) => i.id === activeParentThreadId)) return persistentItems;

    // Build active parent thread object: from candidate or minimal for thread_unorganized
    let activeParentThread: { id: string; title: string; count: number; backgroundGradient: string; spaceId: string | null } | null = null;
    if (activeThreadCandidate?.id === activeParentThreadId) {
      activeParentThread = {
        id: activeThreadCandidate.id,
        title: activeThreadCandidate.title || 'Thread',
        count: activeThreadCandidate.noteCount ?? 0,
        backgroundGradient: activeThreadCandidate.backgroundGradient || getThreadGradientCSS('paper'),
        spaceId: activeThreadCandidate.spaceId ?? null,
      };
    } else if (activeParentThreadId === 'thread_unorganized') {
      const unorganizedFromNav = threads.find((t) => t.id === 'thread_unorganized');
      activeParentThread = {
        id: 'thread_unorganized',
        title: 'Unorganized',
        count: unorganizedFromNav?.noteCount ?? 0,
        backgroundGradient: unorganizedFromNav?.backgroundGradient || getThreadGradientCSS('paper'),
        spaceId: null,
      };
    } else {
      const fromNav = threads.find((t) => t.id === activeParentThreadId);
      if (fromNav) {
        activeParentThread = {
          id: fromNav.id,
          title: fromNav.title || 'Thread',
          count: fromNav.noteCount ?? 0,
          backgroundGradient: fromNav.backgroundGradient || getThreadGradientCSS('paper'),
          spaceId: fromNav.spaceId ?? null,
        };
      }
    }

    if (!activeParentThread) return persistentItems;

    // For thread_unorganized: only inject when not closed or when we're viewing it (clear closed when injecting)
    if (activeParentThreadId === 'thread_unorganized') {
      const isClosed = typeof localStorage !== 'undefined' && localStorage.getItem('unorganized-thread-closed') === 'true';
      if (isClosed && currentActiveItemId !== 'thread_unorganized') return persistentItems;
      if (isClosed && currentActiveItemId === 'thread_unorganized') {
        try {
          localStorage.removeItem('unorganized-thread-closed');
        } catch {
          /* ignore */
        }
      }
    }

    // Deduplication: don't add "Unorganized" with wrong id, or if "Unorganized" already exists by title
    const isUnorganizedTitleWithWrongId =
      activeParentThread.title === 'Unorganized' && activeParentThread.id !== 'thread_unorganized';
    const unorganizedAlreadyExists = persistentItems.some((i: any) => i.title === 'Unorganized');
    if (isUnorganizedTitleWithWrongId || (activeParentThread.title === 'Unorganized' && unorganizedAlreadyExists)) {
      return persistentItems;
    }

    return [activeParentThread, ...persistentItems];
  })();

  // Organize persistent items hierarchically (spaces with threads nested)
  const organizePersistentItems = (items: any[]) => {
    if (items.length === 0) return { spaces: [], threads: [] };

    const getOpenedInSpaceIds = (item: any): Array<string | null> => {
      if (Array.isArray(item?.openedInSpaceIds)) return item.openedInSpaceIds as Array<string | null>;
      return [item?.openedInSpaceId ?? item?.spaceId ?? null];
    };

    const scoped = items.filter((item: any) => {
      if (item.id === 'thread_unorganized') return true;
      const scopes = getOpenedInSpaceIds(item);
      if (!selectedSpaceId) return scopes.some((s) => s == null);
      return scopes.some((s) => s === selectedSpaceId);
    });

    const rawSpaces = scoped.filter((item: any) => item.id?.startsWith('space_'));
    const rawThreads = scoped.filter((item: any) => item.id?.startsWith('thread_'));

    const spaces = rawSpaces.map((item: any) => {
      return {
        id: item.id,
        title: item.title || 'Space',
        totalItemCount: typeof item.count === 'number' ? item.count : 0,
        backgroundGradient: item.backgroundGradient || getThreadGradientCSS('paper'),
      } satisfies Space;
    });

    const threads = rawThreads.map((item: any) => {
      return {
        id: item.id,
        title: item.title || 'Thread',
        noteCount: typeof item.count === 'number' ? item.count : 0,
        backgroundGradient: item.backgroundGradient || getThreadGradientCSS('paper'),
        spaceId: item.spaceId ?? undefined,
      } satisfies Thread;
    });

    return { spaces, threads };
  };

  const { threads: persistentThreads } = organizePersistentItems(persistentItemsWithActiveParent);

  // Show only threads from navigation history (same as desktop PersistentNavigation).
  // Filter out closedItemIds so closed threads disappear immediately.
  const displayThreads = useMemo(() => {
    return persistentThreads.filter((t) => !closedItemIds.has(t.id));
  }, [persistentThreads, closedItemIds]);

  const openSheet = () => {
    preloadSafeNavigate();
    setIsSheetOpen(true);
    // If there are no threads to show, auto-open the space picker panel.
    // This helps first-run / "only spaces exist" states.
    setIsSpacePanelOpen(displayThreads.length === 0);
  };

  const closeSheet = useCallback(() => {
    setIsSheetOpen(false);
    setIsSpacePanelOpen(false);
    // Exit close mode for all items when dropdown closes
    setItemsInCloseMode(new Set());
  }, []);

  // Pull-down-to-dismiss for the navigation bottom sheet
  const navDragRef = useBottomSheetDrag({ onDismiss: closeSheet, enabled: isSheetOpen });

  const handleItemClick = (itemId?: string) => {
    closeSheet();
    // If clicking on a specific item, exit its close mode
    if (itemId) {
      setItemsInCloseMode(prev => {
        const newSet = new Set(prev);
        newSet.delete(itemId);
        return newSet;
      });
    }
  };

  // Toggle close mode for an item (show close icon instead of badge)
  const toggleCloseMode = (itemId: string) => {
    setItemsInCloseMode(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  // Handle close icon click - remove item and exit close mode
  const handleCloseClick = (itemId: string, e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setClosedItemIds((prev) => {
      const next = new Set(prev);
      next.add(itemId);
      return next;
    });
    removeFromNavigationHistory(itemId);
    // Exit close mode after closing
    setItemsInCloseMode(prev => {
      const newSet = new Set(prev);
      newSet.delete(itemId);
      return newSet;
    });
  };

  // Get raw navigation history from storage (including spaces)
  // NavigationContext filters out spaces, so we need to read directly from storage
  const getRawNavigationHistory = (): any[] => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = safeGetItem('harvous-navigation-history-v2');
      const parsed = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error('Error getting raw navigation history:', error);
      return [];
    }
  };

  // Space IDs the user has closed from the switcher (match desktop so opened/available lists stay in sync)
  const getClosedSpaceIds = (): Set<string> => {
    if (typeof window === 'undefined') return new Set();
    try {
      const stored = safeGetItem('harvous-closed-navigation-items');
      const parsed = stored ? (JSON.parse(stored) as unknown) : [];
      const ids = Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
      return new Set(ids.filter((id) => id.startsWith('space_')));
    } catch {
      return new Set();
    }
  };

  // Force re-render when navigation history updates
  const [, forceUpdate] = useState(0);

  // Filter spaces to only show those in navigation history (match desktop: fromLocal + fromRaw, exclude deleted)
  const filteredSpaces = useMemo(() => {
    const rawHistory = getRawNavigationHistory();
    const rawSpaceItems = rawHistory.filter(
      (item: any) => item.id && item.id.startsWith('space_')
    );
    const navigationSpaceIds = new Set(rawSpaceItems.map((item: any) => item.id));

    const fromLocal = localSpaces.filter((space) => navigationSpaceIds.has(space.id));
    const localIds = new Set(fromLocal.map((s) => s.id));
    const fromRaw = rawSpaceItems
      .filter((item: any) => !localIds.has(item.id))
      .map((item: any) => ({
        id: item.id,
        title: item.title || 'Space',
        totalItemCount: typeof item.count === 'number' ? item.count : 0,
        backgroundGradient: item.backgroundGradient || 'var(--color-paper)',
        isShared: (item as any).isShared,
      } satisfies Space));

    const combined = [...fromLocal, ...fromRaw];
    const deleted = deletedSpaceIdsRef.current;
    return deleted.size === 0 ? combined : combined.filter((s) => !deleted.has(s.id));
  }, [localSpaces, forceUpdate]);

  // Listen for navigation history updates to trigger recalculation
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

  // Remove deleted space from dropdown and "Add Existing Space" when user erases a space
  useEffect(() => {
    const handleSpaceDeleted = (event: CustomEvent) => {
      const spaceId = event.detail?.spaceId;
      if (!spaceId) return;
      deletedSpaceIdsRef.current.add(spaceId);
      setLocalSpaces((prev) => prev.filter((s) => s.id !== spaceId));
      forceUpdate((prev) => prev + 1);
    };
    window.addEventListener('spaceDeleted', handleSpaceDeleted as EventListener);
    return () => window.removeEventListener('spaceDeleted', handleSpaceDeleted as EventListener);
  }, []);

  // Calculate spaces to show in dropdown - include current space even if not in history yet
  const spacesForDropdown = useMemo(() => {
    // Start with filtered spaces (from navigation history)
    const spacesById = new Map<string, Space>();
    
    // Add all filtered spaces
    for (const space of filteredSpaces) {
      spacesById.set(space.id, space);
    }
    
    // Ensure current space is included (if we're on a space page)
    // This handles timing issues where trackNavigationAccess() hasn't run yet
    if (currentSpace && currentSpace.id.startsWith('space_')) {
      if (!spacesById.has(currentSpace.id)) {
        spacesById.set(currentSpace.id, currentSpace);
      }
    }

    // Ensure the currently selected space is in the dropdown (so label can resolve on find/profile etc.)
    // Only do this when NOT on the dashboard — on dashboard, displaySelectedSpaceId is null ("My Home").
    const pinSelectedSpace = !isDashboard;
    if (pinSelectedSpace && effectiveSelectedSpaceId && !spacesById.has(effectiveSelectedSpaceId)) {
      const fromLocal = localSpaces.find((s) => s.id === effectiveSelectedSpaceId);
      if (fromLocal) spacesById.set(effectiveSelectedSpaceId, fromLocal);
    }

    // Exclude spaces the user has closed from the switcher (match desktop)
    const closedSpaceIds = getClosedSpaceIds();
    return Array.from(spacesById.values()).filter((s) => !closedSpaceIds.has(s.id));
  }, [filteredSpaces, currentSpace, effectiveSelectedSpaceId, localSpaces, isDashboard]);

  // Calculate available spaces that aren't in the dropdown (exclude deleted, match desktop)
  const availableSpaces = useMemo(() => {
    const dropdownSpaceIds = new Set(spacesForDropdown.map((s) => s.id));
    const deleted = deletedSpaceIdsRef.current;
    return localSpaces
      .filter((space) => !dropdownSpaceIds.has(space.id) && !deleted.has(space.id))
      .sort((a, b) => {
        const titleA = (a.title || '').toLowerCase();
        const titleB = (b.title || '').toLowerCase();
        return titleA.localeCompare(titleB);
      });
  }, [localSpaces, spacesForDropdown]);

  // Add space to opened list and remove from closed when user selects from "Add Existing Space" (match desktop)
  const addSpaceToNavigationHistory = useCallback((space: Space) => {
    if (typeof window === 'undefined') return;
    try {
      try {
        const closedStored = safeGetItem('harvous-closed-navigation-items');
        const closedParsed = closedStored ? (JSON.parse(closedStored) as unknown) : [];
        const closedIds = Array.isArray(closedParsed) ? closedParsed.filter((x) => typeof x === 'string') : [];
        const filtered = closedIds.filter((id) => id !== space.id);
        if (filtered.length !== closedIds.length) {
          safeSetItem('harvous-closed-navigation-items', JSON.stringify(filtered), {
            cleanupOldest: true,
            fallbackToSession: true,
          });
        }
      } catch {
        /* ignore */
      }
      const stored = safeGetItem('harvous-navigation-history-v2');
      const history = stored ? JSON.parse(stored) : [];
      const existingIndex = history.findIndex((item: any) => item.id === space.id);
      if (existingIndex !== -1) {
        history[existingIndex] = {
          ...history[existingIndex],
          title: space.title,
          backgroundGradient: space.backgroundGradient,
          lastAccessed: Date.now(),
        };
      } else {
        history.push({
          id: space.id,
          title: space.title,
          backgroundGradient: space.backgroundGradient,
          firstAccessed: Date.now(),
          lastAccessed: Date.now(),
        });
      }
      history.sort((a: any, b: any) => {
        const aFirst = (a.firstAccessed != null) ? a.firstAccessed : Number.MAX_SAFE_INTEGER;
        const bFirst = (b.firstAccessed != null) ? b.firstAccessed : Number.MAX_SAFE_INTEGER;
        return aFirst - bFirst;
      });
      const limited = history.length > 10 ? history.slice(0, 10) : history;
      safeSetItem('harvous-navigation-history-v2', JSON.stringify(limited), {
        cleanupOldest: true,
        fallbackToSession: true,
      });
      window.dispatchEvent(new CustomEvent('navigationHistoryUpdated'));
      forceUpdate((p) => p + 1);
    } catch (err) {
      console.error('Error adding space to navigation history:', err);
    }
  }, []);

  const isThreadPage = currentItemId.startsWith('thread_');
  const threadSpaceId = (updatedCurrentThread || currentThread)?.spaceId || null;
  const mismatchThreadId = (updatedCurrentThread || currentThread)?.id ?? null;
  // Prefer URL ?space= for add-to-space prompt so it shows when viewing thread in a space via URL.
  const spaceForMismatch =
    (typeof window !== 'undefined' &&
      (() => {
        try {
          const s = new URLSearchParams(window.location.search).get('space');
          return s && s.startsWith('space_') ? s : null;
        } catch {
          return null;
        }
      })()) ??
    effectiveSelectedSpaceId;
  const mismatchKey = mismatchThreadId && spaceForMismatch ? `${mismatchThreadId}|${spaceForMismatch}` : null;
  const baseSpaceMismatchPrompt =
    !!spaceForMismatch && isThreadPage && !!(updatedCurrentThread || currentThread)?.id && threadSpaceId !== spaceForMismatch;
  const showSpaceMismatchPrompt = baseSpaceMismatchPrompt && mismatchKey !== dismissedMismatchKey;

  const selectedSpaceTitleForMismatch =
    spaceForMismatch ? spacesForDropdown.find((s) => s.id === spaceForMismatch)?.title ?? 'this space' : 'My Home';
  const threadSpaceTitleForMismatch = threadSpaceId
    ? spacesForDropdown.find((s) => s.id === threadSpaceId)?.title ?? 'its current space'
    : 'My Home';

  useEffect(() => {
    if (!baseSpaceMismatchPrompt) setDismissedMismatchKey(null);
  }, [baseSpaceMismatchPrompt]);

  const moveThreadToSelectedSpace = async () => {
    const thread = updatedCurrentThread || currentThread;
    if (!spaceForMismatch || !thread?.id) return;
    if (thread.id === 'thread_unorganized') return;
    try {
      const response = await fetch(`/api/spaces/${spaceForMismatch}/add-thread`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: thread.id }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const message = data?.error || 'Failed to add thread to space. Please try again.';
        if ((window as any).toast?.error) (window as any).toast.error(message);
        return;
      }
      setUpdatedCurrentThread((prev) => (prev ? { ...prev, spaceId: spaceForMismatch } : prev));
      window.dispatchEvent(new CustomEvent('threadUpdated', { detail: { threadId: thread.id } }));
      if ((window as any).toast?.success) (window as any).toast.success(`Added to ${selectedSpaceTitleForMismatch}`);
      closeSheet();
    } catch {
      if ((window as any).toast?.error) (window as any).toast.error('Failed to add thread to space. Please try again.');
    }
  };

  const switchSelectedSpaceToThreadSpace = () => {
    setSelectedSpaceId(threadSpaceId);
    closeSheet();
  };

  const dismissSpaceMismatchPrompt = () => {
    if (!mismatchKey) return;
    setDismissedMismatchKey(mismatchKey);
  };

  const selectedSpace = useMemo(() => {
    if (!selectedSpaceId) {
      return null;
    }

    // PRIORITY 1: Use updatedCurrentSpace if it matches selectedSpaceId (most up-to-date)
    // This ensures we get the latest updates even if filteredSpaces hasn't updated yet
    if (updatedCurrentSpace && updatedCurrentSpace.id === selectedSpaceId) {
      return updatedCurrentSpace;
    }

    // PRIORITY 2: Try to find in filtered spaces (navigation history)
    const fromFiltered = filteredSpaces.find((s) => s.id === selectedSpaceId);
    if (fromFiltered) {
      return fromFiltered;
    }

    // PRIORITY 3: Fallback to currentSpace if we're on a space page
    // This ensures the label shows correctly even if not in navigation history
    if (currentSpace && currentSpace.id === selectedSpaceId) {
      return currentSpace;
    }

    // PRIORITY 4: Final fallback: look in the full spaces array
    return localSpaces.find((s) => s.id === selectedSpaceId) ?? null;
  }, [selectedSpaceId, filteredSpaces, currentSpace, localSpaces, updatedCurrentSpace]);

  // Display space: lookup by effectiveSelectedSpaceId (route / thread-note context / storage) so resize from desktop shows correct space
  const displaySelectedSpace = useMemo(() => {
    if (!effectiveSelectedSpaceId) {
      return null;
    }
    if (updatedCurrentSpace && updatedCurrentSpace.id === effectiveSelectedSpaceId) {
      return updatedCurrentSpace;
    }
    const fromFiltered = filteredSpaces.find((s) => s.id === effectiveSelectedSpaceId);
    if (fromFiltered) return fromFiltered;
    if (currentSpace && currentSpace.id === effectiveSelectedSpaceId) return currentSpace;
    return localSpaces.find((s) => s.id === effectiveSelectedSpaceId) ?? null;
  }, [effectiveSelectedSpaceId, filteredSpaces, currentSpace, localSpaces, updatedCurrentSpace]);

  // Fallback to spacesForDropdown so we show the actual space name (e.g. "MySpace") when selectedSpace is null (e.g. search page).
  const selectedSpaceLabel = selectedSpace ? selectedSpace.title : (selectedSpaceId ? (spacesForDropdown.find((s) => s.id === selectedSpaceId)?.title ?? 'Space') : 'My Home');
  const selectedSpaceCount = selectedSpace ? selectedSpace.totalItemCount : inboxCount;
  const selectedSpaceBackground = selectedSpace?.backgroundGradient || getThreadGradientCSS('paper');
  
  // Route-aware display: use effectiveSelectedSpaceId so after resize from desktop we show the space we're actually in
  const displaySelectedSpaceLabel = isDashboard ? 'My Home' : (displaySelectedSpace ? displaySelectedSpace.title : (effectiveSelectedSpaceId ? (spacesForDropdown.find((s) => s.id === effectiveSelectedSpaceId)?.title ?? 'Space') : 'My Home'));
  const displaySelectedSpaceCount = isDashboard ? inboxCount : (displaySelectedSpace ? displaySelectedSpace.totalItemCount : inboxCount);
  const displaySelectedSpaceBackground = isDashboard ? getThreadGradientCSS('paper') : (displaySelectedSpace?.backgroundGradient || getThreadGradientCSS('paper'));
  const displaySelectedSpaceId = isDashboard ? null : effectiveSelectedSpaceId;

  const spaceButtonKey = `space-button-${effectiveSelectedSpaceId}-${displaySelectedSpaceLabel}-${displaySelectedSpaceBackground}`;

  const topSpaceIsActive = displaySelectedSpaceId ? currentItemId === displaySelectedSpaceId : isDashboard;

  // SPA note: html/body/#root already have overflow:hidden so there's nothing to scroll-lock.
  // The old position:fixed approach (Astro SSR era) caused touch coordinate displacement on mobile —
  // the visual position and hit targets diverged after the sheet opened. Removed entirely.

  return (
    <div className="mobile-nav">
      {/* Search Icon Button (Column 1: auto) */}
      <div className="mobile-nav__col">
        <div className="nav-link" style={{ cursor: 'pointer' }} onClick={() => navigate('/search')}>
          <button className="mobile-nav__search-btn" style={{ touchAction: 'manipulation' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
              <svg viewBox="0 0 512 512">
                <path d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z"/>
              </svg>
            </div>
          </button>
        </div>
      </div>

      {/* Spaces Dropdown (Column 2: 1fr) */}
      <div className="mobile-nav__dropdown-wrapper">
        <div className="space-switcher-anchor space-switcher-anchor--mobile">
          {/* Main button - navigates to thread when on note, else to space/home (no need to open sheet) */}
          <div
            className="nav-link"
            style={{ display: 'block', width: '100%', cursor: 'pointer' }}
            onClick={() => {
              const href = isNote && currentThread ? idToUrl(currentThread.id) : (effectiveSelectedSpaceId ? idToUrl(effectiveSelectedSpaceId) : '/');
              navigate(href);
            }}
          >
            <SpaceButton
              as="div"
              text={activeThreadCandidate ? activeThreadCandidate.title : displaySelectedSpaceLabel}
              count={activeThreadCandidate ? (updatedCurrentThread ?? currentThread)?.noteCount ?? 0 : displaySelectedSpaceCount}
              state="DropdownTrigger"
              rightAccessory="none"
              backgroundGradient={activeThreadCandidate?.backgroundGradient ?? displaySelectedSpaceBackground}
              hideDropdownIcon={true}
            />
          </div>
          {/* Toggle button - always opens bottom sheet */}
          <button
            type="button"
            className="space-btn__badge-wrapper space-switcher-anchor__toggle"
            aria-label="Switch space"
            style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
            onTouchEnd={(e) => {
              e.preventDefault();
              e.stopPropagation();
              openSheet();
            }}
            onClick={(e) => {
              e.stopPropagation();
              openSheet();
            }}
          >
            <span className="space-btn__toggle-icon" aria-hidden="true">
              <Icon name="sort" size={20} />
            </span>
          </button>
        </div>
        
        <Sheet
          open={isSheetOpen}
          onOpenChange={(open) => {
            if (!open) closeSheet();
          }}
        >
          <SheetContent
            ref={navDragRef}
            side="bottom"
            className="mobile-nav__sheet"
            style={{
              background: 'white',
              padding: 0,
              border: 'none',
              borderTop: 'none',
            }}
            onPointerDownOutside={(e) => e.preventDefault()}
            onInteractOutside={(e) => e.preventDefault()}
            onOverlayClick={closeSheet}
            onOpenAutoFocus={(e) => {
              // Radix will aria-hide the background; ensure focus moves into the sheet to avoid warnings.
              e.preventDefault();
              requestAnimationFrame(() => sheetFocusRef.current?.focus());
            }}
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            {/* Accessibility: Required SheetTitle and SheetDescription for screen readers */}
            <SheetHeader>
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <SheetDescription className="sr-only">Switch spaces and threads</SheetDescription>
            </SheetHeader>

            {/* Focus anchor: keeps focus out of aria-hidden background */}
            <button ref={sheetFocusRef} type="button" className="sr-only">
              Navigation
            </button>

            <div className="mobile-nav__sheet-inner" onClick={(e) => e.stopPropagation()}>
              {/* Pinned Header: Selected Space */}
              <div className="mobile-nav__dropdown-header">
                <div className="mobile-nav__dropdown-header-row">
                  <div className="space-switcher-anchor space-switcher-anchor--mobile">
                    {/* Main button - always navigates to space/home (matches desktop); sort icon opens switch panel */}
                    <div
                      className="nav-link"
                      style={{ display: 'block', width: '100%', cursor: 'pointer' }}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest?.('.space-switcher-anchor__toggle')) {
                          e.preventDefault();
                          e.stopPropagation();
                          setIsSpacePanelOpen((v) => !v);
                          return;
                        }
                        navigate(displaySelectedSpaceId ? idToUrl(displaySelectedSpaceId) : '/');
                        closeSheet();
                      }}
                    >
                      <SpaceButton
                        key={spaceButtonKey}
                        as="div"
                        text={displaySelectedSpaceLabel}
                        count={displaySelectedSpaceCount}
                        state="WithCount"
                        rightAccessory="none"
                        backgroundGradient={displaySelectedSpaceBackground}
                        isActive={topSpaceIsActive}
                        hideDropdownIcon={true}
                      />
                    </div>
                    {/* Toggle button - opens/closes space picker panel */}
                    <button
                      type="button"
                      className="space-btn__badge-wrapper space-switcher-anchor__toggle"
                      aria-label="Switch space"
                      style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                      onTouchEnd={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsSpacePanelOpen((v) => !v);
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsSpacePanelOpen((v) => !v);
                      }}
                    >
                      <span className="space-btn__toggle-icon" aria-hidden="true">
                        <Icon name="sort" size={20} />
                      </span>
                    </button>
                  </div>
                </div>

                {isSpacePanelOpen && (
                  <div className="mobile-nav__space-panel" role="dialog" aria-label="Switch space">
                    <div className="mobile-nav__space-panel-scroll">
                    <div
                      className={`mobile-nav__space-panel-item ${!displaySelectedSpaceId ? 'is-active' : ''}`}
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        navigate('/');
                        setSelectedSpaceId(null);
                        closeSheet();
                      }}
                    >
                      <span className="mobile-nav__space-panel-label">My Home</span>
                      <span className="mobile-nav__space-panel-actions">
                        {!displaySelectedSpaceId ? (
                          <span className="mobile-nav__space-panel-check" aria-hidden="true">
                            <Icon name="check" size={20} style={{ color: 'var(--color-deep-grey)' }} />
                          </span>
                        ) : null}
                      </span>
                    </div>
                    {spacesForDropdown.map((s) => {
                      const isActive = !!displaySelectedSpaceId && s.id === displaySelectedSpaceId;
                      return (
                        <div
                          key={s.id}
                          className={`mobile-nav__space-panel-item ${isActive ? 'is-active' : ''}`}
                          style={{ cursor: 'pointer' }}
                          onClick={() => {
                            navigate(idToUrl(s.id));
                            setSelectedSpaceId(s.id);
                            closeSheet();
                          }}
                        >
                          <span className="mobile-nav__space-panel-icon-prefix" aria-hidden="true">
                            <Icon name={s.isShared ? 'user-group' : 'user'} size={14} style={{ color: 'var(--color-deep-grey)' }} />
                          </span>
                          <span className="mobile-nav__space-panel-label">{s.title}</span>
                          <span className="mobile-nav__space-panel-actions">
                            {isActive ? (
                              <span className="mobile-nav__space-panel-check" aria-hidden="true">
                                <Icon name="check" size={20} style={{ color: 'var(--color-deep-grey)' }} />
                              </span>
                            ) : null}
                            {/* Relative wrapper so the touch-target overlay can expand beyond the 24×24 icon */}
                            <div style={{ position: 'relative', width: 24, height: 24, flexShrink: 0 }}>
                              <span
                                className="mobile-nav__space-panel-check"
                                aria-hidden="true"
                                style={{ pointerEvents: 'none' }}
                              >
                                <Icon name="xmark" size={20} style={{ color: 'var(--color-deep-grey)' }} />
                              </span>
                              {/* Transparent overlay: catches the tap before anything else.
                                  inset: 0 = flush with the 24×24 parent — no overflow into the row.
                                  onPointerDown fires immediately on touch (no 300ms delay).
                                  We do NOT call closeSheet() here — space disappears from list
                                  and the sheet stays open so the user can see the result. */}
                              <div
                                role="button"
                                aria-label={`Close ${s.title}`}
                                style={{
                                  position: 'absolute',
                                  inset: 0,
                                  cursor: 'pointer',
                                  touchAction: 'manipulation',
                                  WebkitTapHighlightColor: 'transparent',
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  setLocalSpaces((prev) => prev.filter((s2) => s2.id !== s.id));
                                  removeFromNavigationHistory(s.id);
                                  if (effectiveSelectedSpaceId === s.id) {
                                    setSelectedSpaceId(null);
                                  }
                                  // Sheet stays open — user sees the space vanish from the list.
                                }}
                              />
                            </div>
                          </span>
                        </div>
                      );
                    })}
                    {availableSpaces.length > 0 && (
                      <>
                        <div className="mobile-nav__space-panel-divider" />
                        <button
                          type="button"
                          className="mobile-nav__space-panel-item"
                          onClick={() => setIsShowingExistingSpaces(!isShowingExistingSpaces)}
                        >
                          <span className="mobile-nav__space-panel-label">Add Existing Space</span>
                          <span className="mobile-nav__space-panel-check" aria-hidden="true">
                            <Icon name={isShowingExistingSpaces ? "chevron-up" : "chevron-down"} size={20} style={{ color: 'var(--color-deep-grey)' }} />
                          </span>
                        </button>
                        {isShowingExistingSpaces && availableSpaces.map((s) => {
                          return (
                            <div
                              key={s.id}
                              className="mobile-nav__space-panel-item"
                              style={{ cursor: 'pointer' }}
                              onClick={() => {
                                addSpaceToNavigationHistory(s);
                                navigate(idToUrl(s.id));
                                setSelectedSpaceId(s.id);
                                setIsShowingExistingSpaces(false);
                                closeSheet();
                              }}
                            >
                              <span className="mobile-nav__space-panel-icon-prefix" aria-hidden="true">
                                <Icon name={s.isShared ? 'user-group' : 'user'} size={14} style={{ color: 'var(--color-deep-grey)' }} />
                              </span>
                              <span className="mobile-nav__space-panel-label">{s.title}</span>
                            </div>
                          );
                        })}
                      </>
                    )}
                    </div>
                    <div className="mobile-nav__space-panel-divider" />
                    <div
                      className="mobile-nav__space-panel-item mobile-nav__space-panel-new-space"
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        navigate('/new-space');
                        closeSheet();
                      }}
                    >
                      <span className="mobile-nav__space-panel-label">New Space</span>
                      <span className="mobile-nav__space-panel-check" aria-hidden="true">
                        <Icon name="plus" size={20} style={{ color: 'var(--color-deep-grey)' }} />
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Scrollable Nav Items — tapping here while space panel is open closes the space panel */}
              <div
                className="mobile-nav__dropdown-scroll"
                onClick={() => {
                  if (isSpacePanelOpen) setIsSpacePanelOpen(false);
                }}
              >
                {showSpaceMismatchPrompt ? (
                  <div className="space-mismatch-banner" style={{ margin: '8px 12px 12px' }}>
                    <div className="space-mismatch-banner__text">
                      <p className="space-mismatch-banner__copy">
                        Would you like to add this thread to {selectedSpaceTitleForMismatch}?
                      </p>
                    </div>
                    <div className="space-mismatch-banner__actions">
                      <ButtonSmall state="Default" onClick={moveThreadToSelectedSpace}>
                        Add to {selectedSpaceTitleForMismatch}
                      </ButtonSmall>
                      <ButtonSmall state="Secondary" onClick={dismissSpaceMismatchPrompt}>
                        Not Now
                      </ButtonSmall>
                    </div>
                  </div>
                ) : null}
                {displayThreads.length > 0 ? (
                  <>
                    {displayThreads.map((thread) => {
                      const isActive = currentActiveItemId.startsWith('thread_') && thread.id === currentActiveItemId;
                      // Use updated thread data for active thread to show live updates
                      const displayThread = isActive && activeThreadCandidate ? activeThreadCandidate : thread;
                      // Use current URL ?space= when present so nav clicks open in the space the user is viewing.
                      let spaceForLink = effectiveSelectedSpaceId;
                      if (typeof window !== 'undefined') {
                        try {
                          const fromUrl = new URLSearchParams(window.location.search).get('space');
                          if (fromUrl && fromUrl.startsWith('space_')) spaceForLink = fromUrl;
                        } catch {
                          // ignore
                        }
                      }
                      const threadHref =
                        typeof spaceForLink === 'string' && spaceForLink.startsWith('space_')
                          ? `${idToUrl(thread.id)}?space=${encodeURIComponent(spaceForLink)}`
                          : idToUrl(thread.id);
                      return (
                        <div key={thread.id} className="nav-item-container group w-full">
                          <div
                            className="block w-full"
                            style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent', cursor: 'pointer' }}
                            onClick={() => {
                              const isActiveItem = thread.id === currentActiveItemId;
                              const isOnNotePage = currentItemId.startsWith('note_');
                              if (!isActiveItem || isOnNotePage) {
                                navigate(threadHref);
                              }
                              handleItemClick(thread.id);
                            }}
                          >
                            <div
                              className="space-btn pl-4"
                              style={
                                isActive
                                  ? {
                                      backgroundImage: displayThread.backgroundGradient?.includes('gradient')
                                        ? displayThread.backgroundGradient
                                        : undefined,
                                      backgroundColor: displayThread.backgroundGradient?.includes('gradient')
                                        ? undefined
                                        : (displayThread.backgroundGradient || undefined),
                                    }
                                  : {}
                              }
                            >
                              <div className="space-btn__content">
                                <div className="space-btn__text-wrapper">
                                  <span className="space-btn__text" style={{ color: getTextColor(displayThread.backgroundGradient, isActive) }}>
                                    {displayThread.title}
                                  </span>
                                </div>
                                {/* Relative wrapper: the badge wrapper's padding:20px provides visual spacing;
                                    the inner relative div keeps the badge at 24×24 with an overlay on top. */}
                                <div className="space-btn__badge-wrapper" style={{ position: 'relative' }}>
                                  {/* Visual badge — pointer-events:none so the overlay above catches all taps */}
                                  <div
                                    className="badge-count"
                                    style={{ pointerEvents: 'none' }}
                                  >
                                    {itemsInCloseMode.has(thread.id) ? (
                                      <Icon name="xmark" size={14} style={{ color: getTextColor(displayThread.backgroundGradient, isActive) }} />
                                    ) : (
                                      <span className="badge-number" style={{ color: getTextColor(displayThread.backgroundGradient, isActive) }}>
                                        {formatBadgeCount(displayThread.noteCount)}
                                      </span>
                                    )}
                                  </div>
                                  {/* Transparent overlay: sits on top of the visual badge and its 20px wrapper padding.
                                      inset:0 fills the entire wrapper (including padding) = ~64×64 touch target.
                                      onPointerDown fires immediately — no 300ms delay, no passive-listener issues. */}
                                  <div
                                    role="button"
                                    aria-label={itemsInCloseMode.has(thread.id) ? `Remove ${displayThread.title}` : `Close options for ${displayThread.title}`}
                                    data-close-item={thread.id}
                                    style={{
                                      position: 'absolute',
                                      inset: 0,
                                      cursor: 'pointer',
                                      touchAction: 'manipulation',
                                      WebkitTapHighlightColor: 'transparent',
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      e.preventDefault();
                                      if (itemsInCloseMode.has(thread.id)) {
                                        // removeFromNavigationHistory navigates away when the removed
                                        // thread is the currently-active one. Close the sheet first
                                        // so that navigation happens cleanly. For non-active threads
                                        // the thread just disappears and the sheet stays open.
                                        const isCurrentlyActive = thread.id === currentActiveItemId;
                                        handleCloseClick(thread.id, e as any);
                                        if (isCurrentlyActive) {
                                          closeSheet();
                                        }
                                      } else {
                                        toggleCloseMode(thread.id);
                                      }
                                    }}
                                  />
                                </div>
                              </div>
                              {isActive && <div className="space-btn__shadow" />}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </>
                ) : null}
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Avatar (Column 3: auto) */}
      <div className="mobile-nav__col">
        <div style={{ cursor: 'pointer' }} onClick={() => navigate('/profile')}>
          <Avatar initials={profileData.initials} color={profileData.userColor} />
        </div>
      </div>

    </div>
  );
};

export default MobileNavigation;
