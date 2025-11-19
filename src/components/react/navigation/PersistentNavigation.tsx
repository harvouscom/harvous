import React, { useEffect, useState } from 'react';
import { useNavigation } from './NavigationContext';
import SpaceButton from './SpaceButton';

const PersistentNavigation: React.FC = () => {
  const contextValue = useNavigation();
  const { navigationHistory, removeFromNavigationHistory, getCurrentActiveItemId } = contextValue;
  const [renderKey, setRenderKey] = useState(0);
  
  // Force re-render when navigationHistory changes
  useEffect(() => {
    setRenderKey(prev => prev + 1);
  }, [navigationHistory]);

  // Listen for page changes to update current item
  useEffect(() => {
    const handlePageLoad = () => {
      // Re-render when page changes to re-evaluate active state
      setRenderKey(prev => prev + 1);
    };
    
    // Listen for navigation history updates from validation
    const handleNavigationUpdate = () => {
      setRenderKey(prev => prev + 1);
    };

    document.addEventListener('astro:page-load', handlePageLoad);
    window.addEventListener('navigationHistoryUpdated', handleNavigationUpdate);
    
    return () => {
      document.removeEventListener('astro:page-load', handlePageLoad);
      window.removeEventListener('navigationHistoryUpdated', handleNavigationUpdate);
    };
  }, []);
  
  // Use the context's getCurrentActiveItemId function for consistency
  const currentActiveItemId = typeof window !== 'undefined' ? getCurrentActiveItemId() : '';
  
  // Filter out items that shouldn't be shown in persistent navigation
  const getPersistentItems = () => {
    if (typeof window === 'undefined') return [];
    
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

  // Don't render anything if no items to show
  if (persistentItems.length === 0) {
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
                  backgroundGradient={item.backgroundGradient || "var(--color-paper)"}
                  isActive={isActive}
                  itemId={item.id}
                />
              </a>
              {/* Close icon positioned outside the link element, aligned with badge count center */}
              {/* Show close icon for all items (active items can be closed too) */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  removeFromNavigationHistory(item.id);
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                className="close-icon absolute top-1/2 transform -translate-y-1/2 w-6 h-6 cursor-pointer flex items-center justify-center bg-transparent border-none p-0"
                style={{ right: '16px' }} // Move 16px left to align with badge count center
                data-item-id={item.id}
                aria-label={`Close ${item.title || 'item'}`}
              >
                <i className="fa-solid fa-xmark text-[var(--color-deep-grey)]" aria-hidden="true"></i>
              </button>
            </div>
          </div>
        );
      })}
      
      {/* Add CSS for hover states and active shadow */}
      <style>{`
        /* Close icon hover states - only for inactive items that have a close icon (itemId) */
        .nav-item-container:not(.active):has(.close-icon) .badge-count {
          position: relative;
        }
        .nav-item-container:not(.active):has(.close-icon) .badge-number {
          opacity: 1;
          transition: opacity 0.2s ease-out;
        }
        .nav-item-container:not(.active):has(.close-icon) .badge-count:hover .badge-number {
          opacity: 0;
        }
        .nav-item-container:not(.active):has(.close-icon) .close-icon {
          display: none;
          opacity: 0;
          transition: opacity 0.2s ease-out;
        }
        .nav-item-container:not(.active):has(.close-icon) .badge-count:hover .close-icon {
          display: flex !important;
          opacity: 1;
        }
        .space-button[style*="background-image"] {
          /* Shadow removed - handled by global CSS */
        }
      `}</style>
    </div>
  );
};

export default PersistentNavigation;
