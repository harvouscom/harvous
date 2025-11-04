import React, { useState, useEffect } from 'react';
import { useNavigation } from './NavigationContext';
import SpaceButton from './SpaceButton';
import SquareButton from '../SquareButton';
import Avatar from './Avatar';
import { getThreadGradientCSS, THREAD_COLORS, type ThreadColor } from '@/utils/colors';

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
  const [currentItemId, setCurrentItemId] = useState('');
  const { navigationHistory, removeFromNavigationHistory } = useNavigation();

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

  // Handle SSR - only run client-side code after hydration
  useEffect(() => {
    console.log('🚀 MobileNavigation component mounted and hydrated!');
    setIsClient(true);
    // Initialize current item ID
    setCurrentItemId(window.location.pathname.substring(1));
  }, []);

  // Listen for page changes to update current item
  useEffect(() => {
    if (!isClient) return;

    const handlePageLoad = () => {
      // Update current item ID when page changes
      setCurrentItemId(window.location.pathname.substring(1));
    };

    document.addEventListener('astro:page-load', handlePageLoad);
    
    return () => {
      document.removeEventListener('astro:page-load', handlePageLoad);
    };
  }, [isClient]);
  
  // Determine what the current active thread/space is - only on client
  const getCurrentActiveItemId = () => {
    if (!isClient) return '';
    
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
    if (!isClient) return [];
    
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
    if (!isClient || persistentItems.length === 0) return { spaces: [], threads: [] };
    
    const spaces = persistentItems.filter(item => item.id.startsWith('space_'));
    const threads = persistentItems.filter(item => item.id.startsWith('thread_'));
    
    // For now, show all threads as unorganized since we don't have space relationships
    // In the future, this could be enhanced to group threads under their parent spaces
    const unorganizedThreads = threads;
    
    return { spaces, threads: unorganizedThreads };
  };

  const { spaces: persistentSpaces, threads: persistentThreads } = organizePersistentItems();

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
    console.log('🎯 Dropdown toggle clicked, current state:', isDropdownOpen);
    console.log('🎯 Setting dropdown to:', !isDropdownOpen);
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
          backgroundGradient={currentThread?.backgroundGradient || getThreadGradientCSS('paper')}
          onClick={handleDropdownToggle}
          hideDropdownIcon={true}
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
                <div className="relative rounded-xl h-[64px] cursor-pointer transition-[scale,shadow] duration-300 pl-4 pr-0 flex items-center" style={{ backgroundImage: !currentSpace && !currentThread && !currentItemId ? "var(--color-paper)" : undefined }}>
                  <div className="flex items-center relative w-full h-full pl-2 pr-0 transition-transform duration-125 min-w-0">
                    <div className="flex-1 min-w-0 overflow-hidden text-left">
                      <span className="text-[var(--color-deep-grey)] font-sans text-[18px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis block text-left">For You</span>
                    </div>
                    <div className="p-[20px] flex-shrink-0">
                      <div className="badge-count bg-[rgba(120,118,111,0.1)] flex items-center justify-center rounded-3xl w-6 h-6">
                        <span className="text-[14px] font-sans font-semibold text-[var(--color-deep-grey)] leading-[0] badge-number">
                          {inboxCount}
                        </span>
                      </div>
                    </div>
                  </div>
                  {!currentSpace && !currentThread && !currentItemId && (
                    <div className="absolute inset-0 pointer-events-none rounded-xl shadow-[0px_-3px_0px_0px_rgba(120,118,111,0.2)_inset]" />
                  )}
                </div>
              </a>
              
              {/* Persistent Navigation Items - Hierarchical Display */}
              {isClient && persistentItems.length > 0 && (
                <>
                  {/* Divider */}
                  <div className="border-t border-gray-200 my-2"></div>
                  
                  {/* Persistent Spaces */}
                  {persistentSpaces.map((space) => {
                    const isActive = space.id === currentActiveItemId;
                    
                    return (
                      <div key={space.id} className="relative group nav-item-container w-full">
                        <a href={`/${space.id}`} className="block w-full" onClick={handleItemClick}>
                          <div 
                            className="relative rounded-xl h-[64px] cursor-pointer transition-[scale,shadow] duration-300 pl-4 pr-0 flex items-center"
                            style={isActive ? {
                              backgroundImage: space.backgroundGradient?.includes('gradient') ? space.backgroundGradient : undefined,
                              backgroundColor: space.backgroundGradient?.includes('gradient') ? undefined : (space.backgroundGradient || undefined)
                            } : {}}
                          >
                            <div className="flex items-center relative w-full h-full pl-2 pr-0 transition-transform duration-125 min-w-0">
                              <div className="flex-1 min-w-0 overflow-hidden text-left">
                                <span className="font-sans text-[18px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis block text-left" style={{ color: getTextColor(space.backgroundGradient, isActive) }}>
                                  {space.title}
                                </span>
                              </div>
                              <div className="p-[20px] flex-shrink-0">
                                <div 
                                  className="badge-count bg-[rgba(120,118,111,0.1)] flex items-center justify-center rounded-3xl w-6 h-6 relative cursor-pointer"
                                  data-close-item={space.id}
                                >
                                  <span className="text-[14px] font-sans font-semibold leading-[0] badge-number" style={{ color: getTextColor(space.backgroundGradient, isActive) }}>
                                    {space.count || 0}
                                  </span>
                                </div>
                              </div>
                            </div>
                            {isActive && (
                              <div className="absolute inset-0 pointer-events-none rounded-xl shadow-[0px_-3px_0px_0px_rgba(120,118,111,0.2)_inset]" />
                            )}
                          </div>
                        </a>
                        {/* Close icon positioned outside the link element, aligned with badge count center */}
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            removeFromNavigationHistory(space.id);
                          }}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                          }}
                          className="close-icon absolute top-1/2 transform -translate-y-1/2 w-6 h-6 cursor-pointer flex items-center justify-center"
                          style={{ 
                            right: '16px',
                            color: getTextColor(space.backgroundGradient, isActive)
                          }}
                          data-item-id={space.id}
                        >
                          <i className="fa-solid fa-xmark"></i>
                        </div>
                      </div>
                    );
                  })}
                  
                  {/* Persistent Threads */}
                  {persistentThreads.map((thread) => {
                    const isActive = thread.id === currentActiveItemId;
                    
                    return (
                      <div key={thread.id} className="relative group nav-item-container w-full">
                        <a href={`/${thread.id}`} className="block w-full" onClick={handleItemClick}>
                          <div 
                            className="relative rounded-xl h-[64px] cursor-pointer transition-[scale,shadow] duration-300 pl-4 pr-0 flex items-center"
                            style={isActive ? {
                              backgroundImage: thread.backgroundGradient?.includes('gradient') ? thread.backgroundGradient : undefined,
                              backgroundColor: thread.backgroundGradient?.includes('gradient') ? undefined : (thread.backgroundGradient || undefined)
                            } : {}}
                          >
                            <div className="flex items-center relative w-full h-full pl-2 pr-0 transition-transform duration-125 min-w-0">
                              <div className="flex-1 min-w-0 overflow-hidden text-left">
                                <span className="font-sans text-[18px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis block text-left" style={{ color: getTextColor(thread.backgroundGradient, isActive) }}>
                                  {thread.title}
                                </span>
                              </div>
                              <div className="p-[20px] flex-shrink-0">
                                <div 
                                  className="badge-count bg-[rgba(120,118,111,0.1)] flex items-center justify-center rounded-3xl w-6 h-6 relative cursor-pointer"
                                  data-close-item={thread.id}
                                >
                                  <span className="text-[14px] font-sans font-semibold leading-[0] badge-number" style={{ color: getTextColor(thread.backgroundGradient, isActive) }}>
                                    {thread.count || 0}
                                  </span>
                                </div>
                              </div>
                            </div>
                            {isActive && (
                              <div className="absolute inset-0 pointer-events-none rounded-xl shadow-[0px_-3px_0px_0px_rgba(120,118,111,0.2)_inset]" />
                            )}
                          </div>
                        </a>
                        {/* Close icon positioned outside the link element, aligned with badge count center */}
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            removeFromNavigationHistory(thread.id);
                          }}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                          }}
                          className="close-icon absolute top-1/2 transform -translate-y-1/2 w-6 h-6 cursor-pointer flex items-center justify-center"
                          style={{ 
                            right: '16px',
                            color: getTextColor(thread.backgroundGradient, isActive)
                          }}
                          data-item-id={thread.id}
                        >
                          <i className="fa-solid fa-xmark"></i>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
              
              {/* Created Spaces */}
              {spaces.length > 0 && (
                <>
                  <div className="border-t border-gray-200 my-2"></div>
                  {spaces.map(space => {
                    const isSpaceActive = currentSpace?.id === space.id;
                    return (
                      <a key={space.id} href={`/${space.id}`} className="block w-full" onClick={handleItemClick}>
                        <div 
                          className="relative rounded-xl h-[64px] cursor-pointer transition-[scale,shadow] duration-300 pl-4 pr-0 flex items-center"
                          style={isSpaceActive ? {
                            backgroundImage: space.backgroundGradient?.includes('gradient') ? space.backgroundGradient : undefined,
                            backgroundColor: space.backgroundGradient?.includes('gradient') ? undefined : (space.backgroundGradient || undefined)
                          } : {}}
                        >
                          <div className="flex items-center relative w-full h-full pl-2 pr-0 transition-transform duration-125 min-w-0">
                            <div className="flex-1 min-w-0 overflow-hidden text-left">
                              <span className="font-sans text-[18px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis block text-left" style={{ color: getTextColor(space.backgroundGradient, isSpaceActive) }}>
                                {space.title}
                              </span>
                            </div>
                            <div className="p-[20px] flex-shrink-0">
                              <div className="badge-count bg-[rgba(120,118,111,0.1)] flex items-center justify-center rounded-3xl w-6 h-6">
                                <span className="text-[14px] font-sans font-semibold leading-[0] badge-number" style={{ color: getTextColor(space.backgroundGradient, isSpaceActive) }}>
                                  {space.totalItemCount}
                                </span>
                              </div>
                            </div>
                          </div>
                          {isSpaceActive && (
                            <div className="absolute inset-0 pointer-events-none rounded-xl shadow-[0px_-3px_0px_0px_rgba(120,118,111,0.2)_inset]" />
                          )}
                        </div>
                      </a>
                    );
                  })}
                </>
              )}
              
              {/* Active Thread (if not in persistent navigation) */}
              {currentThread && !persistentItems.some(item => item.id === currentThread.id) && (
                <>
                  <div className="border-t border-gray-200 my-2"></div>
                  <a href={`/${currentThread.id}`} className="block w-full" onClick={handleItemClick}>
                    <div 
                      className="relative rounded-xl h-[64px] cursor-pointer transition-[scale,shadow] duration-300 pl-4 pr-0 flex items-center"
                      style={{
                        backgroundImage: currentThread.backgroundGradient?.includes('gradient') ? currentThread.backgroundGradient : undefined,
                        backgroundColor: currentThread.backgroundGradient?.includes('gradient') ? undefined : (currentThread.backgroundGradient || undefined)
                      }}
                    >
                      <div className="flex items-center relative w-full h-full pl-2 pr-0 transition-transform duration-125 min-w-0">
                        <div className="flex-1 min-w-0 overflow-hidden text-left">
                          <span className="font-sans text-[18px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis block text-left" style={{ color: getTextColor(currentThread.backgroundGradient, true) }}>
                            {currentThread.title}
                          </span>
                        </div>
                        <div className="p-[20px] flex-shrink-0">
                          <div className="badge-count bg-[rgba(120,118,111,0.1)] flex items-center justify-center rounded-3xl w-6 h-6">
                            <span className="text-[14px] font-sans font-semibold leading-[0] badge-number" style={{ color: getTextColor(currentThread.backgroundGradient, true) }}>
                              {currentThread.noteCount}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="absolute inset-0 pointer-events-none rounded-xl shadow-[0px_-3px_0px_0px_rgba(120,118,111,0.2)_inset]" />
                    </div>
                  </a>
                </>
              )}
              
              {/* New Space Button */}
              <div className="border-t border-gray-200 my-2"></div>
              <div className="block w-full cursor-not-allowed pointer-events-none">
                <div className="flex items-center justify-between p-2 rounded hover:bg-gray-50">
                  <span className="text-sm font-medium text-[var(--color-deep-grey)] opacity-60">New Space</span>
                  <svg className="w-4 h-4 text-[var(--color-deep-grey)] opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                  </svg>
                </div>
              </div>
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
      
      {/* Add CSS for hover states matching desktop pattern - only when close icon exists */}
      <style jsx>{`
        .nav-item-container:has(.close-icon) .badge-count:hover .badge-number {
          display: none !important;
        }
        .nav-item-container:has(.close-icon) .badge-count:hover {
          background-color: transparent !important;
        }
        .nav-item-container:has(.close-icon) .badge-count:hover .close-icon {
          display: flex !important;
        }
        .nav-item-container .close-icon {
          display: none;
        }
      `}</style>
    </div>
  );
};

export default MobileNavigation;
