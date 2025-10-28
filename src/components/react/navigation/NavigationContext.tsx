import React, { createContext, useContext, useEffect, useState } from 'react';

// Navigation item interface
export interface NavigationItem {
  id: string;
  title: string;
  count?: number;
  backgroundGradient?: string;
  firstAccessed: number;
  lastAccessed: number;
}

// Navigation context interface
interface NavigationContextType {
  navigationHistory: NavigationItem[];
  addToNavigationHistory: (item: Omit<NavigationItem, 'firstAccessed' | 'lastAccessed'>) => void;
  removeFromNavigationHistory: (itemId: string) => void;
  trackNavigationAccess: () => void;
  refreshNavigation: () => void;
}

// Create the context with default SSR-safe values
const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

// Default context value for SSR
const defaultContextValue: NavigationContextType = {
  navigationHistory: [],
  addToNavigationHistory: () => {},
  removeFromNavigationHistory: () => {},
  trackNavigationAccess: () => {},
  refreshNavigation: () => {}
};

// Provider component
export const NavigationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [navigationHistory, setNavigationHistory] = useState<NavigationItem[]>([]);

  // Storage utility with localStorage fallback to sessionStorage
  const getStorage = () => {
    try {
      // Test localStorage first
      const testKey = 'test-storage-' + Date.now();
      localStorage.setItem(testKey, 'test');
      const retrieved = localStorage.getItem(testKey);
      localStorage.removeItem(testKey);
      
      if (retrieved === 'test') {
        return localStorage;
      } else {
        throw new Error('localStorage test failed');
      }
    } catch (error) {
      return sessionStorage;
    }
  };

  // Get navigation history from storage
  const getNavigationHistory = (): NavigationItem[] => {
    // Handle SSR - return empty array if not in browser
    if (typeof window === 'undefined') {
      return [];
    }
    
    try {
      const storage = getStorage();
      const stored = storage.getItem('harvous-navigation-history-v2');
      
      let parsed = stored ? JSON.parse(stored) : [];
      
      // If localStorage is empty but we have a backup, use it
      if (parsed.length === 0 && (window as any).navigationHistoryBackup && (window as any).navigationHistoryBackup.length > 0) {
        parsed = (window as any).navigationHistoryBackup;
      }
      
      // Filter out specific test items (exact title matches only)
      const testItemTitles = ['Test Space', 'Test Close Icon', 'Test Immediate Nav', 'Test Event Dispatch'];
      const filteredItems = parsed.filter(item => 
        !testItemTitles.includes(item.title)
      );
      
      return filteredItems;
    } catch (error) {
      console.error('Error getting navigation history:', error);
      const backup = (window as any).navigationHistoryBackup || [];
      
      // Filter out specific test items from backup too (exact title matches only)
      const testItemTitles = ['Test Space', 'Test Close Icon', 'Test Immediate Nav', 'Test Event Dispatch'];
      const filteredBackup = backup.filter(item => 
        !testItemTitles.includes(item.title)
      );
      
      return filteredBackup;
    }
  };

  // Save navigation history to storage
  const saveNavigationHistory = (history: NavigationItem[]) => {
    // Handle SSR - do nothing if not in browser
    if (typeof window === 'undefined') {
      return;
    }
    
    try {
      const storage = getStorage();
      const jsonString = JSON.stringify(history);
      storage.setItem('harvous-navigation-history-v2', jsonString);
      
      // Also update the backup
      (window as any).navigationHistoryBackup = [...history];
      
      // Verify the save worked
      const verification = storage.getItem('harvous-navigation-history-v2');
      
      if (verification !== jsonString) {
        console.error('💾 saveNavigationHistory - SAVE FAILED! Data mismatch');
      }
    } catch (error) {
      console.error('Error saving navigation history:', error);
    }
  };

  // Add item to navigation history
  const addToNavigationHistory = (item: Omit<NavigationItem, 'firstAccessed' | 'lastAccessed'>) => {
    // Skip specific test items (exact title matches only)
    const testItemTitles = ['Test Space', 'Test Close Icon', 'Test Immediate Nav', 'Test Event Dispatch'];
    if (testItemTitles.includes(item.title)) {
      console.log('🧭 Skipping test item from navigation history:', item.title);
      return;
    }
    
    const history = getNavigationHistory();
    
    // Check if item already exists - use strict equality check
    const existingIndex = history.findIndex(h => h.id === item.id);
    
    if (existingIndex !== -1) {
      // Item already exists - update lastAccessed time but keep position
      console.log('🧭 Item already exists, updating lastAccessed:', item.id);
      history[existingIndex] = {
        ...history[existingIndex],
        ...item,
        lastAccessed: Date.now()
      };
    } else {
      // Item doesn't exist - this could be first time opening or reopening after being closed
      // For now, we'll add to the end (first time opening behavior)
      // TODO: In the future, we could track closed items to detect true reopening
      console.log('🧭 Adding new item to history (first time):', item.id);
      const newItem: NavigationItem = {
        ...item,
        firstAccessed: Date.now(),
        lastAccessed: Date.now()
      };
      history.push(newItem); // Add to end for first time opening
    }
    
    // Sort by firstAccessed to maintain chronological order
    // This ensures the order is consistent between React and Astro
    history.sort((a, b) => a.firstAccessed - b.firstAccessed);
    
    // Remove any duplicates by ID (defensive programming)
    const uniqueHistory = history.reduce((acc, current) => {
      const existingItem = acc.find(item => item.id === current.id);
      if (!existingItem) {
        acc.push(current);
      } else {
        // Keep the one with the most recent lastAccessed
        if (current.lastAccessed > existingItem.lastAccessed) {
          const index = acc.findIndex(item => item.id === current.id);
          acc[index] = current;
        }
      }
      return acc;
    }, [] as NavigationItem[]);
    
    // Sort again after deduplication to maintain chronological order
    uniqueHistory.sort((a, b) => a.firstAccessed - b.firstAccessed);
    
    // Limit to 10 items, keeping the most recently accessed
    let limitedHistory = uniqueHistory;
    if (uniqueHistory.length > 10) {
      limitedHistory = uniqueHistory.slice(0, 10);
    }
    
    saveNavigationHistory(limitedHistory);
    setNavigationHistory(limitedHistory);
  };

  // Remove item from navigation history
  const removeFromNavigationHistory = (itemId: string) => {
    const history = getNavigationHistory();
    const filteredHistory = history.filter(item => item.id !== itemId);
    
    // Special handling for unorganized thread
    if (itemId === 'thread_unorganized') {
      localStorage.setItem('unorganized-thread-closed', 'true');
    }
    
    saveNavigationHistory(filteredHistory);
    setNavigationHistory(filteredHistory);
  };

  // Extract item data from page
  const extractItemDataFromPage = (currentItemId: string): Omit<NavigationItem, 'firstAccessed' | 'lastAccessed'> | null => {
    // Handle SSR - return null if not in browser
    if (typeof window === 'undefined') {
      return null;
    }
    
    // Get data from navigation slot element (set by Layout.astro)
    const navigationElement = document.querySelector('[slot="navigation"]') as HTMLElement;
    
    if (!navigationElement) return null;
    
    // For notes, use parent thread data
    if (currentItemId.startsWith('note_')) {
      const parentThreadId = navigationElement.dataset.parentThreadId;
      if (parentThreadId) {
        return {
          id: parentThreadId,
          title: navigationElement.dataset.parentThreadTitle || 'Thread',
          count: parseInt(navigationElement.dataset.parentThreadCount || '0'),
          backgroundGradient: navigationElement.dataset.parentThreadBackgroundGradient || 'var(--color-gradient-gray)'
        };
      }
    }
    
    // For threads
    if (currentItemId.startsWith('thread_') || navigationElement.dataset.threadId) {
      const threadId = navigationElement.dataset.threadId;
      if (threadId) {
        return {
          id: threadId,
          title: navigationElement.dataset.threadTitle || 'Thread',
          count: parseInt(navigationElement.dataset.threadNoteCount || '0'),
          backgroundGradient: navigationElement.dataset.threadBackgroundGradient || 'var(--color-gradient-gray)'
        };
      }
    }
    
    // For spaces
    if (currentItemId.startsWith('space_') || navigationElement.dataset.spaceId) {
      const spaceId = navigationElement.dataset.spaceId;
      if (spaceId) {
        return {
          id: spaceId,
          title: navigationElement.dataset.spaceTitle || 'Space',
          count: parseInt(navigationElement.dataset.spaceItemCount || '0'),
          backgroundGradient: navigationElement.dataset.spaceBackgroundGradient || 'var(--color-gradient-gray)'
        };
      }
    }
    
    return null;
  };

  // Track navigation access
  const trackNavigationAccess = () => {
    // Handle SSR - do nothing if not in browser
    if (typeof window === 'undefined') {
      return;
    }
    
    const currentPath = window.location.pathname;
    const currentItemId = currentPath.startsWith('/') ? currentPath.substring(1) : currentPath;

    console.log('🧭 trackNavigationAccess called for:', currentItemId);

    // Skip dashboard and empty paths
    if (currentItemId === 'dashboard' || currentItemId === '' || currentItemId === 'sign-in' || currentItemId === 'sign-up') {
      console.log('🧭 Skipping navigation tracking for:', currentItemId);
      return;
    }
    
    // Skip specific test items
    const testItemIds = ['Test Space', 'Test Close Icon', 'Test Immediate Nav', 'Test Event Dispatch'];
    if (testItemIds.some(testId => currentItemId.includes(testId))) {
      console.log('🧭 Skipping navigation tracking for test item:', currentItemId);
      return;
    }
    
    // Track spaces too (they should be persistent and closable)
    // Spaces are now tracked in navigation history
    
    // Extract item data from page
    const itemData = extractItemDataFromPage(currentItemId);
    console.log('🧭 Extracted item data:', itemData);
    
    if (itemData) {
      // Special handling for unorganized thread
      if (currentItemId === 'thread_unorganized' || itemData.id === 'thread_unorganized') {
        localStorage.removeItem('unorganized-thread-closed');
      }
      
      // Check if this is a new item (not in history yet)
      const history = getNavigationHistory();
      const existingItem = history.find(h => h.id === itemData.id);
      
      console.log('🧭 Current history:', history);
      console.log('🧭 Existing item:', existingItem);
      
      if (!existingItem) {
        // Only add new items to history - this preserves the order
        console.log('🧭 Adding new item to history:', itemData);
        addToNavigationHistory(itemData);
      } else {
        // Update the item data but DON'T change its position
        console.log('🧭 Updating existing item:', itemData);
        const existingIndex = history.findIndex(h => h.id === itemData.id);
        history[existingIndex] = {
          ...history[existingIndex],
          ...itemData,
          lastAccessed: Date.now()
        };
        
        saveNavigationHistory(history);
        setNavigationHistory(history);
      }
    } else {
      console.log('🧭 No item data found for:', currentItemId);
    }
  };

  // Refresh navigation from storage
  const refreshNavigation = () => {
    const history = getNavigationHistory();
    setNavigationHistory(history);
  };

  // Initialize navigation history on mount
  useEffect(() => {
    const history = getNavigationHistory();
    setNavigationHistory(history);
    
    // Track current page access
    trackNavigationAccess();
    
    // Listen for View Transitions
    const handlePageLoad = () => {
      trackNavigationAccess();
    };
    
    // Listen for space creation events
    const handleSpaceCreated = (event: CustomEvent) => {
      console.log('🧭 Space created event received in NavigationContext:', event.detail);
      const space = event.detail?.space;
      if (space) {
        // Skip specific test spaces (exact title matches only)
        const testSpaceTitles = ['Test Space', 'Test Close Icon', 'Test Immediate Nav', 'Test Event Dispatch'];
        if (testSpaceTitles.includes(space.title)) {
          console.log('🧭 Skipping test space from navigation history:', space.title);
          return;
        }
        // Reload navigation history from localStorage (which was updated synchronously)
        const history = getNavigationHistory();
        setNavigationHistory(history);
        console.log('🧭 Navigation history reloaded after space creation:', history);
      }
    };
    
    // Listen for thread creation events
    const handleThreadCreated = (event: CustomEvent) => {
      console.log('🧭 Thread created event received in NavigationContext:', event.detail);
      const thread = event.detail?.thread;
      if (thread) {
        // Skip specific test threads (exact title matches only)
        const testThreadTitles = ['Test Space', 'Test Close Icon', 'Test Immediate Nav', 'Test Event Dispatch'];
        if (testThreadTitles.includes(thread.title)) {
          console.log('🧭 Skipping test thread from navigation history:', thread.title);
          return;
        }
        // Reload navigation history from localStorage (which was updated synchronously)
        const history = getNavigationHistory();
        setNavigationHistory(history);
        console.log('🧭 Navigation history reloaded after thread creation:', history);
      }
    };
    
    document.addEventListener('astro:page-load', handlePageLoad);
    document.addEventListener('spaceCreated', handleSpaceCreated as EventListener);
    document.addEventListener('threadCreated', handleThreadCreated as EventListener);
    
    // Expose functions to global scope for non-React code
    (window as any).removeFromNavigationHistory = removeFromNavigationHistory;
    (window as any).addToNavigationHistory = addToNavigationHistory;
    (window as any).trackNavigationAccess = trackNavigationAccess;
    (window as any).refreshNavigation = refreshNavigation;
    
    return () => {
      document.removeEventListener('astro:page-load', handlePageLoad);
      document.removeEventListener('spaceCreated', handleSpaceCreated as EventListener);
      document.removeEventListener('threadCreated', handleThreadCreated as EventListener);
    };
  }, []);

  const value: NavigationContextType = {
    navigationHistory,
    addToNavigationHistory,
    removeFromNavigationHistory,
    trackNavigationAccess,
    refreshNavigation
  };

  // Use default value during SSR, real value during client-side
  const contextValue = typeof window === 'undefined' ? defaultContextValue : value;

  return (
    <NavigationContext.Provider value={contextValue}>
      {children}
    </NavigationContext.Provider>
  );
};

// Hook to use navigation context
export const useNavigation = () => {
  const context = useContext(NavigationContext);
  
  // During SSR, return default context value
  if (typeof window === 'undefined') {
    return defaultContextValue;
  }
  
  // During client-side rendering, ensure we have a proper context
  if (context === undefined) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  
  return context;
};

