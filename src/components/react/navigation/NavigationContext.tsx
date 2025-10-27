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

  console.log('🧭 NavigationProvider initialized');

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
      
      return parsed;
    } catch (error) {
      console.error('Error getting navigation history:', error);
      return (window as any).navigationHistoryBackup || [];
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
    const history = getNavigationHistory();
    
    // Check if item already exists
    const existingIndex = history.findIndex(h => h.id === item.id);
    
    if (existingIndex !== -1) {
      // Item already exists - this shouldn't happen if called correctly
      return;
    } else {
      // Item doesn't exist - add to end first, then sort
      const newItem: NavigationItem = {
        ...item,
        firstAccessed: Date.now(),
        lastAccessed: Date.now()
      };
      history.push(newItem);
    }
    
    // Limit to 10 items, keeping the most recently accessed
    let limitedHistory = history;
    if (history.length > 10) {
      limitedHistory = history.slice(0, 10);
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
    
    // Try to get data from page elements
    const pageElement = document.querySelector('[data-navigation-item]') as HTMLElement;
    const titleElement = document.querySelector('h1, [data-title]') as HTMLElement;
    const countElement = document.querySelector('[data-count]') as HTMLElement;
    const gradientElement = document.querySelector('[data-background-gradient]') as HTMLElement;
    
    let title = titleElement?.textContent || titleElement?.dataset.title || 'Untitled';
    let count = 0;
    let backgroundGradient = 'var(--color-gradient-gray)';
    
    // Try to parse count
    if (countElement) {
      const countText = countElement.textContent || countElement.dataset.count;
      if (countText) {
        const parsedCount = parseInt(countText);
        if (!isNaN(parsedCount)) {
          count = parsedCount;
        }
      }
    }
    
    // Try to get background gradient
    if (gradientElement) {
      const gradient = gradientElement.dataset.backgroundGradient;
      if (gradient) {
        backgroundGradient = gradient;
      }
    }
    
    // Determine content type and set appropriate defaults
    if (currentItemId.startsWith('thread_')) {
      title = title || 'Untitled Thread';
      backgroundGradient = backgroundGradient || 'var(--color-gradient-gray)';
    } else if (currentItemId.startsWith('space_')) {
      title = title || 'Untitled Space';
      backgroundGradient = backgroundGradient || 'var(--color-gradient-gray)';
    } else if (currentItemId.startsWith('note_')) {
      title = title || 'Untitled Note';
      backgroundGradient = 'var(--color-gradient-gray)'; // Notes always use paper color
    }
    
    return {
      id: currentItemId,
      title,
      count,
      backgroundGradient
    };
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
    
    document.addEventListener('astro:page-load', handlePageLoad);
    
    // Expose functions to global scope for non-React code
    (window as any).removeFromNavigationHistory = removeFromNavigationHistory;
    (window as any).addToNavigationHistory = addToNavigationHistory;
    (window as any).trackNavigationAccess = trackNavigationAccess;
    (window as any).refreshNavigation = refreshNavigation;
    
    return () => {
      document.removeEventListener('astro:page-load', handlePageLoad);
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
