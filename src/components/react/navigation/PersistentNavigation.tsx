import React, { useEffect, useState } from 'react';
import { useNavigation } from './NavigationContext';
import SpaceButton from './SpaceButton';
import Icon from '../Icon';
import { handleBreadcrumbNavigation } from '@/utils/navigation-breadcrumb';

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

  if (persistentItems.length === 0) {
    return null;
  }

  // Debug: Log all persistent items to see what's in navigation history
  if (typeof window !== 'undefined') {
    console.log('[PersistentNavigation] Rendering persistent items:', persistentItems.map(item => ({
      id: item.id,
      title: item.title,
      idType: typeof item.id,
      idValid: item.id && typeof item.id === 'string' && item.id.trim() !== ''
    })));
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
          const isOnNotePage = currentItemId.startsWith('note_');
          
          // ONLY use breadcrumb navigation if we're on a note page AND the note belongs to this thread
          // Otherwise, use normal link navigation (let href work)
          if (isOnNotePage) {
            // Check if note belongs to this thread
            const noteElement = document.querySelector('[data-note-id]') as HTMLElement;
            const parentThreadId = noteElement?.dataset.parentThreadId;
            
            // CRITICAL: Only use breadcrumb if parentThreadId matches AND is valid
            if (parentThreadId && parentThreadId === item.id && 
                (parentThreadId.startsWith('thread_') || parentThreadId.startsWith('space_'))) {
              // We're in breadcrumb context - use breadcrumb navigation
              e.preventDefault();
              e.stopPropagation();
              
              console.log('[PersistentNavigation] Using breadcrumb navigation:', {
                itemId: item.id,
                itemTitle: item.title,
                currentItemId: currentItemId,
                parentThreadId: parentThreadId
              });
              
              handleBreadcrumbNavigation(item.id);
              return;
            }
          }
          
          // NOT in breadcrumb context - use normal link navigation
          // DO NOT preventDefault - let the href attribute handle navigation
          // This is the original working behavior before breadcrumb was added
          console.log('[PersistentNavigation] Using normal link navigation (href):', {
            itemId: item.id,
            itemTitle: item.title,
            currentItemId: currentItemId,
            isOnNotePage: isOnNotePage,
            href: `/${item.id}`
          });
          
          // Explicitly allow default link behavior - don't prevent it
          // The href will navigate normally, just like before breadcrumb was added
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
                data-astro-prefetch="hover"
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
