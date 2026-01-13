import React, { useState, useEffect, useMemo, useRef } from 'react';
import SpaceButton from './SpaceButton';
import PersistentNavigation from './PersistentNavigation';
import Avatar from './Avatar';
import SquareButton from '../SquareButton';
import { useNavigation } from './NavigationContext';

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
  pathname = '/'
}) => {
  const { removeFromNavigationHistory, navigationHistory } = useNavigation();
  const [profileData, setProfileData] = useState({
    initials: initials,
    userColor: userColor,
  });
  const [showActiveThread, setShowActiveThread] = useState(false);
  // Initialize currentItemId from pathname prop (works on both server and client)
  const [currentItemId, setCurrentItemId] = useState(() => {
    return pathname.substring(1) || '';
  });
  const [updatedActiveThread, setUpdatedActiveThread] = useState<ActiveThread | null>(activeThread);
  
  // Determine if we're on the dashboard page
  // Use pathname prop which is available on both server and client (from Astro.url.pathname)
  // This ensures SSR and client render the same value, preventing hydration mismatches
  const isDashboard = useMemo(() => {
    return pathname === '/' || pathname === '/dashboard';
  }, [pathname]);

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
  
  // Check if active thread is in persistent navigation
  // Uses navigationHistory from context which includes pending threads from sessionStorage
  useEffect(() => {
    if (activeThread && typeof window !== 'undefined') {
      try {
        // Check NavigationContext state which includes pending threads
        const isInPersistentNav = navigationHistory.some((item) => item.id === activeThread.id);
        // For note pages, always show the active thread button to maintain context
        // For other pages, only show if not in persistent navigation
        setShowActiveThread(isNote || !isInPersistentNav);
      } catch (error) {
        console.error('Error checking persistent navigation:', error);
        setShowActiveThread(true); // Default to showing if error
      }
    }
  }, [activeThread, isNote, currentItemId, navigationHistory]);

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
            <a href="/" className="nav-link">
              <SpaceButton 
                text="My Home" 
                count={inboxCount} 
                state="WithCount" 
                isActive={isDashboard}
                backgroundGradient={isDashboard ? "var(--color-paper)" : undefined}
              />
            </a>
            
            {/* Persistent Navigation - shows recently accessed items */}
            <PersistentNavigation />
            
            {/* Show active thread if any - but only if it's not already in persistent navigation */}
            {(updatedActiveThread || activeThread) && showActiveThread ? (
              <a 
                href={`/${(updatedActiveThread || activeThread)!.id}`} 
                className="nav-link"
               
              >
                <SpaceButton 
                  text={(updatedActiveThread || activeThread)!.title} 
                  count={(updatedActiveThread || activeThread)!.noteCount} 
                  state="Close" 
                  backgroundGradient={(updatedActiveThread || activeThread)!.backgroundGradient}
                  isActive={isNote || (updatedActiveThread || activeThread)!.id === currentItemId}
                  itemId={(updatedActiveThread || activeThread)!.id}
                />
              </a>
            ) : null}
          </div>
        </div>
        
        {/* Bottom Section with New Space Button, Search, and Avatar/Back Button */}
        <div className="nav-column-bottom">
          <div className="nav-flex-grow">
            <a href="/new-space" className="nav-link">
              <SpaceButton text="New Space" />
            </a>
          </div>
          <a href="/find" aria-label="Search" className="nav-link--shrink">
            <SquareButton variant="Find" />
          </a>
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
