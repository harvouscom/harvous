import React, { useState, useEffect } from 'react';
import { useNavigation } from './NavigationContext';
import SpaceButton from './SpaceButton';
import Avatar from './Avatar';
import { getThreadGradientCSS, THREAD_COLORS, type ThreadColor } from '@/utils/colors';
import Icon from '../Icon';

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
}

const MobileNavigation: React.FC<MobileNavigationProps> = ({
  spaces = [],
  threads = [],
  inboxCount = 0,
  currentSpace = null,
  currentThread = null,
  initials = 'U',
  userColor = 'paper'
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [currentItemId, setCurrentItemId] = useState(() => {
    // Initialize from window.location if available (client-side only)
    if (typeof window !== 'undefined') {
      return window.location.pathname.substring(1);
    }
    return '';
  });
  const { navigationHistory, removeFromNavigationHistory } = useNavigation();
  const [updatedCurrentThread, setUpdatedCurrentThread] = useState(currentThread);
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

  // Helper to determine if background is colored (not paper or gray gradient)
  const isColoredBackground = (gradient: string | undefined): boolean => {
    if (!gradient || gradient === 'var(--color-gradient-gray)' || gradient === 'var(--color-paper)') {
      return false;
    }
    const threadColors = THREAD_COLORS.filter(c => c !== 'paper');
    return threadColors.some(color => gradient.includes(`--color-${color}`));
  };

  // Determine text color - pastel colors use dark text for visibility
  const getTextColor = (gradient: string | undefined, isActive: boolean): string => {
    // All thread colors use dark text (pastel colors)
    return 'var(--color-deep-grey)';
  };

  // Initialize current item ID on mount (component is client-only, so window is always available)
  useEffect(() => {
    setCurrentItemId(window.location.pathname.substring(1));
  }, []);

  // Listen for page changes to update current item
  useEffect(() => {
    const handlePageLoad = () => {
      // Update current item ID when page changes
      setCurrentItemId(window.location.pathname.substring(1));
    };

    document.addEventListener('astro:page-load', handlePageLoad);
    
    return () => {
      document.removeEventListener('astro:page-load', handlePageLoad);
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

      try {
        // Fetch current thread data from API
        const response = await fetch('/api/threads/list', {
          credentials: 'include'
        });

        // Handle 401 errors gracefully - auth may not be fully established yet
        if (response.status === 401) {
          // Silently fail - auth will establish soon
          return;
        }

        if (response.ok) {
          const threads = await response.json();
          const threadData = threads.find((t: any) => t.id === currentThread.id);
          
          if (threadData) {
            setUpdatedCurrentThread((prev) => {
              // Only update if count actually changed
              if (prev && prev.noteCount === threadData.noteCount) {
                return prev;
              }
              return {
                ...currentThread,
                noteCount: threadData.noteCount
              };
            });
          }
        }
      } catch (error) {
        // Silently fail - network errors are expected during auth establishment
        // Don't log errors during initial load
      }
    };

    const handleNoteCreated = () => {
      setTimeout(() => refreshCurrentThreadCount(), 300);
    };

    const handleNoteDeleted = () => {
      setTimeout(() => refreshCurrentThreadCount(), 300);
    };

    const handleNoteRemovedFromThread = (event: CustomEvent) => {
      const { threadId } = event.detail;
      if (threadId === currentThread.id) {
        setTimeout(() => refreshCurrentThreadCount(), 300);
      }
    };

    const handleNoteAddedToThread = (event: CustomEvent) => {
      const { threadId } = event.detail;
      if (threadId === currentThread.id) {
        setTimeout(() => refreshCurrentThreadCount(), 300);
      }
    };

    // Register event listeners
    window.addEventListener('noteCreated', handleNoteCreated);
    window.addEventListener('noteDeleted', handleNoteDeleted);
    window.addEventListener('noteRemovedFromThread', handleNoteRemovedFromThread as EventListener);
    window.addEventListener('noteAddedToThread', handleNoteAddedToThread as EventListener);

    // Cleanup
    return () => {
      window.removeEventListener('noteCreated', handleNoteCreated);
      window.removeEventListener('noteDeleted', handleNoteDeleted);
      window.removeEventListener('noteRemovedFromThread', handleNoteRemovedFromThread as EventListener);
      window.removeEventListener('noteAddedToThread', handleNoteAddedToThread as EventListener);
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
  
  // Determine what the current active thread/space is
  const getCurrentActiveItemId = () => {
    let currentActiveItemId = currentItemId;
    
    // If we're on a note page, we need to determine the parent thread
    if (currentItemId.startsWith('note_')) {
      // First priority: use the currentThread prop passed from server-side
      if (currentThread && currentThread.id) {
        currentActiveItemId = currentThread.id;
      } else {
        // Fallback: try to get parent thread from page data
        const noteElement = document.querySelector('[data-note-id]') as HTMLElement;
        
        if (noteElement && noteElement.dataset.parentThreadId) {
          currentActiveItemId = noteElement.dataset.parentThreadId;
        } else {
          // Try to get from navigation element
          const navigationElement = document.querySelector('[slot="navigation"]') as HTMLElement;
          
          if (navigationElement && navigationElement.dataset.parentThreadId) {
            currentActiveItemId = navigationElement.dataset.parentThreadId;
          } else {
            // Final fallback: assume unorganized thread
            currentActiveItemId = 'thread_unorganized';
          }
        }
      }
    }
    
    return currentActiveItemId;
  };

  const currentActiveItemId = getCurrentActiveItemId();
  
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

    return persistentItems;
  };

  const persistentItems = getPersistentItems();

  // Organize persistent items hierarchically (spaces with threads nested)
  const organizePersistentItems = () => {
    if (persistentItems.length === 0) return { spaces: [], threads: [] };
    
    const spaces = persistentItems.filter(item => item.id.startsWith('space_'));
    const threads = persistentItems.filter(item => item.id.startsWith('thread_'));
    
    // For now, show all threads as unorganized since we don't have space relationships
    // In the future, this could be enhanced to group threads under their parent spaces
    const unorganizedThreads = threads;
    
    return { spaces, threads: unorganizedThreads };
  };

  const { spaces: persistentSpaces, threads: persistentThreads } = organizePersistentItems();

  const handleDropdownToggle = () => {
    if (isDropdownOpen) {
      // If open, close it with animation
      handleDropdownClose();
    } else {
      // If closed, open it
      setIsDropdownOpen(true);
      // Small delay to ensure DOM is ready for animation
      setTimeout(() => setIsMounted(true), 10);
    }
  };

  const handleDropdownClose = () => {
    // Close immediately without animation
    setIsDropdownOpen(false);
    setIsExiting(false);
    setIsMounted(false);
    // Exit close mode for all items when dropdown closes
    setItemsInCloseMode(new Set());
  };

  const handleItemClick = (itemId?: string) => {
    handleDropdownClose();
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
      ? !currentSpace && !currentThread && !currentItemId // "For You" is active
      : itemId === currentActiveItemId; // Other items match currentActiveItemId
    
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
        {!isDropdownOpen && (
          <SpaceButton 
            text={currentThread ? currentThread.title : currentSpace ? currentSpace.title : "For You"}
            count={updatedCurrentThread ? updatedCurrentThread.noteCount : currentThread ? currentThread.noteCount : currentSpace ? currentSpace.totalItemCount : inboxCount}
            state="DropdownTrigger"
            backgroundGradient={currentThread?.backgroundGradient || currentSpace?.backgroundGradient || getThreadGradientCSS('paper')}
            onClick={handleDropdownToggle}
            hideDropdownIcon={true}
          />
        )}
        
        {/* Dropdown Menu */}
        {isDropdownOpen && (
          <div 
            className={`mobile-nav__dropdown ${isMounted ? 'dropdown-enter' : 'dropdown-initial'}`}
            style={!isMounted ? { maxHeight: '64px', overflow: 'hidden' } : undefined}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Scrollable Nav Items */}
            <div className="mobile-nav__dropdown-scroll">
              {/* Active Item - Always First */}
              {(() => {
                const isForYouActive = !currentSpace && !currentThread && !currentItemId;
                const activeSpace = currentSpace && currentSpace.id === currentActiveItemId ? currentSpace : null;
                const activeThread = (updatedCurrentThread || currentThread) && (updatedCurrentThread || currentThread)!.id === currentActiveItemId ? (updatedCurrentThread || currentThread) : null;
                const activePersistentSpace = persistentSpaces.find(space => space.id === currentActiveItemId);
                const activePersistentThread = persistentThreads.find(thread => thread.id === currentActiveItemId);
                
                // Render active item first
                if (isForYouActive) {
                  return (
                    <a 
                      key="for-you-active"
                      href="/" 
                      className="block w-full"
                      onClick={(e) => handleItemClickWrapper(e, undefined)}
                      style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                    >
                      <div className="space-btn pl-4" style={{ backgroundImage: getThreadGradientCSS('paper') }}>
                        <div className="space-btn__content">
                          <div className="space-btn__text-wrapper">
                            <span className="space-btn__text">For You</span>
                          </div>
                          <div className="space-btn__badge-wrapper">
                            <div className="badge-count">
                              <span className="badge-number">{inboxCount}</span>
                            </div>
                          </div>
                        </div>
                        <div className="space-btn__shadow" />
                      </div>
                    </a>
                  );
                } else if (activeSpace) {
                  return (
                    <a 
                      key={`active-space-${activeSpace.id}`}
                      href={`/${activeSpace.id}`} 
                      className="block w-full"
                      onClick={(e) => handleItemClickWrapper(e, activeSpace.id)}
                      style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                    >
                      <div 
                        className="space-btn pl-4"
                        style={{
                          backgroundImage: activeSpace.backgroundGradient?.includes('gradient') ? activeSpace.backgroundGradient : undefined,
                          backgroundColor: activeSpace.backgroundGradient?.includes('gradient') ? undefined : (activeSpace.backgroundGradient || undefined)
                        }}
                      >
                        <div className="space-btn__content">
                          <div className="space-btn__text-wrapper">
                            <span className="space-btn__text" style={{ color: getTextColor(activeSpace.backgroundGradient, true) }}>
                              {activeSpace.title}
                            </span>
                          </div>
                          <div className="space-btn__badge-wrapper">
                            <div className="badge-count">
                              <span className="badge-number" style={{ color: getTextColor(activeSpace.backgroundGradient, true) }}>
                                {activeSpace.totalItemCount}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="space-btn__shadow" />
                      </div>
                    </a>
                  );
                } else if (activeThread) {
                  return (
                    <a 
                      key={`active-thread-${activeThread.id}`}
                      href={`/${activeThread.id}`} 
                      className="block w-full"
                      onClick={(e) => handleItemClickWrapper(e, activeThread.id)}
                      style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                    >
                      <div 
                        className="space-btn pl-4"
                        style={{
                          backgroundImage: activeThread.backgroundGradient?.includes('gradient') ? activeThread.backgroundGradient : undefined,
                          backgroundColor: activeThread.backgroundGradient?.includes('gradient') ? undefined : (activeThread.backgroundGradient || undefined)
                        }}
                      >
                        <div className="space-btn__content">
                          <div className="space-btn__text-wrapper">
                            <span className="space-btn__text" style={{ color: getTextColor(activeThread.backgroundGradient, true) }}>
                              {activeThread.title}
                            </span>
                          </div>
                          <div className="space-btn__badge-wrapper">
                            <div className="badge-count">
                              <span className="badge-number" style={{ color: getTextColor(activeThread.backgroundGradient, true) }}>
                                {activeThread.noteCount}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="space-btn__shadow" />
                      </div>
                    </a>
                  );
                } else if (activePersistentSpace) {
                  const isActive = activePersistentSpace.id === currentActiveItemId;
                  return (
                    <div key={`active-persistent-space-${activePersistentSpace.id}`} className="nav-item-container group w-full">
                      <a 
                        href={`/${activePersistentSpace.id}`} 
                        className="block w-full" 
                        onClick={(e) => handleItemClickWrapper(e, activePersistentSpace.id)}
                        style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                      >
                        <div 
                          className="space-btn pl-4"
                          style={isActive ? {
                            backgroundImage: activePersistentSpace.backgroundGradient?.includes('gradient') ? activePersistentSpace.backgroundGradient : undefined,
                            backgroundColor: activePersistentSpace.backgroundGradient?.includes('gradient') ? undefined : (activePersistentSpace.backgroundGradient || undefined)
                          } : {}}
                        >
                          <div className="space-btn__content">
                            <div className="space-btn__text-wrapper">
                              <span className="space-btn__text" style={{ color: getTextColor(activePersistentSpace.backgroundGradient, isActive) }}>
                                {activePersistentSpace.title}
                              </span>
                            </div>
                            <div className="space-btn__badge-wrapper">
                              <div 
                                className="badge-count cursor-pointer"
                                data-close-item={activePersistentSpace.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  if (itemsInCloseMode.has(activePersistentSpace.id)) {
                                    handleCloseClick(activePersistentSpace.id, e);
                                  } else {
                                    toggleCloseMode(activePersistentSpace.id);
                                  }
                                }}
                              >
                                {itemsInCloseMode.has(activePersistentSpace.id) ? (
                                  <Icon name="xmark" size={14} style={{ color: getTextColor(activePersistentSpace.backgroundGradient, isActive) }} />
                                ) : (
                                  <span className="badge-number" style={{ color: getTextColor(activePersistentSpace.backgroundGradient, isActive) }}>
                                    {activePersistentSpace.count || 0}
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
                } else if (activePersistentThread) {
                  const isActive = activePersistentThread.id === currentActiveItemId;
                  return (
                    <div key={`active-persistent-thread-${activePersistentThread.id}`} className="nav-item-container group w-full">
                      <a 
                        href={`/${activePersistentThread.id}`} 
                        className="block w-full" 
                        onClick={(e) => handleItemClickWrapper(e, activePersistentThread.id)}
                        style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                      >
                        <div 
                          className="space-btn pl-4"
                          style={isActive ? {
                            backgroundImage: activePersistentThread.backgroundGradient?.includes('gradient') ? activePersistentThread.backgroundGradient : undefined,
                            backgroundColor: activePersistentThread.backgroundGradient?.includes('gradient') ? undefined : (activePersistentThread.backgroundGradient || undefined)
                          } : {}}
                        >
                          <div className="space-btn__content">
                            <div className="space-btn__text-wrapper">
                              <span className="space-btn__text" style={{ color: getTextColor(activePersistentThread.backgroundGradient, isActive) }}>
                                {activePersistentThread.title}
                              </span>
                            </div>
                            <div className="space-btn__badge-wrapper">
                              <div 
                                className="badge-count cursor-pointer"
                                data-close-item={activePersistentThread.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  if (itemsInCloseMode.has(activePersistentThread.id)) {
                                    handleCloseClick(activePersistentThread.id, e);
                                  } else {
                                    toggleCloseMode(activePersistentThread.id);
                                  }
                                }}
                              >
                                {itemsInCloseMode.has(activePersistentThread.id) ? (
                                  <Icon name="xmark" size={14} style={{ color: getTextColor(activePersistentThread.backgroundGradient, isActive) }} />
                                ) : (
                                  <span className="badge-number" style={{ color: getTextColor(activePersistentThread.backgroundGradient, isActive) }}>
                                    {activePersistentThread.count || 0}
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
                }
                return null;
              })()}
              
              {/* For You - Only if not active */}
              {currentSpace || currentThread || currentItemId ? (
                <a 
                  href="/" 
                  className="block w-full"
                  onClick={(e) => handleItemClickWrapper(e)}
                  style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                >
                  <div className="space-btn pl-4">
                    <div className="space-btn__content">
                      <div className="space-btn__text-wrapper">
                        <span className="space-btn__text">For You</span>
                      </div>
                      <div className="space-btn__badge-wrapper">
                        <div className="badge-count">
                          <span className="badge-number">{inboxCount}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </a>
              ) : null}
              
              {/* Persistent Navigation Items - Excluding Active */}
              {persistentItems.length > 0 && (
                <>
                  {/* Persistent Spaces - Excluding Active */}
                  {persistentSpaces.filter(space => space.id !== currentActiveItemId).map((space) => {
                    return (
                      <div key={space.id} className="nav-item-container group w-full">
                        <a 
                          href={`/${space.id}`} 
                          className="block w-full" 
                          onClick={() => handleItemClick(space.id)}
                          style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                        >
                          <div className="space-btn pl-4">
                            <div className="space-btn__content">
                              <div className="space-btn__text-wrapper">
                                <span className="space-btn__text" style={{ color: getTextColor(space.backgroundGradient, false) }}>
                                  {space.title}
                                </span>
                              </div>
                              <div className="space-btn__badge-wrapper">
                                <div 
                                  className="badge-count cursor-pointer"
                                  data-close-item={space.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    if (itemsInCloseMode.has(space.id)) {
                                      handleCloseClick(space.id, e);
                                    } else {
                                      toggleCloseMode(space.id);
                                    }
                                  }}
                                >
                                  {itemsInCloseMode.has(space.id) ? (
                                    <Icon name="xmark" size={14} style={{ color: getTextColor(space.backgroundGradient, false) }} />
                                  ) : (
                                    <span className="badge-number" style={{ color: getTextColor(space.backgroundGradient, false) }}>
                                      {space.count || 0}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </a>
                      </div>
                    );
                  })}
                  
                  {/* Persistent Threads - Excluding Active */}
                  {persistentThreads.filter(thread => thread.id !== currentActiveItemId).map((thread) => {
                    return (
                      <div key={thread.id} className="nav-item-container group w-full">
                        <a 
                          href={`/${thread.id}`} 
                          className="block w-full" 
                          onClick={() => handleItemClick(thread.id)}
                          style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                        >
                          <div className="space-btn pl-4">
                            <div className="space-btn__content">
                              <div className="space-btn__text-wrapper">
                                <span className="space-btn__text" style={{ color: getTextColor(thread.backgroundGradient, false) }}>
                                  {thread.title}
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
                                    <Icon name="xmark" size={14} style={{ color: getTextColor(thread.backgroundGradient, false) }} />
                                  ) : (
                                    <span className="badge-number" style={{ color: getTextColor(thread.backgroundGradient, false) }}>
                                      {thread.count || 0}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </a>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
            
            {/* New Space Button - Absolutely Positioned */}
            <div className="mobile-nav__new-space">
              <a href="/new-space" className="nav-link">
                <div className="new-space-button">
                  <SpaceButton 
                    text="New Space"
                    state="Default"
                    backgroundGradient="linear-gradient(126.64deg, rgba(255, 255, 255, 0.8) 11.71%, rgba(248, 248, 248, 0.8) 71.33%)"
                  />
                </div>
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Avatar (Column 3: auto) */}
      <div className="mobile-nav__col">
        <a href="/profile">
          <Avatar initials={profileData.initials} color={profileData.userColor} />
        </a>
      </div>

      {/* Click outside handler */}
      {isDropdownOpen && (
        <div className="mobile-nav__overlay" onClick={handleDropdownClose} />
      )}
    </div>
  );
};

export default MobileNavigation;
