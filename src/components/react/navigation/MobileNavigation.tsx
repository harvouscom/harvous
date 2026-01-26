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
import { safeGetItem } from '@/utils/safe-storage';

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
  /** Server-provided path (e.g. 'note_xxx') to ensure SSR/client match */
  initialPath?: string;
}

const MobileNavigation: React.FC<MobileNavigationProps> = ({
  spaces = [],
  threads = [],
  inboxCount = 0,
  currentSpace = null,
  currentThread = null,
  initials = 'U',
  userColor = 'paper',
  initialPath = ''
}) => {
  const selectedSpaceId = useSelectedSpaceId();
  const [dismissedMismatchKey, setDismissedMismatchKey] = useState<string | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isSpacePanelOpen, setIsSpacePanelOpen] = useState(false);
  const [isShowingExistingSpaces, setIsShowingExistingSpaces] = useState(false);
  const sheetFocusRef = useRef<HTMLButtonElement | null>(null);
  // Use initialPath from server to ensure SSR and client initial render match
  const [currentItemId, setCurrentItemId] = useState(initialPath);
  const { navigationHistory, removeFromNavigationHistory } = useNavigation();
  const [updatedCurrentThread, setUpdatedCurrentThread] = useState(currentThread);
  const [activeThreadFromDom, setActiveThreadFromDom] = useState<Thread | null>(null);
  // Track which items are in "close mode" (showing close icon instead of badge)
  const [itemsInCloseMode, setItemsInCloseMode] = useState<Set<string>>(new Set());
  // Profile data state for avatar updates
  const [profileData, setProfileData] = useState({
    initials: initials,
    userColor: userColor,
  });

  // Sync updatedCurrentThread when currentThread prop changes
  useEffect(() => {
    setUpdatedCurrentThread(currentThread);
  }, [currentThread]);

  // Best-effort fallback: derive the active thread from DOM (for timing / View Transition cases)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const readActiveThreadFromDom = () => {
      try {
        const path = window.location.pathname || '/';
        const itemId = path.startsWith('/') ? path.slice(1) : path;

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
    };

    readActiveThreadFromDom();
    document.addEventListener('astro:page-load', readActiveThreadFromDom);
    document.addEventListener('astro:after-swap', readActiveThreadFromDom);
    return () => {
      document.removeEventListener('astro:page-load', readActiveThreadFromDom);
      document.removeEventListener('astro:after-swap', readActiveThreadFromDom);
    };
  }, []);

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
    setCurrentItemId(window.location.pathname.substring(1));
  }, []);

  // Listen for page changes to update current item
  useEffect(() => {
    const handlePageLoad = () => {
      // Update current item ID when page changes
      const newPath = window.location.pathname.substring(1);
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

    document.addEventListener('astro:page-load', handlePageLoad);
    document.addEventListener('astro:after-swap', handlePageLoad);
    
    return () => {
      document.removeEventListener('astro:page-load', handlePageLoad);
      document.removeEventListener('astro:after-swap', handlePageLoad);
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
      if (path.startsWith('/space_')) {
        setSelectedSpaceId(path.substring(1));
      }
    };

    syncFromLocation();
    document.addEventListener('astro:page-load', syncFromLocation);
    document.addEventListener('astro:after-swap', syncFromLocation);
    return () => {
      document.removeEventListener('astro:page-load', syncFromLocation);
      document.removeEventListener('astro:after-swap', syncFromLocation);
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
      const itemId = path.startsWith('/') ? path.slice(1) : path;
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
  }, [currentThread]);

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

  // Organize persistent items hierarchically (spaces with threads nested)
  const organizePersistentItems = () => {
    if (persistentItems.length === 0) return { spaces: [], threads: [] };

    const getOpenedInSpaceIds = (item: any): Array<string | null> => {
      if (Array.isArray(item?.openedInSpaceIds)) return item.openedInSpaceIds as Array<string | null>;
      return [item?.openedInSpaceId ?? item?.spaceId ?? null];
    };

    const scoped = persistentItems.filter((item: any) => {
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

  const { threads: persistentThreads } = organizePersistentItems();

  const openSheet = () => {
    setIsSheetOpen(true);
    // If there are no threads to show, auto-open the space picker panel.
    // This helps first-run / “only spaces exist” states.
    setIsSpacePanelOpen(persistentThreads.length === 0);
  };

  const closeSheet = useCallback(() => {
    setIsSheetOpen(false);
    setIsSpacePanelOpen(false);
    // Exit close mode for all items when dropdown closes
    setItemsInCloseMode(new Set());
  }, []);

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

  const handleItemClickWrapper = (e: React.MouseEvent<HTMLAnchorElement>, itemId?: string) => {
    // Check if we're currently on a note page
    const isOnNotePage = currentItemId.startsWith('note_');
    
    // Check if the clicked item is the currently active item
    const isActiveItem = itemId === undefined || itemId === ''
      ? isDashboard // "My Home" is active
      : itemId === currentActiveItemId; // Other items match active id
    
    // If it's the active item AND we're not on a note page, prevent navigation and just close the dropdown
    // (If we're on a note page, allow navigation to the parent thread/space)
    if (isActiveItem && !isOnNotePage) {
      e.preventDefault();
    }
    
    handleItemClick(itemId);
    // If not active, or if on note page, let the link navigate naturally via href
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

  // Force re-render when navigation history updates
  const [, forceUpdate] = useState(0);

  // Filter spaces to only show those in navigation history (spaces that have been opened/visited)
  // Use raw navigation history from storage since NavigationContext filters out spaces
  const filteredSpaces = useMemo(() => {
    const rawHistory = getRawNavigationHistory();
    // Get space IDs from raw navigation history (includes spaces that NavigationContext filters out)
    const navigationSpaceIds = new Set(
      rawHistory
        .filter((item: any) => item.id && item.id.startsWith('space_'))
        .map((item: any) => item.id)
    );
    
    // Only show spaces that are in navigation history
    return spaces.filter(space => navigationSpaceIds.has(space.id));
  }, [spaces, forceUpdate]);

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
    
    // Convert back to array
    return Array.from(spacesById.values());
  }, [filteredSpaces, currentSpace]);

  // Calculate available spaces that aren't in the dropdown
  const availableSpaces = useMemo(() => {
    const dropdownSpaceIds = new Set(spacesForDropdown.map(s => s.id));
    return spaces
      .filter(space => !dropdownSpaceIds.has(space.id))
      .sort((a, b) => {
        const titleA = (a.title || "").toLowerCase();
        const titleB = (b.title || "").toLowerCase();
        return titleA.localeCompare(titleB);
      });
  }, [spaces, spacesForDropdown]);

  const isThreadPage = currentItemId.startsWith('thread_');
  const threadSpaceId = (updatedCurrentThread || currentThread)?.spaceId || null;
  const mismatchThreadId = (updatedCurrentThread || currentThread)?.id ?? null;
  const mismatchKey = mismatchThreadId && selectedSpaceId ? `${mismatchThreadId}|${selectedSpaceId}` : null;
  const baseSpaceMismatchPrompt =
    !!selectedSpaceId && isThreadPage && !!(updatedCurrentThread || currentThread)?.id && threadSpaceId !== selectedSpaceId;
  const showSpaceMismatchPrompt = baseSpaceMismatchPrompt && mismatchKey !== dismissedMismatchKey;

  const selectedSpaceTitleForMismatch =
    selectedSpaceId ? spacesForDropdown.find((s) => s.id === selectedSpaceId)?.title ?? 'this space' : 'My Home';
  const threadSpaceTitleForMismatch = threadSpaceId
    ? spacesForDropdown.find((s) => s.id === threadSpaceId)?.title ?? 'its current space'
    : 'My Home';

  useEffect(() => {
    if (!baseSpaceMismatchPrompt) setDismissedMismatchKey(null);
  }, [baseSpaceMismatchPrompt]);

  const moveThreadToSelectedSpace = async () => {
    const thread = updatedCurrentThread || currentThread;
    if (!selectedSpaceId || !thread?.id) return;
    if (thread.id === 'thread_unorganized') return;
    try {
      const response = await fetch(`/api/spaces/${selectedSpaceId}/add-thread`, {
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
      setUpdatedCurrentThread((prev) => (prev ? { ...prev, spaceId: selectedSpaceId } : prev));
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
    if (!selectedSpaceId) return null;
    
    // First try to find in filtered spaces (navigation history)
    const fromFiltered = filteredSpaces.find((s) => s.id === selectedSpaceId);
    if (fromFiltered) return fromFiltered;
    
    // Fallback: use currentSpace if we're on a space page
    // This ensures the label shows correctly even if not in navigation history
    if (currentSpace && currentSpace.id === selectedSpaceId) {
      return currentSpace;
    }
    
    // Final fallback: look in the full spaces array
    return spaces.find((s) => s.id === selectedSpaceId) ?? null;
  }, [selectedSpaceId, filteredSpaces, currentSpace, spaces]);

  const selectedSpaceLabel = selectedSpace ? selectedSpace.title : selectedSpaceId ? 'Space' : 'My Home';
  const selectedSpaceCount = selectedSpace ? selectedSpace.totalItemCount : inboxCount;
  const selectedSpaceBackground = selectedSpace?.backgroundGradient || getThreadGradientCSS('paper');
  const topSpaceIsActive = selectedSpaceId ? currentItemId === selectedSpaceId : isDashboard;

  // Prevent background scroll while the sheet is open (same pattern as other sheets)
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (isSheetOpen) document.body.classList.add('bottom-sheet-open');
    else document.body.classList.remove('bottom-sheet-open');
    return () => {
      document.body.classList.remove('bottom-sheet-open');
    };
  }, [isSheetOpen]);

  return (
    <div className="mobile-nav">
      {/* Search Icon Button (Column 1: auto) */}
      <div className="mobile-nav__col">
        <a href="/find" className="nav-link">
          <button className="mobile-nav__search-btn" style={{ touchAction: 'manipulation' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
              <svg viewBox="0 0 512 512">
                <path d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z"/>
              </svg>
            </div>
          </button>
        </a>
      </div>

      {/* Spaces Dropdown (Column 2: 1fr) */}
      <div className="mobile-nav__dropdown-wrapper">
        <div className="space-switcher-anchor space-switcher-anchor--mobile">
          {/* Main button - always wrapped in <a> to avoid hydration mismatch, conditionally navigable */}
          <a
            href={isNote && currentThread ? `/${currentThread.id}` : undefined}
            className="nav-link"
            style={{ display: 'block', width: '100%' }}
            onClick={isNote && currentThread ? undefined : (e) => { e.preventDefault(); openSheet(); }}
          >
            <SpaceButton
              as="div"
              text={activeThreadCandidate ? activeThreadCandidate.title : currentSpace ? currentSpace.title : "My Home"}
              count={updatedCurrentThread ? updatedCurrentThread.noteCount : currentThread ? currentThread.noteCount : currentSpace ? currentSpace.totalItemCount : inboxCount}
              state="DropdownTrigger"
              rightAccessory="none"
              backgroundGradient={activeThreadCandidate?.backgroundGradient || currentSpace?.backgroundGradient || getThreadGradientCSS('paper')}
              hideDropdownIcon={true}
            />
          </a>
          {/* Toggle button - always opens bottom sheet */}
          <button
            type="button"
            className="space-btn__badge-wrapper space-switcher-anchor__toggle"
            aria-label="Switch space"
            onClick={(e) => {
              e.stopPropagation();
              openSheet();
            }}
          >
            <span className="space-btn__toggle-icon" aria-hidden="true">
              <Icon name="sort" size={18} />
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
            side="bottom"
            className="mobile-nav__sheet"
            style={{
              background: 'white',
              padding: 0,
              border: 'none',
              borderTop: 'none',
            }}
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
                    {/* Main button - navigates to space/home when not active, toggles panel when active */}
                    {topSpaceIsActive ? (
                      <SpaceButton 
                        text={selectedSpaceLabel}
                        count={selectedSpaceCount}
                        state="WithCount"
                        rightAccessory="none"
                        backgroundGradient={selectedSpaceBackground}
                        isActive={topSpaceIsActive}
                        hideDropdownIcon={true}
                        onClick={() => setIsSpacePanelOpen((v) => !v)}
                      />
                    ) : (
                      <a 
                        href={selectedSpaceId ? `/${selectedSpaceId}` : '/'}
                        className="nav-link"
                        style={{ display: 'block', width: '100%' }}
                        onClick={() => closeSheet()}
                      >
                        <SpaceButton 
                          as="div"
                          text={selectedSpaceLabel}
                          count={selectedSpaceCount}
                          state="WithCount"
                          rightAccessory="none"
                          backgroundGradient={selectedSpaceBackground}
                          isActive={topSpaceIsActive}
                          hideDropdownIcon={true}
                        />
                      </a>
                    )}
                    {/* Toggle button - opens/closes space picker panel */}
                    <button
                      type="button"
                      className="space-btn__badge-wrapper space-switcher-anchor__toggle"
                      aria-label="Switch space"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsSpacePanelOpen((v) => !v);
                      }}
                    >
                      <span className="space-btn__toggle-icon" aria-hidden="true">
                        <Icon name="sort" size={18} />
                      </span>
                    </button>
                  </div>
                </div>

                {isSpacePanelOpen && (
                  <div className="mobile-nav__space-panel" role="dialog" aria-label="Switch space">
                    <a
                      href="/"
                      className={`mobile-nav__space-panel-item ${!selectedSpaceId ? 'is-active' : ''}`}
                      onClick={() => {
                        setSelectedSpaceId(null);
                        closeSheet();
                      }}
                    >
                      <span className="mobile-nav__space-panel-label">My Home</span>
                      <span className="mobile-nav__space-panel-actions">
                        {!selectedSpaceId ? (
                          <span className="mobile-nav__space-panel-check" aria-hidden="true">
                            <Icon name="check" size={16} style={{ color: 'var(--color-deep-grey)' }} />
                          </span>
                        ) : null}
                      </span>
                    </a>
                    {spacesForDropdown.map((s) => {
                      const isActive = !!selectedSpaceId && s.id === selectedSpaceId;
                      return (
                        <a
                          key={s.id}
                          href={`/${s.id}`}
                          className={`mobile-nav__space-panel-item ${isActive ? 'is-active' : ''}`}
                          onClick={() => {
                            setSelectedSpaceId(s.id);
                            closeSheet();
                          }}
                        >
                          <span className="mobile-nav__space-panel-label">{s.title}</span>
                          <span className="mobile-nav__space-panel-actions">
                            {isActive ? (
                              <span className="mobile-nav__space-panel-check" aria-hidden="true">
                                <Icon name="check" size={16} style={{ color: 'var(--color-deep-grey)' }} />
                              </span>
                            ) : null}
                            <button
                              type="button"
                              className="mobile-nav__space-panel-check"
                              aria-label={`Close ${s.title}`}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                              onTouchStart={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                
                                // Remove from navigation history using context function
                                removeFromNavigationHistory(s.id);

                                // If the user just closed the selected space, switch to Home
                                if (selectedSpaceId === s.id) {
                                  setSelectedSpaceId(null);
                                }

                                closeSheet();
                              }}
                            >
                              <Icon name="xmark" size={16} style={{ color: 'var(--color-deep-grey)' }} />
                            </button>
                          </span>
                        </a>
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
                            <Icon name={isShowingExistingSpaces ? "chevron-up" : "chevron-down"} size={16} style={{ color: 'var(--color-deep-grey)' }} />
                          </span>
                        </button>
                        {isShowingExistingSpaces && availableSpaces.map((s) => {
                          return (
                            <a
                              key={s.id}
                              href={`/${s.id}`}
                              className="mobile-nav__space-panel-item"
                              onClick={() => {
                                setSelectedSpaceId(s.id);
                                setIsShowingExistingSpaces(false);
                                closeSheet();
                              }}
                            >
                              <span className="mobile-nav__space-panel-label">{s.title}</span>
                            </a>
                          );
                        })}
                      </>
                    )}
                    <div className="mobile-nav__space-panel-divider" />
                    <a
                      href="/new-space"
                      className="mobile-nav__space-panel-item mobile-nav__space-panel-new-space"
                      onClick={() => closeSheet()}
                    >
                      <span className="mobile-nav__space-panel-label">New Space</span>
                      <span className="mobile-nav__space-panel-check" aria-hidden="true">
                        <Icon name="plus" size={16} style={{ color: 'var(--color-deep-grey)' }} />
                      </span>
                    </a>
                  </div>
                )}
              </div>

              {/* Scrollable Nav Items */}
              <div className="mobile-nav__dropdown-scroll">
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
                {persistentItems.length > 0 ? (
                  <>
                    {persistentThreads.map((thread) => {
                      const isActive = currentActiveItemId.startsWith('thread_') && thread.id === currentActiveItemId;
                      // Use updated thread data for active thread to show live updates
                      const displayThread = isActive && activeThreadCandidate ? activeThreadCandidate : thread;
                      const threadHref =
                        typeof selectedSpaceId === 'string' && selectedSpaceId.startsWith('space_')
                          ? `/${thread.id}?space=${encodeURIComponent(selectedSpaceId)}`
                          : `/${thread.id}`;
                      return (
                        <div key={thread.id} className="nav-item-container group w-full">
                          <a
                            href={threadHref}
                            className="block w-full"
                            onClick={(e) => handleItemClickWrapper(e, thread.id)}
                            style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
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
                                <div className="space-btn__badge-wrapper">
                                  <div
                                    className="badge-count cursor-pointer"
                                    data-close-item={thread.id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      e.preventDefault();
                                      if (itemsInCloseMode.has(thread.id)) {
                                        handleCloseClick(thread.id, e);
                                      } else {
                                        toggleCloseMode(thread.id);
                                      }
                                    }}
                                  >
                                    {itemsInCloseMode.has(thread.id) ? (
                                      <Icon name="xmark" size={14} style={{ color: getTextColor(displayThread.backgroundGradient, isActive) }} />
                                    ) : (
                                      <span className="badge-number" style={{ color: getTextColor(displayThread.backgroundGradient, isActive) }}>
                                        {formatBadgeCount(displayThread.noteCount)}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              {isActive && <div className="space-btn__shadow" />}
                            </div>
                          </a>
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
        <a href="/profile">
          <Avatar initials={profileData.initials} color={profileData.userColor} />
        </a>
      </div>

    </div>
  );
};

export default MobileNavigation;
