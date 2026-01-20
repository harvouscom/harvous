import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import SpaceButton from './SpaceButton';
import PersistentNavigation from './PersistentNavigation';
import Avatar from './Avatar';
import SquareButton from '../SquareButton';
import Icon from '../Icon';
import { setSelectedSpaceId, useSelectedSpaceId } from './selectedSpace';

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

interface ActiveThread {
  id: string;
  title: string;
  noteCount: number;
  backgroundGradient: string;
  spaceId?: string | null;
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
  userColor?: string;
  pathname?: string;
  search?: string;
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
  userColor = "paper",
  pathname = '/',
  search = ''
}) => {
  const [localSpaces, setLocalSpaces] = useState<Space[]>(spaces);
  // IMPORTANT: derive initial selection from props (SSR + client must match to avoid hydration mismatch).
  // Prefer explicit ?space=..., then /space_... route.
  const routeSelectedSpaceId = useMemo(() => {
    try {
      const params = new URLSearchParams(search || '');
      const fromQuery = params.get('space');
      if (fromQuery && fromQuery.startsWith('space_')) return fromQuery.replace(/\/$/, '');
    } catch {
      // ignore
    }
    if (pathname.startsWith('/space_')) return pathname.substring(1).replace(/\/$/, '');
    return null;
  }, [pathname, search]);

  // Selected space from storage (hydrated after mount). Seed with route value for SSR consistency.
  const selectedSpaceId = useSelectedSpaceId(routeSelectedSpaceId);
  const effectiveSelectedSpaceId = selectedSpaceId ?? routeSelectedSpaceId;
  const [profileData, setProfileData] = useState({
    initials: initials,
    userColor: userColor,
  });
  // Initialize currentItemId from pathname prop (works on both server and client)
  const [currentItemId, setCurrentItemId] = useState(() => {
    return pathname.substring(1) || '';
  });
  const [updatedActiveThread, setUpdatedActiveThread] = useState<ActiveThread | null>(activeThread);
  const [isMovingThreadToSpace, setIsMovingThreadToSpace] = useState(false);
  
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

  const topSpaceLabel = selectedSpace ? selectedSpace.title : effectiveSelectedSpaceId ? 'Space' : 'My Home';
  const topSpaceHref = effectiveSelectedSpaceId ? `/${effectiveSelectedSpaceId}` : '/';
  // The switcher button shouldn't look "active" while viewing a thread/note.
  // It should only be active when you're actually on the selected space page (or dashboard for Home).
  const topSpaceIsActive = effectiveSelectedSpaceId ? currentItemId === effectiveSelectedSpaceId : isDashboard;
  const topSpaceBackground = selectedSpace?.backgroundGradient || 'var(--color-paper)';

  const currentThreadForMismatch = updatedActiveThread || activeThread;
  const isThreadPage = currentItemId.startsWith('thread_');
  const selectedSpaceForMismatch = selectedSpaceId;
  const threadSpaceId = currentThreadForMismatch?.spaceId ?? null;
  const showSpaceMismatchPrompt =
    !!selectedSpaceForMismatch && isThreadPage && currentThreadForMismatch?.id && threadSpaceId !== selectedSpaceForMismatch;

  const selectedSpaceTitleForMismatch = selectedSpace?.title ?? 'this space';
  const threadSpaceTitleForMismatch = threadSpaceId
    ? localSpaces.find((s) => s.id === threadSpaceId)?.title ?? 'its current space'
    : 'My Home';

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
        const message = data?.error || 'Failed to move thread. Please try again.';
        if (typeof window !== 'undefined' && (window as any).toast?.error) {
          (window as any).toast.error(message);
        }
        return;
      }

      // Optimistically update the active thread spaceId so the prompt disappears immediately.
      setUpdatedActiveThread((prev) => (prev ? { ...prev, spaceId: selectedSpaceForMismatch } : prev));
      window.dispatchEvent(new CustomEvent('threadUpdated', { detail: { threadId: currentThreadForMismatch.id } }));

      if (typeof window !== 'undefined' && (window as any).toast?.success) {
        (window as any).toast.success(`Moved to ${selectedSpaceTitleForMismatch}`);
      }
    } catch (error) {
      if (typeof window !== 'undefined' && (window as any).toast?.error) {
        (window as any).toast.error('Failed to move thread. Please try again.');
      }
    } finally {
      setIsMovingThreadToSpace(false);
    }
  };

  const switchSelectedSpaceToThreadSpace = () => {
    if (!currentThreadForMismatch) return;
    setSelectedSpaceId(threadSpaceId);
  };

  // Keep local spaces in sync with server-rendered props (but preserve locally-added ones)
  useEffect(() => {
    setLocalSpaces(prev => {
      const byId = new Map<string, Space>();
      for (const s of [...spaces, ...prev]) {
        byId.set(s.id, s);
      }
      return Array.from(byId.values());
    });
  }, [spaces]);

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
        };
        byId.set(next.id, next);
        return Array.from(byId.values());
      });
    };
    window.addEventListener('spaceCreated', handleSpaceCreated as EventListener);
    return () => window.removeEventListener('spaceCreated', handleSpaceCreated as EventListener);
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
  
  // currentItemId is already initialized from pathname in useState
  // This useEffect just updates it when the page changes

  // Listen for page changes to update currentItemId when pathname changes
  useEffect(() => {
    setCurrentItemId(pathname.substring(1) || '');
    
    // Debounce to avoid multiple rapid updates during navigation
    let timeoutRef: ReturnType<typeof setTimeout> | null = null;
    
    const handlePageLoad = () => {
      // Clear any pending updates
      if (timeoutRef) clearTimeout(timeoutRef);
      
      // Use requestAnimationFrame for immediate visual update
      requestAnimationFrame(() => {
        if (typeof window !== 'undefined') {
          const newPath = window.location.pathname.substring(1) || '';
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
          
          // Force a re-render to ensure component updates after View Transition
          // This helps ensure the navigation column is properly displayed
          setUpdatedActiveThread(activeThread);
        }
      });
    };

    // Listen for Astro page transitions
    document.addEventListener('astro:page-load', handlePageLoad);
    // Also listen for after-swap to catch early updates
    document.addEventListener('astro:after-swap', handlePageLoad);
    
    return () => {
      if (timeoutRef) clearTimeout(timeoutRef);
      document.removeEventListener('astro:page-load', handlePageLoad);
      document.removeEventListener('astro:after-swap', handlePageLoad);
    };
  }, [pathname, activeThread]);

  // If user navigates to a space route, sync the selected space.
  // IMPORTANT: Use window.location, not props, because View Transitions can reuse islands with stale props.
  useEffect(() => {
    if (typeof window === 'undefined') return;
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

  // Force re-render when navigation history updates (critical for View Transitions)
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const handleNavigationUpdate = () => {
      forceUpdate(prev => prev + 1);
    };

    window.addEventListener('navigationHistoryUpdated', handleNavigationUpdate);
    return () => {
      window.removeEventListener('navigationHistoryUpdated', handleNavigationUpdate);
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
      const { shouldForceRefresh, refreshBadgeCountsWithVerification } = await import('@/utils/badge-count-refresh');
      const forceRefresh = shouldForceRefresh(activeThread.id);
      
      try {
        let threadData: any = null;
        
        if (forceRefresh && skipDebounce) {
          // For recent changes, verify with polling
          const verifiedCount = await refreshBadgeCountsWithVerification(activeThread.id, expectedCount);
          if (verifiedCount !== null) {
            // Fetch full thread data
            const response = await fetch('/api/threads/list', {
              credentials: 'include',
              cache: 'no-store'
            });
            if (response.ok) {
              const threads = await response.json();
              threadData = threads.find((t: any) => t.id === activeThread.id);
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
            threadData = threads.find((t: any) => t.id === activeThread.id);
          }
        }
        
        if (threadData) {
          // Track that we updated via API (not events)
          const now = Date.now();
          const timeSinceEventUpdate = now - lastEventUpdateTimeRef.current;
          
          setUpdatedActiveThread((prev) => {
            // Only update if count actually changed
            if (prev && prev.noteCount === threadData.noteCount) {
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
                noteCount: finalCount
              };
            }
            
            // No recent event updates, use server data
            eventUpdatedCountRef.current = threadData.noteCount;
            return {
              ...activeThread,
              noteCount: threadData.noteCount
            };
          });
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

    // Register event listeners
    window.addEventListener('noteCreated', handleNoteCreated as EventListener);
    window.addEventListener('noteDeleted', handleNoteDeleted);
    window.addEventListener('noteRemovedFromThread', handleNoteRemovedFromThread as EventListener);
    window.addEventListener('noteAddedToThread', handleNoteAddedToThread as EventListener);

    // Cleanup
    return () => {
      window.removeEventListener('noteCreated', handleNoteCreated as EventListener);
      window.removeEventListener('noteDeleted', handleNoteDeleted);
      window.removeEventListener('noteRemovedFromThread', handleNoteRemovedFromThread as EventListener);
      window.removeEventListener('noteAddedToThread', handleNoteAddedToThread as EventListener);
      // Clear pending timeout on cleanup
      if (pendingTimeoutRef.current) {
        clearTimeout(pendingTimeoutRef.current);
        pendingTimeoutRef.current = null;
      }
    };
  }, [activeThread]);
  return (
    <div className="nav-column-wrapper">
      <div className="nav-column-layout">
        {/* Top Section - Navigation */}
        <div className="nav-column-top">
          {/* Navigation Buttons */}
          <div className="nav-column-buttons">
            <div className="space-switcher-anchor">
              <a href={topSpaceHref} className="nav-link">
                <SpaceButton
                  as="div"
                  text={topSpaceLabel}
                  count={inboxCount}
                  state="WithCount"
                  rightAccessory="none"
                  isActive={topSpaceIsActive}
                  backgroundGradient={topSpaceBackground}
                />
              </a>
              {/* Native dropdown so it works even without React hydration */}
              <details className="space-switcher-details">
                <summary className="space-btn__badge-wrapper space-switcher-anchor__toggle" aria-label="Switch space">
                  <span className="space-btn__toggle-icon" aria-hidden="true">
                    <Icon name="sort" size={18} />
                  </span>
                </summary>
                <div className="space-switcher-details__panel space-switcher-dropdown__panel" role="dialog" aria-label="Switch space">
                  <a
                    href="/"
                    className={`space-switcher-dropdown__item ${!effectiveSelectedSpaceId ? 'is-active' : ''}`}
                    onClick={() => setSelectedSpaceId(null)}
                  >
                    <span className="space-switcher-dropdown__label">My Home</span>
                    {!effectiveSelectedSpaceId ? (
                      <span className="space-switcher-dropdown__check" aria-hidden="true">
                        <Icon name="check" size={16} style={{ color: 'var(--color-deep-grey)' }} />
                      </span>
                    ) : null}
                  </a>
                  {localSpaces.map((s) => {
                    const isActive = effectiveSelectedSpaceId ? s.id === effectiveSelectedSpaceId : false;
                    return (
                      <a
                        key={s.id}
                        href={`/${s.id}`}
                        className={`space-switcher-dropdown__item ${isActive ? 'is-active' : ''}`}
                        onClick={() => setSelectedSpaceId(s.id)}
                      >
                        <span className="space-switcher-dropdown__label">{s.title}</span>
                        {isActive ? (
                          <span className="space-switcher-dropdown__check" aria-hidden="true">
                            <Icon name="check" size={16} style={{ color: 'var(--color-deep-grey)' }} />
                          </span>
                        ) : null}
                      </a>
                    );
                  })}
                  <div className="space-switcher-dropdown__divider" />
                  <a href="/new-space" className="space-switcher-dropdown__item space-switcher-dropdown__new-space">
                    <span className="space-switcher-dropdown__label">New Space</span>
                    <span className="space-switcher-dropdown__check" aria-hidden="true">
                      <Icon name="plus" size={16} style={{ color: 'var(--color-deep-grey)' }} />
                    </span>
                  </a>
                </div>
              </details>
            </div>

            {showSpaceMismatchPrompt ? (
              <div className="space-mismatch-banner" role="alert" aria-label="Thread space mismatch">
                <div className="space-mismatch-banner__text">
                  <span className="space-mismatch-banner__title">
                    This thread isn’t in {selectedSpaceTitleForMismatch}
                  </span>
                  <span className="space-mismatch-banner__subtitle">
                    It’s currently in {threadSpaceTitleForMismatch}
                  </span>
                </div>
                <div className="space-mismatch-banner__actions">
                  <button
                    type="button"
                    className="space-mismatch-banner__btn space-mismatch-banner__btn--primary"
                    onClick={moveThreadToSelectedSpace}
                    disabled={isMovingThreadToSpace}
                  >
                    {isMovingThreadToSpace ? 'Moving…' : `Move to ${selectedSpaceTitleForMismatch}`}
                  </button>
                  <button
                    type="button"
                    className="space-mismatch-banner__btn"
                    onClick={switchSelectedSpaceToThreadSpace}
                  >
                    Switch space
                  </button>
                </div>
              </div>
            ) : null}
            
            {/* Persistent Navigation - shows recently accessed items */}
            <PersistentNavigation />
          </div>
        </div>
        
        {/* Bottom Section with New Space Button, Search, and Avatar/Back Button */}
        <div className="nav-column-bottom">
          <div className="nav-flex-grow">
            <a href="/find" aria-label="Search" className="nav-link">
              <div
                className="space-button nav-search-button relative rounded-3xl h-[64px] transition-[scale,shadow] duration-300 pr-0 w-full"
                style={{ backgroundImage: 'var(--color-gradient-gray)' }}
              >
                <div className="flex items-center justify-start gap-3 relative w-full h-full transition-transform duration-125 min-w-0">
                  <div className="flex items-center justify-center relative shrink-0">
                    <Icon name="magnifying-glass" size={20} style={{ color: 'var(--color-pebble-grey)' }} />
                  </div>
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <span
                      className="font-sans text-[18px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis block"
                      style={{ color: 'var(--color-pebble-grey)' }}
                    >
                      Search
                    </span>
                  </div>
                </div>
              </div>
            </a>
          </div>
          {showProfile ? (
            <a href="/" aria-label="Go to dashboard" className="nav-link--shrink">
              <SquareButton variant="Back" />
            </a>
          ) : (
            <a href="/profile" aria-label="Go to profile" className="nav-link--shrink">
              <Avatar initials={profileData.initials} color={profileData.userColor} />
            </a>
          )}
        </div>
      </div>

    </div>
  );
};

export default NavigationColumn;
