import React, { useEffect, useState } from 'react';
import { useNavigation } from './NavigationContext';
import SpaceButton from './SpaceButton';

const PersistentNavigation: React.FC = () => {
  const { navigationHistory, removeFromNavigationHistory } = useNavigation();
  const [isClient, setIsClient] = useState(false);

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

  // Don't render anything during SSR
  if (!isClient || persistentItems.length === 0) {
    return null;
  }

  return (
    <div id="persistent-navigation" className="flex flex-col items-start justify-start w-full">
      {persistentItems.map((item) => {
        // Check if this item is currently active (either directly or as parent of a note)
        const isActive = item.id === currentActiveItemId;
        
        return (
          <div key={item.id} data-navigation-item={item.id} className="w-full nav-item-container">
            <a href={`/${item.id}`} className="w-full relative block">
              <SpaceButton
                text={item.title}
                count={item.count || 0}
                state="Close"
                className="w-full"
                backgroundGradient={item.backgroundGradient}
                isActive={isActive}
                itemId={item.id}
              />
            </a>
          </div>
        );
      })}
      
      {/* Add CSS for hover states and active shadow */}
      <style jsx>{`
        .nav-item-container:not(.active):hover .badge-count {
          display: none !important;
        }
        .nav-item-container:not(.active):hover .close-icon {
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
