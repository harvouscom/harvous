import React, { useState, useEffect } from 'react';
import { useNavigation } from './NavigationContext';
import SpaceButton from './SpaceButton';
import SquareButton from '../SquareButton';
import Avatar from './Avatar';

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
  const [isClient, setIsClient] = useState(false);
  const { navigationHistory, removeFromNavigationHistory } = useNavigation();

  // Handle SSR - only run client-side code after hydration
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Get currently active item (the one being viewed) - only on client
  const getCurrentItemId = () => {
    if (!isClient) return '';
    const currentPath = window.location.pathname;
    return currentPath.startsWith('/') ? currentPath.substring(1) : currentPath;
  };

  const currentItemId = getCurrentItemId();
  
  // Determine what the current active thread/space is - only on client
  const getCurrentActiveItemId = () => {
    if (!isClient) return '';
    
    let currentActiveItemId = currentItemId;
    
    // If we're on a note page, we need to determine the parent thread
    if (currentItemId.startsWith('note_')) {
      // Try to get parent thread from page data
      const noteElement = document.querySelector('[data-note-id]') as HTMLElement;
      
      if (noteElement && noteElement.dataset.parentThreadId) {
        currentActiveItemId = noteElement.dataset.parentThreadId;
      } else {
        // Try to get from navigation element
        const navigationElement = document.querySelector('[slot="navigation"]') as HTMLElement;
        
        if (navigationElement && navigationElement.dataset.parentThreadId) {
          currentActiveItemId = navigationElement.dataset.parentThreadId;
        } else {
          // Fallback: assume unorganized thread
          currentActiveItemId = 'thread_unorganized';
        }
      }
    }
    
    return currentActiveItemId;
  };

  const currentActiveItemId = getCurrentActiveItemId();
  
  // Filter out items that shouldn't be shown in persistent navigation
  const getPersistentItems = () => {
    if (!isClient) return [];
    
    let persistentItems = navigationHistory.filter((item) => {
      // Don't show the currently active item (use the resolved active item ID)
      // EXCEPT for spaces - spaces should always be shown even when active
      if (item.id === currentActiveItemId && !item.id.startsWith('space_')) {
        return false;
      }
      
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

  // Debug logging
  console.log('MobileNavigation React component rendering:', { 
    spaces: spaces.length, 
    threads: threads.length, 
    inboxCount, 
    currentSpace: currentSpace?.title, 
    currentThread: currentThread?.title,
    initials,
    userColor
  });

  const handleDropdownToggle = () => {
    console.log('Dropdown toggle clicked, current state:', isDropdownOpen);
    setIsDropdownOpen(!isDropdownOpen);
  };

  const handleDropdownClose = () => {
    setIsDropdownOpen(false);
  };

  const handleItemClick = () => {
    handleDropdownClose();
  };

  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 w-full min-w-0 h-[64px]">
      {/* Search Icon Button (Column 1: auto) */}
      <div className="flex items-center justify-center h-[64px]">
        <a href="/search" className="block">
          <button
            className="[&:active_svg]:-translate-y-0 [&:active_svg]:scale-[0.95] relative rounded-3xl w-[64px] h-[64px] cursor-pointer transition-[scale,shadow] duration-300"
            style={{ backgroundImage: 'var(--color-gradient-gray)' }}
          >
            <div className="flex flex-row items-center justify-center relative w-full h-full">
              <div className="box-border flex flex-row gap-3 items-center justify-center pb-5 pt-[18px] px-4 relative w-full h-full">
                <div className="relative shrink-0 w-5 h-5 flex items-center justify-center">
                  <svg 
                    className="-translate-y-0.5 fill-[var(--color-pebble-grey)] block max-w-none transition-transform duration-125" 
                    style={{ width: '20px', height: '20px' }} 
                    viewBox="0 0 512 512"
                  >
                    <path d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z"/>
                  </svg>
                </div>
              </div>
            </div>
          </button>
        </a>
      </div>

      {/* Spaces Dropdown (Column 2: 1fr) */}
      <div className="relative min-w-0 h-[64px] flex items-center">
        <SpaceButton 
          text={currentThread ? currentThread.title : currentSpace ? currentSpace.title : "For You"}
          count={currentThread ? currentThread.noteCount : currentSpace ? currentSpace.totalItemCount : inboxCount}
          state="DropdownTrigger"
          className="w-full min-w-0"
          backgroundGradient={currentThread?.backgroundGradient || (currentSpace ? "linear-gradient(180deg, var(--color-paper) 0%, var(--color-paper) 100%)" : "linear-gradient(180deg, var(--color-paper) 0%, var(--color-paper) 100%)")}
          onClick={handleDropdownToggle}
        />
        
        {/* Dropdown Menu */}
        {isDropdownOpen && (
          <div 
            className="absolute top-full left-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-[9999]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-2">
              {/* For You */}
              <a href="/dashboard" className="block w-full" onClick={handleItemClick}>
                <div className="flex items-center justify-between p-2 rounded hover:bg-gray-50">
                  <span className="text-sm font-medium">For You</span>
                  <span className="text-xs text-gray-500">{inboxCount}</span>
                </div>
              </a>
              
              {/* Spaces */}
              {spaces.map(space => (
                <a key={space.id} href={`/${space.id}`} className="block w-full" onClick={handleItemClick}>
                  <div className="flex items-center justify-between p-2 rounded hover:bg-gray-50">
                    <span className="text-sm font-medium">{space.title}</span>
                    <span className="text-xs text-gray-500">{space.totalItemCount}</span>
                  </div>
                </a>
              ))}
              
              {/* Threads (context-aware) */}
              {currentThread && (
                <a href={`/${currentThread.id}`} className="block w-full" onClick={handleItemClick}>
                  <div className="flex items-center justify-between p-2 rounded hover:bg-gray-50 bg-blue-50">
                    <span className="text-sm font-medium">{currentThread.title}</span>
                    <span className="text-xs text-blue-600">{currentThread.noteCount}</span>
                  </div>
                </a>
              )}
              
              {currentSpace && threads.length > 0 && (
                threads.filter(thread => thread.spaceId === currentSpace.id).map(thread => (
                  <a key={thread.id} href={`/${thread.id}`} className="block w-full" onClick={handleItemClick}>
                    <div className="flex items-center justify-between p-2 rounded hover:bg-gray-50">
                      <span className="text-sm font-medium">{thread.title}</span>
                      <span className="text-xs text-gray-500">{thread.noteCount}</span>
                    </div>
                  </a>
                ))
              )}

              {/* Persistent Navigation Items */}
              {isClient && persistentItems.length > 0 && (
                <>
                  {/* Divider */}
                  <div className="border-t border-gray-200 my-2"></div>
                  
                  {persistentItems.map((item) => {
                    const isActive = item.id === currentActiveItemId;
                    
                    return (
                      <div key={item.id} className="relative group">
                        <a href={`/${item.id}`} className="block w-full" onClick={handleItemClick}>
                          <div className="flex items-center justify-between p-2 rounded hover:bg-gray-50">
                            <span className="text-sm font-medium">{item.title}</span>
                            <div className="flex items-center gap-2">
                              {/* Badge count with hover functionality */}
                              <div 
                                className="badge-count bg-[rgba(120,118,111,0.1)] flex items-center justify-center rounded-3xl w-6 h-6 relative cursor-pointer group/badge"
                                data-close-item={item.id}
                                onMouseEnter={(e) => {
                                  if (!isActive) {
                                    const badgeCount = e.currentTarget;
                                    const countSpan = badgeCount.querySelector('.badge-number');
                                    const closeIcon = badgeCount.querySelector('.close-icon');
                                    
                                    if (countSpan && closeIcon) {
                                      countSpan.style.display = 'none';
                                      closeIcon.style.display = 'block';
                                      badgeCount.style.backgroundColor = 'transparent';
                                    }
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (!isActive) {
                                    const badgeCount = e.currentTarget;
                                    const countSpan = badgeCount.querySelector('.badge-number');
                                    const closeIcon = badgeCount.querySelector('.close-icon');
                                    
                                    if (countSpan && closeIcon) {
                                      countSpan.style.display = 'block';
                                      closeIcon.style.display = 'none';
                                      badgeCount.style.backgroundColor = 'rgba(120,118,111,0.1)';
                                    }
                                  }
                                }}
                                onClick={(e) => {
                                  if (!isActive) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    removeFromNavigationHistory(item.id);
                                  }
                                }}
                              >
                                <span className="text-[14px] font-sans font-semibold text-[var(--color-deep-grey)] leading-[0] badge-number">
                                  {item.count || 0}
                                </span>
                                {/* Close icon - only show for inactive items */}
                                {!isActive && (
                                  <i 
                                    className="fa-solid fa-xmark close-icon text-[var(--color-deep-grey)] text-xs"
                                    style={{ display: 'none', position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
                                  ></i>
                                )}
                              </div>
                            </div>
                          </div>
                        </a>
                      </div>
                    );
                  })}
                </>
              )}
              
              {/* New Space Button */}
              <a href="/new-space" className="block w-full" onClick={handleItemClick}>
                <div className="flex items-center justify-between p-2 rounded hover:bg-gray-50">
                  <span className="text-sm font-medium text-blue-600">New Space</span>
                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                  </svg>
                </div>
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Avatar (Column 3: auto) */}
      <div className="flex items-center justify-center h-[64px]">
        <a href="/profile">
          <Avatar initials={initials} color={userColor} id="mobile-navigation-avatar" />
        </a>
      </div>

      {/* Click outside handler */}
      {isDropdownOpen && (
        <div 
          className="fixed inset-0 z-[9998]" 
          onClick={handleDropdownClose}
        />
      )}
    </div>
  );
};

export default MobileNavigation;
