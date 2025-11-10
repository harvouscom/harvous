import React, { useEffect, useState, useRef } from 'react';
import { useNavigation } from './NavigationContext';
import SpaceButton from './SpaceButton';

const PersistentNavigation: React.FC = () => {
  // Log component render to verify it's mounting
  if (typeof window !== 'undefined') {
    console.warn('🟡 [PersistentNavigation] Component rendering:', {
      pathname: window.location.pathname,
      timestamp: new Date().toISOString()
    });
  }
  
  const contextValue = useNavigation();
  const { navigationHistory, removeFromNavigationHistory, getCurrentActiveItemId } = contextValue;
  const [isClient, setIsClient] = useState(false);
  const [currentItemId, setCurrentItemId] = useState('');
  const [renderKey, setRenderKey] = useState(0);
  // Force re-render when navigationHistory changes
  useEffect(() => {
    setRenderKey(prev => prev + 1);
  }, [navigationHistory]);

  // Handle SSR - only run client-side code after hydration
  useEffect(() => {
    setIsClient(true);
    setCurrentItemId(window.location.pathname.substring(1));
  }, []);

  // Force re-render on navigation to update active states
  // With transition:persist, component persists but we need to force re-renders
  const [renderTrigger, setRenderTrigger] = useState(0);
  const pathnameRef = useRef<string>('');
  
  // Force re-render when pathname changes
  useEffect(() => {
    if (!isClient) return;
    
    // Initialize pathname ref
    pathnameRef.current = window.location.pathname;
    
    const forceRerender = () => {
      const currentPathname = window.location.pathname;
      // Always update, even if pathname is the same, to ensure re-render
      setRenderTrigger(prev => {
        const newValue = prev + 1;
        console.warn('🟡 [PersistentNavigation] Forcing re-render:', {
          pathname: currentPathname,
          triggerValue: newValue,
          timestamp: new Date().toISOString()
        });
        return newValue;
      });
      pathnameRef.current = currentPathname;
    };
    
    const handlePageLoad = () => {
      const currentPathname = window.location.pathname;
      console.warn('🟡 [PersistentNavigation] astro:page-load fired:', {
        pathname: currentPathname,
        previousPathname: pathnameRef.current
      });
      // Update current item ID when page changes
      const newItemId = currentPathname === '/' ? '' : currentPathname.substring(1);
      setCurrentItemId(newItemId);
      // Force re-render immediately and with multiple delays to catch timing issues
      forceRerender();
      setTimeout(forceRerender, 5);
      setTimeout(forceRerender, 25);
      setTimeout(forceRerender, 50);
      setTimeout(forceRerender, 100);
      setTimeout(forceRerender, 200);
    };
    
    // Listen for navigation history updates from validation
    const handleNavigationUpdate = () => {
      setRenderKey(prev => prev + 1);
    };
    
    // Also listen for popstate (browser back/forward)
    const handlePopState = () => {
      console.warn('🟡 [PersistentNavigation] popstate fired:', {
        pathname: window.location.pathname
      });
      setTimeout(forceRerender, 5);
      setTimeout(forceRerender, 25);
      setTimeout(forceRerender, 50);
    };
    
    // More aggressive polling - check every 50ms and always force update if pathname changed
    const intervalId = setInterval(() => {
      const currentPathname = window.location.pathname;
      if (currentPathname !== pathnameRef.current) {
        console.warn('🟡 [PersistentNavigation] Polling detected pathname change:', {
          from: pathnameRef.current,
          to: currentPathname
        });
        forceRerender();
      }
    }, 50);

    document.addEventListener('astro:page-load', handlePageLoad);
    window.addEventListener('navigationHistoryUpdated', handleNavigationUpdate);
    window.addEventListener('popstate', handlePopState);
    
    return () => {
      document.removeEventListener('astro:page-load', handlePageLoad);
      window.removeEventListener('navigationHistoryUpdated', handleNavigationUpdate);
      window.removeEventListener('popstate', handlePopState);
      clearInterval(intervalId);
    };
  }, [isClient]);
  
  // Compute active item ID directly from pathname on every render
  // This ensures it's always current, regardless of state updates
  const getCurrentActiveItemIdFromPath = (): string => {
    if (!isClient || typeof window === 'undefined') return '';
    const pathname = window.location.pathname;
    const pathId = pathname === '/' ? '' : (pathname.startsWith('/') ? pathname.substring(1) : pathname);
    
    // For note pages, use getCurrentActiveItemId to get parent thread
    if (pathId.startsWith('note_')) {
      return getCurrentActiveItemId();
    }
    return pathId;
  };
  
  const currentActiveItemId = getCurrentActiveItemIdFromPath();
  
  // Filter out items that shouldn't be shown in persistent navigation
  const getPersistentItems = () => {
    if (!isClient) return [];
    
    let persistentItems = navigationHistory.filter((item) => {
      // Show all items, including active ones, so close icons can appear on hover
      // This allows users to close active items by hovering over the badge count
      
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

  // Debug: Log active state for persistent items
  useEffect(() => {
    if (!isClient) return;
    
    const activeId = getCurrentActiveItemId();
    console.warn('🟠 [PersistentNavigation] Active state for items:', {
      currentActiveItemId: activeId,
      pathname: window.location.pathname,
      persistentItemsCount: persistentItems.length,
      items: persistentItems.map(item => ({
        id: item.id,
        title: item.title,
        isActive: item.id === activeId
      })),
      timestamp: new Date().toISOString()
    });
  }, [isClient, currentActiveItemId, persistentItems, getCurrentActiveItemId]);

  // Don't render anything during SSR or if no items to show
  if (!isClient || persistentItems.length === 0) {
    return null;
  }

  return (
    <div id="persistent-navigation" key={renderKey} className="flex flex-col items-start justify-start w-full">
      {persistentItems.map((item) => {
        // Check if this item is currently active (either directly or as parent of a note)
        const isActive = item.id === currentActiveItemId;
        
        return (
          <div key={item.id} data-navigation-item={item.id} className="w-full nav-item-container">
            <div className="relative w-full">
              <a href={`/${item.id}`} className="w-full relative block">
                <SpaceButton
                  text={item.title}
                  count={item.count || 0}
                  state="WithCount"
                  className="w-full"
                  backgroundGradient={item.backgroundGradient}
                  isActive={isActive}
                  itemId={item.id}
                />
              </a>
              {/* Close icon positioned outside the link element, aligned with badge count center */}
              {/* Show close icon for all items (active items can be closed too) */}
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  removeFromNavigationHistory(item.id);
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                className="close-icon absolute top-1/2 transform -translate-y-1/2 w-6 h-6 cursor-pointer flex items-center justify-center"
                style={{ right: '16px' }} // Move 16px left to align with badge count center
                data-item-id={item.id}
              >
                <i className="fa-solid fa-xmark text-[var(--color-deep-grey)]"></i>
              </div>
            </div>
          </div>
        );
      })}
      
      {/* Add CSS for hover states and active shadow */}
      <style>{`
        .nav-item-container:has(.close-icon) .badge-count:hover .badge-number {
          display: none !important;
        }
        .nav-item-container:has(.close-icon) .badge-count:hover {
          background-color: transparent !important;
        }
        .nav-item-container:has(.close-icon) .badge-count:hover .close-icon {
          display: flex !important;
        }
        .close-icon {
          display: none;
        }
        .space-button[style*="background-image"] {
          /* Shadow removed - handled by global CSS */
        }
      `}</style>
    </div>
  );
};

export default PersistentNavigation;
