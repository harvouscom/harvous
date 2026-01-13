import React, { useEffect, useSyncExternalStore } from 'react';
import { useNavigation } from './NavigationContext';
import SpaceButton from './SpaceButton';
import Icon from '../Icon';
import { debug } from '@/utils/logger';

// Storage key for navigation history
const STORAGE_KEY = 'harvous-navigation-history-v2';

// Global listeners set - managed per component instance to survive View Transitions
const navigationListeners = new Set<() => void>();
let globalListenersInitialized = false;

// Notify all subscribers when navigation changes
function notifyNavigationChange() {
  console.log('[PersistentNavigation] notifyNavigationChange called, listeners:', navigationListeners.size);
  navigationListeners.forEach(listener => {
    try {
      listener();
    } catch (e) {
      console.error('[PersistentNavigation] Error calling listener:', e);
    }
  });
}

// Initialize global event listeners (called from component to ensure they're set up)
function initGlobalListeners() {
  if (globalListenersInitialized || typeof window === 'undefined') return;
  globalListenersInitialized = true;

  console.log('[PersistentNavigation] Initializing global event listeners');

  // Listen for our custom navigation update event
  window.addEventListener('navigationHistoryUpdated', () => {
    console.log('[PersistentNavigation] Global: navigationHistoryUpdated event received');
    notifyNavigationChange();
  });

  // Listen for Astro page loads
  document.addEventListener('astro:page-load', () => {
    console.log('[PersistentNavigation] Global: astro:page-load event received');
    // Small delay to ensure localStorage is updated
    setTimeout(() => {
      notifyNavigationChange();
    }, 50);
  });

  // Listen for storage events from other tabs
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) {
      console.log('[PersistentNavigation] Global: storage event received');
      notifyNavigationChange();
    }
  });
}

// Subscribe function for useSyncExternalStore
function subscribeToNavigation(callback: () => void) {
  // Ensure global listeners are initialized when first subscriber registers
  initGlobalListeners();

  navigationListeners.add(callback);
  console.log('[PersistentNavigation] Subscribed to navigation, total listeners:', navigationListeners.size);
  return () => {
    navigationListeners.delete(callback);
    console.log('[PersistentNavigation] Unsubscribed from navigation, total listeners:', navigationListeners.size);
  };
}

// Get snapshot of navigation data from localStorage
// IMPORTANT: This must return a different string value when data changes for React to re-render
function getNavigationSnapshot(): string {
  if (typeof window === 'undefined') return '[]';
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const result = stored || '[]';
    console.log('[PersistentNavigation] getNavigationSnapshot called, length:', result.length);
    return result;
  } catch {
    return '[]';
  }
}

// Server snapshot for SSR
function getServerSnapshot(): string {
  return '[]';
}

const PersistentNavigation: React.FC = () => {
  console.log('[PersistentNavigation] ===== Component rendering, timestamp:', Date.now());
  const contextValue = useNavigation();
  const { removeFromNavigationHistory, getCurrentActiveItemId } = contextValue;

  // Use useSyncExternalStore to properly subscribe to localStorage changes
  // This is the React 18+ recommended pattern for external stores
  const navigationDataString = useSyncExternalStore(
    subscribeToNavigation,
    getNavigationSnapshot,
    getServerSnapshot
  );

  console.log('[PersistentNavigation] navigationDataString length:', navigationDataString.length);

  // Parse the navigation data
  const navigationItems = React.useMemo(() => {
    try {
      const parsed = JSON.parse(navigationDataString);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [navigationDataString]);

  console.log('[PersistentNavigation] navigationItems count:', navigationItems.length);

  const currentActiveItemId = typeof window !== 'undefined' ? getCurrentActiveItemId() : '';

  // Filter items for display
  const persistentItems = React.useMemo(() => {
    // Filter out invalid items
    let filtered = navigationItems.filter((item: any) => {
      if (!item || !item.id || typeof item.id !== 'string' || item.id.trim() === '') {
        console.warn('[PersistentNavigation] Filtering out item with invalid ID:', item);
        return false;
      }
      if (item.id === 'dashboard') return false;
      return true;
    });

    // Handle unorganized thread
    filtered = filtered.filter((item: any) => {
      if (item.id === 'thread_unorganized') {
        const isClosed = typeof window !== 'undefined' && localStorage.getItem('unorganized-thread-closed') === 'true';
        if (isClosed && currentActiveItemId === 'thread_unorganized') {
          if (typeof window !== 'undefined') {
            localStorage.removeItem('unorganized-thread-closed');
          }
          return true;
        }
        return !isClosed;
      }
      return true;
    });

    console.log('[PersistentNavigation] Filtered items:', filtered.map((i: any) => ({ id: i.id, title: i.title })));
    return filtered;
  }, [navigationItems, currentActiveItemId]);

  // Debug logging for navigation state (development only)
  useEffect(() => {
    debug('[PersistentNavigation] Component state', {
      navigationItemsCount: navigationItems.length,
      persistentItemsCount: persistentItems.length,
      contextValueExists: !!contextValue
    });
  }, [navigationItems, persistentItems, contextValue]);


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
    <div id="persistent-navigation" className="persistent-nav">
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
