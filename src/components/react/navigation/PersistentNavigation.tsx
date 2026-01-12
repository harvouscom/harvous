import React, { useEffect, useState } from 'react';
import { useNavigation } from './NavigationContext';
import SpaceButton from './SpaceButton';
import Icon from '../Icon';
import { debug } from '@/utils/logger';

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
    let timeoutRef: ReturnType<typeof setTimeout> | null = null;
    
    const handlePageLoad = () => {
      if (timeoutRef) clearTimeout(timeoutRef);
      requestAnimationFrame(() => {
        setRenderKey(prev => prev + 1);
      });
    };
    
    const handleNavigationUpdate = () => {
      if (timeoutRef) clearTimeout(timeoutRef);
      timeoutRef = setTimeout(() => {
        setRenderKey(prev => prev + 1);
      }, 50);
    };

    document.addEventListener('astro:page-load', handlePageLoad);
    window.addEventListener('navigationHistoryUpdated', handleNavigationUpdate);
    
    return () => {
      if (timeoutRef) clearTimeout(timeoutRef);
      document.removeEventListener('astro:page-load', handlePageLoad);
      window.removeEventListener('navigationHistoryUpdated', handleNavigationUpdate);
    };
  }, []);
  
  const currentActiveItemId = typeof window !== 'undefined' ? getCurrentActiveItemId() : '';
  
  const getPersistentItems = () => {
    if (typeof window === 'undefined') return [];
    
    // CRITICAL: Filter out items with invalid IDs (undefined, null, empty string)
    // This prevents navigation to invalid URLs like /undefined
    let persistentItems = navigationHistory.filter((item) => {
      // Validate item has a valid ID
      if (!item || !item.id || typeof item.id !== 'string' || item.id.trim() === '') {
        console.warn('[PersistentNavigation] Filtering out item with invalid ID:', item);
        return false;
      }
      
      if (item.id === 'dashboard') return false;
      return true;
    });
    
    persistentItems = persistentItems.filter((item) => {
      if (item.id === 'thread_unorganized') {
        const isClosed = localStorage.getItem('unorganized-thread-closed') === 'true';
        if (isClosed && currentActiveItemId === 'thread_unorganized') {
          localStorage.removeItem('unorganized-thread-closed');
          return true;
        }
        return !isClosed;
      }
      return true;
    });

    return persistentItems;
  };

  const persistentItems = getPersistentItems();

  // Debug logging for navigation state (development only)
  useEffect(() => {
    debug('[PersistentNavigation] Component state', {
      navigationHistoryLength: navigationHistory.length,
      persistentItemsCount: persistentItems.length,
      contextValueExists: !!contextValue
    });
  }, [navigationHistory, persistentItems, contextValue]);


  if (persistentItems.length === 0) {
    return null;
  }

  // Debug: Log persistent items (development only)
  if (typeof window !== 'undefined') {
    debug('[PersistentNavigation] Rendering persistent items', {
      items: persistentItems.map(item => ({
        id: item.id,
        title: item.title
      }))
    });
  }

  return (
    <div id="persistent-navigation" key={renderKey} className="persistent-nav">
      {persistentItems.map((item) => {
        const isActive = item.id === currentActiveItemId;
        
        const handleClick = (e: React.MouseEvent) => {
          // CRITICAL: Validate item.id before ANY navigation
          if (!item.id || typeof item.id !== 'string' || item.id.trim() === '') {
            console.error('[PersistentNavigation] CRITICAL: Invalid item.id - blocking navigation:', {
              item: item,
              itemId: item.id,
              itemTitle: item.title,
              itemIdType: typeof item.id
            });
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          
          // CRITICAL: Validate item.id format - must be thread_, space_, or note_
          if (!item.id.startsWith('thread_') && !item.id.startsWith('space_') && !item.id.startsWith('note_')) {
            console.error('[PersistentNavigation] CRITICAL: Invalid item.id format - blocking navigation:', {
              itemId: item.id,
              itemTitle: item.title,
              startsWithThread: item.id.startsWith('thread_'),
              startsWithSpace: item.id.startsWith('space_'),
              startsWithNote: item.id.startsWith('note_')
            });
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          
          const currentPath = window.location.pathname;
          const currentItemId = currentPath.startsWith('/') ? currentPath.substring(1) : currentPath;
          
          // If we're already on the thread/space page, do nothing
          if (currentItemId === item.id) {
            e.preventDefault();
            return;
          }
          
          // Always navigate directly to the thread/space
          e.preventDefault();
          e.stopPropagation();
          
          const navigationUrl = `/${item.id}`;
          
          // CRITICAL: Double-check the URL is valid before allowing navigation
          if (!navigationUrl || navigationUrl.includes('undefined') || navigationUrl === '/') {
            console.error('[PersistentNavigation] CRITICAL: Invalid navigation URL - blocking navigation:', {
              navigationUrl: navigationUrl,
              itemId: item.id,
              itemTitle: item.title
            });
            return;
          }
          
          // Navigate directly to the thread/space
          window.location.href = navigationUrl;
        };
        
        // Skip rendering if item.id is invalid (shouldn't happen due to filter, but double-check)
        // CRITICAL: This prevents href from being set to /undefined which causes navigation failures
        if (!item.id || typeof item.id !== 'string' || item.id.trim() === '') {
          console.error('[PersistentNavigation] Skipping render for item with invalid ID:', {
            item: item,
            itemId: item.id,
            itemTitle: item.title,
            itemType: typeof item.id
          });
          return null;
        }
        
        // CRITICAL: Double-check item.id is valid before rendering
        // This is the final safety check before creating the href
        if (!item.id || typeof item.id !== 'string' || item.id.trim() === '') {
          console.error('[PersistentNavigation] CRITICAL: Skipping render - item.id is invalid:', {
            item: item,
            itemId: item.id,
            itemTitle: item.title
          });
          return null;
        }
        
        // CRITICAL: Validate format before creating href
        if (!item.id.startsWith('thread_') && !item.id.startsWith('space_') && !item.id.startsWith('note_')) {
          console.error('[PersistentNavigation] CRITICAL: Skipping render - item.id has invalid format:', {
            itemId: item.id,
            itemTitle: item.title
          });
          return null;
        }
        
        // CRITICAL: Ensure href is always valid - never set to /undefined
        const validHref = `/${item.id}`;
        
        return (
          <div key={item.id} data-navigation-item={item.id} className="nav-item-container">
            <div className="nav-item-wrapper">
              <a
                href={validHref}
                className="nav-link"
                onClick={handleClick}
              >
                <SpaceButton
                  text={item.title}
                  count={item.count || 0}
                  state="WithCount"
                  backgroundGradient={item.backgroundGradient || "var(--color-paper)"}
                  isActive={isActive}
                  itemId={item.id}
                />
              </a>
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
                className="close-icon"
                data-item-id={item.id}
                aria-label={`Close ${item.title || 'item'}`}
              >
                <Icon name="xmark" size="14px" style={{ color: 'var(--color-deep-grey)' }} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default PersistentNavigation;
