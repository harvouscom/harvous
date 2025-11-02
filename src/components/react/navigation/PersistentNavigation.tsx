import React, { useEffect, useState } from 'react';
import { useNavigation } from './NavigationContext';
import SpaceButton from './SpaceButton';

const PersistentNavigation: React.FC = () => {
  const { navigationHistory, removeFromNavigationHistory, getCurrentActiveItemId } = useNavigation();
  const [isClient, setIsClient] = useState(false);
  const [currentItemId, setCurrentItemId] = useState('');

  console.log('🧭 PersistentNavigation: Component function called');
  console.log('🧭 PersistentNavigation: navigationHistory:', navigationHistory);
  console.log('🧭 PersistentNavigation: isClient:', isClient);

  // Handle SSR - only run client-side code after hydration
  useEffect(() => {
    setIsClient(true);
    setCurrentItemId(window.location.pathname.substring(1));
    console.log('🧭 PersistentNavigation: Client-side hydration complete');
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
  
  // Use the context's getCurrentActiveItemId function for consistency
  const currentActiveItemId = isClient ? getCurrentActiveItemId() : '';
  
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

  // Don't render anything during SSR or if no items to show
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
                  console.log('🧭 React close icon clicked for item:', item.id);
                  console.log('🧭 Current active item ID (before removal):', currentActiveItemId);
                  console.log('🧭 Item matches active?', item.id === currentActiveItemId);
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
