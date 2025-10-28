import React, { useEffect, useState } from 'react';
import { useNavigation } from './NavigationContext';

interface MobileDropdownProps {
  spaces?: any[];
  threads?: any[];
  inboxCount?: number;
  currentSpace?: any;
  currentThread?: any;
  isOpen: boolean;
  onClose: () => void;
}

const MobileDropdown: React.FC<MobileDropdownProps> = ({
  spaces = [],
  threads = [],
  inboxCount = 0,
  currentSpace,
  currentThread,
  isOpen,
  onClose
}) => {
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

  if (!isOpen) return null;

  return (
    <div 
      className="absolute top-full left-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-[9999]"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="p-2">
        {/* For You */}
        <a href="/dashboard" className="block w-full" onClick={onClose}>
          <div className="flex items-center justify-between p-2 rounded hover:bg-gray-50">
            <span className="text-sm font-medium">For You</span>
            <span className="text-xs text-gray-500">{inboxCount}</span>
          </div>
        </a>
        
        {/* Spaces */}
        {spaces.map(space => (
          <a key={space.id} href={`/${space.id}`} className="block w-full" onClick={onClose}>
            <div className="flex items-center justify-between p-2 rounded hover:bg-gray-50">
              <span className="text-sm font-medium">{space.title}</span>
              <span className="text-xs text-gray-500">{space.totalItemCount}</span>
            </div>
          </a>
        ))}
        
        {/* Threads (context-aware) */}
        {currentThread && (
          <a href={`/${currentThread.id}`} className="block w-full" onClick={onClose}>
            <div className="flex items-center justify-between p-2 rounded hover:bg-gray-50 bg-blue-50">
              <span className="text-sm font-medium">{currentThread.title}</span>
              <span className="text-xs text-blue-600">{currentThread.noteCount}</span>
            </div>
          </a>
        )}
        
        {currentSpace && threads.length > 0 && (
          threads.filter(thread => thread.spaceId === currentSpace.id).map(thread => (
            <a key={thread.id} href={`/${thread.id}`} className="block w-full" onClick={onClose}>
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
                  <a href={`/${item.id}`} className="block w-full" onClick={onClose}>
                    <div className="flex items-center justify-between p-2 rounded hover:bg-gray-50">
                      <span className="text-sm font-medium">{item.title}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">{item.count || 0}</span>
                        {/* Close icon - only show for inactive items */}
                        {!isActive && (
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              removeFromNavigationHistory(item.id);
                            }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-600"
                            title="Close"
                          >
                            <i className="fa-solid fa-xmark text-xs"></i>
                          </button>
                        )}
                      </div>
                    </div>
                  </a>
                </div>
              );
            })}
          </>
        )}
        
        {/* New Space Button */}
        <a href="/new-space" className="block w-full" onClick={onClose}>
          <div className="flex items-center justify-between p-2 rounded hover:bg-gray-50">
            <span className="text-sm font-medium text-blue-600">New Space</span>
            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
            </svg>
          </div>
        </a>
      </div>
    </div>
  );
};

export default MobileDropdown;
