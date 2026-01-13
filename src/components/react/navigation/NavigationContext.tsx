import React, { createContext, useContext, useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { safeSetItem, safeGetItem, safeRemoveItem, getStorage } from '@/utils/safe-storage';
import { safeFetch, isAuthReady } from '@/utils/safe-fetch';
import { shouldForceRefresh, trackNoteDeletion, refreshBadgeCountsWithVerification } from '@/utils/badge-count-refresh';

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
  getCurrentActiveItemId: () => string;
}

// Create the context with default SSR-safe values
const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

// Default context value for SSR
const defaultContextValue: NavigationContextType = {
  navigationHistory: [],
  addToNavigationHistory: () => {},
  removeFromNavigationHistory: () => {},
  trackNavigationAccess: () => {},
  refreshNavigation: () => {},
  getCurrentActiveItemId: () => ''
};

// Provider component
export const NavigationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Helper functions for closed items tracking
  const getClosedItems = (): string[] => {
    if (typeof window === 'undefined') {
      return [];
    }
    try {
      const stored = safeGetItem('harvous-closed-navigation-items');
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error getting closed items:', error);
      return [];
    }
  };

  const addToClosedItems = (itemId: string) => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      const closedItems = getClosedItems();
      if (!closedItems.includes(itemId)) {
        closedItems.push(itemId);
        safeSetItem('harvous-closed-navigation-items', JSON.stringify(closedItems), {
          cleanupOldest: true,
          fallbackToSession: true,
        });
      }
    } catch (error) {
      console.error('Error adding to closed items:', error);
    }
  };

  const removeFromClosedItems = (itemId: string) => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      const closedItems = getClosedItems();
      const filtered = closedItems.filter(id => id !== itemId);
      safeSetItem('harvous-closed-navigation-items', JSON.stringify(filtered), {
        cleanupOldest: true,
        fallbackToSession: true,
      });
    } catch (error) {
      console.error('Error removing from closed items:', error);
    }
  };

  const isItemClosed = (itemId: string): boolean => {
    if (typeof window === 'undefined') {
      return false;
    }
    // Special handling for unorganized thread - check the legacy flag too
    if (itemId === 'thread_unorganized') {
      return safeGetItem('unorganized-thread-closed') === 'true' || getClosedItems().includes(itemId);
    }
    return getClosedItems().includes(itemId);
  };

  // Initialize state directly from the same storage that addToNavigationHistory uses
  // This ensures we read from the same place we write to
  const getInitialHistory = (): NavigationItem[] => {
    if (typeof window === 'undefined') {
      return [];
    }
    try {
      let stored = safeGetItem('harvous-navigation-history-v2');
      let parsed = stored ? JSON.parse(stored) : [];
      let needsMigration = false;
      
      // Defensive: ensure parsed is an array
      // Handle both array format and object with items property (backward compatibility)
      if (!Array.isArray(parsed)) {
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.items)) {
          // Old format: {items: [...]} - extract the array and migrate
          console.warn('[NavigationContext] Navigation history is in old format, migrating to new format');
          parsed = parsed.items;
          needsMigration = true;
        } else {
          console.warn('[NavigationContext] Navigation history is not an array, defaulting to empty array:', parsed);
          parsed = [];
          needsMigration = true;
        }
      }
      
      // Migrate to new format if needed (save back as direct array)
      if (needsMigration) {
        safeSetItem('harvous-navigation-history-v2', JSON.stringify(parsed), {
          cleanupOldest: true,
          fallbackToSession: true,
        });
      }
      
      // Check for pending thread in sessionStorage (set by NewNotePanel before navigation)
      // This ensures the thread appears immediately on page load even if localStorage wasn't updated in time
      try {
        const pendingThreadStr = sessionStorage.getItem('harvous-pending-thread');
        if (pendingThreadStr) {
          const pendingThread = JSON.parse(pendingThreadStr);
          
          // Check if thread is already in history
          const exists = parsed.some((item: NavigationItem) => item.id === pendingThread.id);
          if (!exists) {
            parsed.push(pendingThread);
            // Update storage immediately using safe storage
            safeSetItem('harvous-navigation-history-v2', JSON.stringify(parsed), {
              cleanupOldest: true,
              fallbackToSession: true,
            });
          }
          // Clear sessionStorage after use
          sessionStorage.removeItem('harvous-pending-thread');
        }
      } catch (error) {
        console.error('NavigationContext: Error processing pending thread:', error);
      }
      
      // Filter out test items and closed items
      const testItemTitles = ['Test Space', 'Test Close Icon', 'Test Immediate Nav', 'Test Event Dispatch'];
      const filtered = parsed.filter((item: NavigationItem) => {
        // Filter out test items
        if (testItemTitles.includes(item.title)) return false;
        // Filter out closed items
        if (isItemClosed(item.id)) return false;
        return true;
      });
      return filtered;
    } catch (error) {
      console.error('Error getting initial navigation history:', error);
      return [];
    }
  };
  
  const [navigationHistory, setNavigationHistory] = useState<NavigationItem[]>(getInitialHistory);

  // Get navigation history from storage
  const getNavigationHistory = (): NavigationItem[] => {
    // Handle SSR - return empty array if not in browser
    if (typeof window === 'undefined') {
      return [];
    }
    
    try {
      const stored = safeGetItem('harvous-navigation-history-v2');
      
      let parsed = stored ? JSON.parse(stored) : [];
      let needsMigration = false;
      
      // Defensive: ensure parsed is an array
      // Handle both array format and object with items property (backward compatibility)
      if (!Array.isArray(parsed)) {
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.items)) {
          // Old format: {items: [...]} - extract the array and migrate
          console.warn('[NavigationContext] Navigation history is in old format, migrating to new format');
          parsed = parsed.items;
          needsMigration = true;
        } else {
          console.warn('[NavigationContext] Navigation history is not an array, defaulting to empty array:', parsed);
          parsed = [];
          needsMigration = true;
        }
      }
      
      // Migrate to new format if needed (save back as direct array)
      if (needsMigration) {
        safeSetItem('harvous-navigation-history-v2', JSON.stringify(parsed), {
          cleanupOldest: true,
          fallbackToSession: true,
        });
      }
      
      // If localStorage is empty but we have a backup, use it
      if (parsed.length === 0 && (window as any).navigationHistoryBackup && Array.isArray((window as any).navigationHistoryBackup) && (window as any).navigationHistoryBackup.length > 0) {
        parsed = (window as any).navigationHistoryBackup;
      }
      
      // Filter out specific test items (exact title matches only)
      const testItemTitles = ['Test Space', 'Test Close Icon', 'Test Immediate Nav', 'Test Event Dispatch'];
      const filteredItems = parsed.filter((item: NavigationItem) => 
        !testItemTitles.includes(item.title)
      );
      
      return filteredItems;
    } catch (error) {
      console.error('Error getting navigation history:', error);
      const backup = (window as any).navigationHistoryBackup || [];
      
      // Defensive: ensure backup is an array
      const safeBackup = Array.isArray(backup) ? backup : [];
      
      // Filter out specific test items from backup too (exact title matches only)
      const testItemTitles = ['Test Space', 'Test Close Icon', 'Test Immediate Nav', 'Test Event Dispatch'];
      const filteredBackup = safeBackup.filter((item: NavigationItem) => 
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
      const jsonString = JSON.stringify(history);
      const success = safeSetItem('harvous-navigation-history-v2', jsonString, {
        cleanupOldest: true,
        fallbackToSession: true,
      });
      
      // Also update the backup
      (window as any).navigationHistoryBackup = [...history];
      
      if (!success) {
        console.error('💾 saveNavigationHistory - SAVE FAILED! Could not save to storage');
      } else {
        // Verify the save worked
        const verification = safeGetItem('harvous-navigation-history-v2');
        if (verification !== jsonString) {
          console.error('💾 saveNavigationHistory - SAVE FAILED! Data mismatch');
        }
      }
    } catch (error) {
      console.error('Error saving navigation history:', error);
    }
  };

  // Add item to navigation history
  const addToNavigationHistory = (item: Omit<NavigationItem, 'firstAccessed' | 'lastAccessed'>) => {
    console.log('[addToNavigationHistory] Adding/updating item:', item.id, item.title);

    // Skip specific test items (exact title matches only)
    const testItemTitles = ['Test Space', 'Test Close Icon', 'Test Immediate Nav', 'Test Event Dispatch'];
    if (testItemTitles.includes(item.title)) {
      console.log('[addToNavigationHistory] Skipping test item:', item.title);
      return;
    }

    // Remove from closed items list if it was previously closed
    // This handles the case where user explicitly navigates to a closed item
    removeFromClosedItems(item.id);
    console.log('[addToNavigationHistory] Removed from closed items (if it was there):', item.id);
    
    const history = getNavigationHistory();
    
    // Check if item already exists - use strict equality check
    const existingIndex = history.findIndex(h => h.id === item.id);
    
    if (existingIndex !== -1) {
      console.log('[addToNavigationHistory] Item already exists in history, updating');
      // Item already exists - update lastAccessed time but keep position
      const existingItem = history[existingIndex];
      // Defensive: ensure firstAccessed is preserved, use current time if missing (shouldn't happen)
      // Check for undefined/null specifically, not falsy (0 is a valid timestamp)
      const preservedFirstAccessed = (existingItem.firstAccessed != null) ? existingItem.firstAccessed : Date.now();
      history[existingIndex] = {
        ...existingItem,
        ...item,
        firstAccessed: preservedFirstAccessed,
        lastAccessed: Date.now()
      };
    } else {
      console.log('[addToNavigationHistory] Item does not exist, adding new item');
      // Item doesn't exist - this could be first time opening or reopening after being closed
      // For now, we'll add to the end (first time opening behavior)
      // TODO: In the future, we could track closed items to detect true reopening
      const newItem: NavigationItem = {
        ...item,
        firstAccessed: Date.now(),
        lastAccessed: Date.now()
      };
      history.push(newItem); // Add to end for first time opening
    }
    
    // Sort by firstAccessed to maintain chronological order
    // This ensures the order is consistent between React and Astro
    // Defensive: handle missing firstAccessed by treating as oldest (very large number)
    // Check for undefined/null specifically, not falsy (0 is a valid timestamp)
    history.sort((a, b) => {
      const aFirst = (a.firstAccessed != null) ? a.firstAccessed : Number.MAX_SAFE_INTEGER;
      const bFirst = (b.firstAccessed != null) ? b.firstAccessed : Number.MAX_SAFE_INTEGER;
      return aFirst - bFirst;
    });
    
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
    // Defensive: handle missing firstAccessed by treating as oldest (very large number)
    // Check for undefined/null specifically, not falsy (0 is a valid timestamp)
    uniqueHistory.sort((a, b) => {
      const aFirst = (a.firstAccessed != null) ? a.firstAccessed : Number.MAX_SAFE_INTEGER;
      const bFirst = (b.firstAccessed != null) ? b.firstAccessed : Number.MAX_SAFE_INTEGER;
      return aFirst - bFirst;
    });
    
    console.log('[addToNavigationHistory] After deduplication, history has', uniqueHistory.length, 'items');

    // Limit to 10 items, keeping the most recently accessed
    let limitedHistory = uniqueHistory;
    if (uniqueHistory.length > 10) {
      limitedHistory = uniqueHistory.slice(0, 10);
    }

    saveNavigationHistory(limitedHistory);
    // CRITICAL: Always create new array reference to trigger React re-render
    setNavigationHistory([...limitedHistory]);
    console.log('[addToNavigationHistory] Saved to localStorage and updated React state. Final count:', limitedHistory.length);
  };

  // Helper function to get the current active item ID
  // Returns the active thread/space ID, handling note pages by returning their parent thread
  const getCurrentActiveItemId = (): string => {
    // Handle SSR - return empty string if not in browser
    if (typeof window === 'undefined') {
      return '';
    }

    const currentPath = window.location.pathname;
    let currentItemId = currentPath.startsWith('/') ? currentPath.substring(1) : currentPath;
    console.log('[getCurrentActiveItemId] currentItemId:', currentItemId);

    // If we're on a note page, we need to determine the parent thread
    if (currentItemId.startsWith('note_')) {
      // First priority: try to get parent thread from note element (most reliable)
      const noteElement = document.querySelector('[data-note-id]') as HTMLElement;
      console.log('[getCurrentActiveItemId] Note element found:', !!noteElement);

      if (noteElement && noteElement.dataset.parentThreadId) {
        console.log('[getCurrentActiveItemId] Returning parentThreadId from note element:', noteElement.dataset.parentThreadId);
        return noteElement.dataset.parentThreadId;
      }

      // Second priority: try to get from navigation element (set by server-side)
      const navigationElement = document.querySelector('[slot="navigation"]') as HTMLElement;
      console.log('[getCurrentActiveItemId] Navigation element found:', !!navigationElement);

      if (navigationElement && navigationElement.dataset.parentThreadId) {
        console.log('[getCurrentActiveItemId] Returning parentThreadId from navigation element:', navigationElement.dataset.parentThreadId);
        return navigationElement.dataset.parentThreadId;
      }

      // Final fallback: assume unorganized thread
      console.log('[getCurrentActiveItemId] No parent thread found, returning thread_unorganized');
      return 'thread_unorganized';
    }

    console.log('[getCurrentActiveItemId] Not a note page, returning:', currentItemId);
    return currentItemId;
  };

  // Remove item from navigation history
  const removeFromNavigationHistory = (itemId: string) => {
    const history = getNavigationHistory();
    
    // Check if the item being removed is currently active
    const currentActiveItemId = getCurrentActiveItemId();
    const isActive = itemId === currentActiveItemId;
    
    // If removing an active item, navigate to the next available item first
    if (isActive) {
      // Find the current index in the history (before filtering)
      const currentIndex = history.findIndex((item) => item.id === itemId);
      
      // Find next item (try index + 1, then index - 1, else null)
      const nextItem = currentIndex !== -1
        ? (history[currentIndex + 1] || history[currentIndex - 1] || null)
        : null;
      
      // Remove the item from history first
      const filteredHistory = history.filter(item => item.id !== itemId);
      
      // Add to closed items list
      addToClosedItems(itemId);
      
      // Special handling for unorganized thread
      if (itemId === 'thread_unorganized') {
        safeSetItem('unorganized-thread-closed', 'true', {
          cleanupOldest: false,
          fallbackToSession: true,
        });
      }
      
      // Save the updated history
      saveNavigationHistory(filteredHistory);
      // Use spread operator to create new array reference for React
      setNavigationHistory([...filteredHistory]);
      
      // Store closed item in sessionStorage to prevent lastVisited update
      // This helps the server-side logic know this navigation is due to closing, not visiting
      try {
        if (typeof window !== 'undefined' && window.sessionStorage) {
          const closedItems = JSON.parse(window.sessionStorage.getItem('harvous-recently-closed-items') || '[]');
          closedItems.push({
            itemId: itemId,
            closedAt: Date.now()
          });
          // Keep only last 10 closed items
          const recent = closedItems.slice(-10);
          window.sessionStorage.setItem('harvous-recently-closed-items', JSON.stringify(recent));
        }
      } catch (error) {
        console.error('Error storing closed item:', error);
      }
      
      // Navigate to next item or dashboard using View Transitions
      // Add query parameter to indicate this navigation is due to closing an item
      const targetUrl = nextItem ? `/${nextItem.id}?closed=${encodeURIComponent(itemId)}` : '/';
      
      // Use View Transitions for smooth navigation
      // Check document visibility before starting transition (prevents error when page is hidden)
      if (document.hidden) {
        // Fallback to standard navigation if page is hidden
        window.location.href = targetUrl;
        return;
      }
      
      // Wrap dynamic import in try-catch to handle import failures
      import('astro:transitions/client')
        .then(({ navigate }) => {
          navigate(targetUrl, { history: 'replace' });
        })
        .catch(async (error) => {
          // Fallback to standard navigation if dynamic import fails
          const errorObj = error instanceof Error ? error : new Error(String(error));
          console.warn('View Transitions import failed, using standard navigation:', errorObj);
          
          // Track error in PostHog if available
          try {
            const { captureException } = await import('@/utils/posthog');
            captureException(errorObj, {
              context: 'navigation-context',
              action: 'remove-item-navigate',
              targetUrl: targetUrl
            });
          } catch {
            // Ignore PostHog import errors
          }
          
          window.location.href = targetUrl;
        });
      return; // Exit early since we're navigating
    }
    
    // Proceed with removal (for non-active items)
    const filteredHistory = history.filter(item => item.id !== itemId);
    
    // Add to closed items list
    addToClosedItems(itemId);
    
    // Special handling for unorganized thread
    if (itemId === 'thread_unorganized') {
      safeSetItem('unorganized-thread-closed', 'true', {
        cleanupOldest: false,
        fallbackToSession: true,
      });
    }
    
    saveNavigationHistory(filteredHistory);
    // Use spread operator to create new array reference for React
    setNavigationHistory([...filteredHistory]);
  };

  // Extract item data from page
  const extractItemDataFromPage = (currentItemId: string): Omit<NavigationItem, 'firstAccessed' | 'lastAccessed'> | null => {
    console.log('[extractItemDataFromPage] Starting extraction for:', currentItemId);

    // Handle SSR - return null if not in browser
    if (typeof window === 'undefined') {
      console.log('[extractItemDataFromPage] SSR environment, returning null');
      return null;
    }

    // Get data from navigation slot element (set by Layout.astro)
    let navigationElement = document.querySelector('[slot="navigation"]') as HTMLElement;
    console.log('[extractItemDataFromPage] Navigation element found:', !!navigationElement);
    
    // For notes, try fallback to data-note-id element if navigation element not found
    if (currentItemId.startsWith('note_') && !navigationElement) {
      console.log('[extractItemDataFromPage] No navigation element, trying data-note-id fallback');
      const noteElement = document.querySelector('[data-note-id]') as HTMLElement;
      console.log('[extractItemDataFromPage] Note element found:', !!noteElement);
      if (noteElement && noteElement.dataset.parentThreadId) {
        const result = {
          id: noteElement.dataset.parentThreadId,
          title: noteElement.dataset.parentThreadTitle || 'Thread',
          count: parseInt(noteElement.dataset.parentThreadCount || '0'),
          backgroundGradient: noteElement.dataset.parentThreadBackgroundGradient || 'var(--color-gradient-gray)'
        };
        console.log('[extractItemDataFromPage] Returning from data-note-id fallback:', result);
        return result;
      }
    }

    if (!navigationElement) {
      console.log('[extractItemDataFromPage] No navigation element found, returning null');
      return null;
    }
    
    // For notes, use parent thread data
    if (currentItemId.startsWith('note_')) {
      const parentThreadId = navigationElement.dataset.parentThreadId;
      console.log('[extractItemDataFromPage] Note page - parentThreadId:', parentThreadId);
      console.log('[extractItemDataFromPage] Note page - all datasets:', navigationElement.dataset);
      if (parentThreadId) {
        const result = {
          id: parentThreadId,
          title: navigationElement.dataset.parentThreadTitle || 'Thread',
          count: parseInt(navigationElement.dataset.parentThreadCount || '0'),
          backgroundGradient: navigationElement.dataset.parentThreadBackgroundGradient || 'var(--color-gradient-gray)'
        };
        console.log('[extractItemDataFromPage] Returning thread data for note:', result);
        return result;
      }
      
      // Fallback: try to get from data-note-id element
      const noteElement = document.querySelector('[data-note-id]') as HTMLElement;
      if (noteElement && noteElement.dataset.parentThreadId) {
        return {
          id: noteElement.dataset.parentThreadId,
          title: noteElement.dataset.parentThreadTitle || 'Thread',
          count: parseInt(noteElement.dataset.parentThreadCount || '0'),
          backgroundGradient: noteElement.dataset.parentThreadBackgroundGradient || 'var(--color-gradient-gray)'
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

  // Track navigation access with retry logic
  const trackNavigationAccess = (retryCount = 0) => {
    // Handle SSR - do nothing if not in browser
    if (typeof window === 'undefined') {
      return;
    }

    const currentPath = window.location.pathname;
    const currentItemId = currentPath.startsWith('/') ? currentPath.substring(1) : currentPath;
    console.log('[trackNavigationAccess] Called for:', currentItemId, 'retryCount:', retryCount);

    // Skip dashboard and empty paths
    if (currentItemId === 'dashboard' || currentItemId === '' || currentItemId === 'sign-in' || currentItemId === 'sign-up') {
      console.log('[trackNavigationAccess] Skipping - dashboard/empty/auth page');
      return;
    }
    
    // Skip pages that don't have navigation data (profile, find, etc.)
    const pagesWithoutNavigationData = ['profile', 'find', 'new-space', 'new-thread'];
    if (pagesWithoutNavigationData.includes(currentItemId)) {
      return;
    }
    
    // Skip specific test items
    const testItemIds = ['Test Space', 'Test Close Icon', 'Test Immediate Nav', 'Test Event Dispatch'];
    if (testItemIds.some(testId => currentItemId.includes(testId))) {
      return;
    }
    
    // Track spaces too (they should be persistent and closable)
    // Spaces are now tracked in navigation history
    
    // Extract item data from page
    let itemData = extractItemDataFromPage(currentItemId);
    console.log('[trackNavigationAccess] Extracted itemData:', itemData, 'retryCount:', retryCount);

    // Retry logic: if element not found and we haven't retried too many times, retry after a delay
    if (!itemData && retryCount < 3) {
      const maxRetries = 3;
      const retryDelay = 100 * (retryCount + 1); // 100ms, 200ms, 300ms

      console.log('[trackNavigationAccess] No data found, scheduling retry', retryCount + 1, 'in', retryDelay, 'ms');
      setTimeout(() => {
        trackNavigationAccess(retryCount + 1);
      }, retryDelay);
      return;
    }
    
    if (itemData) {
      // Special handling for unorganized thread
      if (currentItemId === 'thread_unorganized' || itemData.id === 'thread_unorganized') {
        safeRemoveItem('unorganized-thread-closed');
        // Also remove from closed items list if it was there
        removeFromClosedItems('thread_unorganized');
      }
      
      // Check if this is a new item (not in history yet)
      const history = getNavigationHistory();
      const existingItem = history.find(h => h.id === itemData.id);
      console.log('[trackNavigationAccess] Existing item in history:', !!existingItem);

      // Get current active item ID to check if user explicitly navigated to this item
      // For notes: if we extracted thread data, check if we're viewing content in this thread
      // For threads/spaces: check if we're directly viewing this item
      const currentActiveItemId = getCurrentActiveItemId();
      const isCurrentlyActive = itemData.id === currentActiveItemId ||
        (currentItemId.startsWith('note_') && itemData.id && itemData.id.startsWith('thread_'));
      console.log('[trackNavigationAccess] currentActiveItemId:', currentActiveItemId, 'itemData.id:', itemData.id, 'currentItemId:', currentItemId, 'isCurrentlyActive:', isCurrentlyActive);

      if (!existingItem) {
        console.log('[trackNavigationAccess] Item not in history:', itemData.id);
        // Item doesn't exist in history - check if it was closed
        if (isItemClosed(itemData.id)) {
          console.log('[trackNavigationAccess] Item was closed. isCurrentlyActive:', isCurrentlyActive);
          // Item was previously closed
          if (isCurrentlyActive) {
            // User is viewing content in this thread - restore it
            console.log('[trackNavigationAccess] Restoring closed item:', itemData.id);
            removeFromClosedItems(itemData.id);
            addToNavigationHistory(itemData);

            // Refresh counts from API after adding new item to ensure accuracy
            // Use debounced version to prevent multiple rapid refreshes
            refreshNavigationCountsImmediate();
          } else {
            // Item is closed and user isn't viewing it - don't add it back
            console.log('[trackNavigationAccess] Item closed and not active, skipping');
            return;
          }
        } else {
          // Item is not closed - add it to history (first time opening)
          console.log('[trackNavigationAccess] Adding new item to history:', itemData.id);
          addToNavigationHistory(itemData);

          // Refresh counts from API after adding new item to ensure accuracy (retry logic handles transient failures)
          refreshNavigationCounts();
        }
      } else {
        console.log('[trackNavigationAccess] Item exists in history, updating:', itemData.id);
        // Item exists in history - update it
        // If it was closed but user is now viewing it, remove from closed list
        if (isItemClosed(itemData.id) && isCurrentlyActive) {
          console.log('[trackNavigationAccess] Item was closed but is now active, removing from closed list');
          removeFromClosedItems(itemData.id);
        }

        // Update the item data but DON'T change its position
        const existingIndex = history.findIndex(h => h.id === itemData.id);
        history[existingIndex] = {
          ...history[existingIndex],
          ...itemData,
          lastAccessed: Date.now()
        };

        saveNavigationHistory(history);
        // CRITICAL: Create new array reference to trigger React re-render
        setNavigationHistory([...history]);
        console.log('[trackNavigationAccess] Updated item in history and triggered re-render');
        
        // Refresh counts from API after updating to ensure accuracy (retry logic handles transient failures)
        // This ensures counts match the database even if page data is stale
        refreshNavigationCounts();
      }
    } else if (retryCount >= 3) {
      // If we've exhausted retries and still can't find data, silently skip
      // This can happen for pages that don't have navigation data (notes without threads, etc.)
      // No need to log as it's expected behavior for some page types
    }
  };

  // Refresh navigation from storage
  const refreshNavigation = () => {
    const history = getNavigationHistory();
    setNavigationHistory(history);
  };

  // Refresh navigation counts (threads and spaces) from API to ensure accuracy
  // Uses verification-based approach instead of debouncing
  const refreshNavigationCounts = useCallback(async () => {
    // Handle SSR - do nothing if not in browser
    if (typeof window === 'undefined') {
      return;
    }

    // Check if auth is ready before making API call
    if (!isAuthReady()) {
      // Auth not ready yet, skip silently
      return;
    }

    try {
      
      // Fetch current thread and space counts from API with safe fetch
      const response = await safeFetch('/api/navigation/data');

      if (!response || !response.ok) {
        // Silently fail if auth not ready or error occurred
        return;
      }

      const data = await response.json();
      const threads = data.threads || [];
      const spaces = data.spaces || [];
      const history = getNavigationHistory();
      
      // Get unorganized thread from API response
      const unorganizedThreadFromAPI = threads.find((t: any) => t.id === 'thread_unorganized');
      const unorganizedCountFromAPI = unorganizedThreadFromAPI?.noteCount || 0;
      
      const updatedHistory = history.map((item) => {
        // Check if this is a thread
        if (item.id.startsWith('thread_')) {
          // Find matching thread in API response
          const threadData = threads.find((t: any) => t.id === item.id);
          
          if (threadData) {
            const newCount = threadData.noteCount || 0;
            const currentCount = item.count || 0;
            
            // Only update if counts differ AND the API count is higher or equal
            // This prevents overwriting correct client-side counts with stale lower API counts
            // The API count being higher indicates it's more recent/accurate
            if (currentCount !== newCount && newCount >= currentCount) {
              return { ...item, count: newCount };
            }
            // If API count is lower, it might be stale - keep current count
            return item;
          } else if (item.id === 'thread_unorganized') {
            // Unorganized thread should always be in API response now
            // But handle gracefully if it's missing
            const unorganizedThread = threads.find((t: any) => t.id === 'thread_unorganized');
            if (unorganizedThread) {
              const newCount = unorganizedThread.noteCount || 0;
              const currentCount = item.count || 0;
              
              // If unorganized has 0 notes, remove it from navigation history
              // This prevents it from appearing when notes are created with suggested threads
              if (newCount === 0) {
                return null; // Mark for removal
              }
              
              // Only update if API count is higher or equal
              if (currentCount !== newCount && newCount >= currentCount) {
                return { ...item, count: newCount };
              }
            } else {
              // Unorganized not in API response - if current count is 0, remove it
              if ((item.count || 0) === 0) {
                return null; // Mark for removal
              }
            }
            return item; // Keep current count if API doesn't have it or count is stale
          } else {
            // Thread not found in API - might be deleted
            // But if this is unorganized and it's not in history yet, check if we should add it
            // Only add if it actually has notes (count > 0)
            if (item.id === 'thread_unorganized' && unorganizedCountFromAPI > 0) {
              // Unorganized has notes but wasn't in history - add it
              const newCount = unorganizedCountFromAPI;
              return { ...item, count: newCount };
            }
            return item; // Keep as is
          }
        } 
        // Check if this is a space
        else if (item.id.startsWith('space_')) {
          // Find matching space in API response
          const spaceData = spaces.find((s: any) => s.id === item.id);
          
          if (spaceData) {
            const newCount = spaceData.totalItemCount || 0;
            const currentCount = item.count || 0;
            // Only update if API count is higher or equal
            if (currentCount !== newCount && newCount >= currentCount) {
              return { ...item, count: newCount };
            }
            return item;
          } else {
            // Space not found in API - might be deleted
            return item; // Keep as is
          }
        }
        // Unknown item type - keep as is
        return item;
      });

      // Filter out items marked for removal (null values) and unorganized with 0 notes
      const filteredHistory = updatedHistory
        .filter(item => {
          if (item === null) return false;
          // Remove unorganized if it has 0 notes
          if (item.id === 'thread_unorganized' && (item.count || 0) === 0) {
            return false;
          }
          return true;
        }) as NavigationItem[];
      
      // Check if any counts actually changed or items were removed
      const hasChanges = history.length !== filteredHistory.length || 
        history.some((item, index) => {
          const filteredItem = filteredHistory[index];
          return !filteredItem || item.count !== filteredItem.count;
        });

      // Save and update state if there were changes
      if (hasChanges) {
        saveNavigationHistory(filteredHistory);
        setNavigationHistory(filteredHistory);
      }
    } catch (error) {
      console.error('NavigationContext: Error refreshing navigation counts:', error);
    }
  }, [setNavigationHistory]); // Only include setNavigationHistory (from useState, already stable)

  // Immediate refresh with verification (no debounce delay)
  // Uses sessionStorage to detect if immediate refresh is needed
  const refreshNavigationCountsImmediate = async () => {
    await refreshNavigationCounts();
  };

  // Ref to track timeout for debounced refresh
  const refreshNavigationCountsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced version of refreshNavigationCounts
  const debouncedRefreshNavigationCounts = useCallback(() => {
    // Clear any existing timeout
    if (refreshNavigationCountsTimeoutRef.current) {
      clearTimeout(refreshNavigationCountsTimeoutRef.current);
    }
    
    // Set new timeout
    refreshNavigationCountsTimeoutRef.current = setTimeout(() => {
      refreshNavigationCounts();
      refreshNavigationCountsTimeoutRef.current = null;
    }, 500); // 500ms debounce
  }, [refreshNavigationCounts]);

  // Validation cache to prevent redundant API calls
  const validationCache = useRef<{ timestamp: number; threadIds: Set<string> } | null>(null);
  const VALIDATION_CACHE_DURATION = 60 * 1000; // 1 minute cache
  const VALIDATION_DEBOUNCE_DELAY = 2000; // 2 seconds debounce
  const validationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Track recently created notes to avoid double-counting
  // When a note is created with a suggested thread, it's immediately added to that thread
  // We shouldn't decrement unorganized if the note was never actually in unorganized
  const recentlyCreatedNotes = useRef<Set<string>>(new Set());

  // Function to validate navigation history and remove deleted threads
  const validateNavigationHistory = async (force = false) => {
    try {
      // Check cache first - skip if recent validation exists and not forced
      const now = Date.now();
      if (!force && validationCache.current && (now - validationCache.current.timestamp) < VALIDATION_CACHE_DURATION) {
        // Use cached thread IDs
        const threadIds = validationCache.current.threadIds;
        const history = getNavigationHistory();
        const thirtySecondsAgo = Date.now() - 30000;

        const validatedHistory = history.filter((item: NavigationItem) => {
          if (item.firstAccessed > thirtySecondsAgo) return true;
          if (item.id.startsWith('space_')) return true;
          if (item.id === 'thread_unorganized') return true;
          if (item.id.startsWith('thread_')) {
            return threadIds.has(item.id);
          }
          return true;
        });

        if (validatedHistory.length < history.length) {
          saveNavigationHistory(validatedHistory);
          setNavigationHistory(validatedHistory);
          window.dispatchEvent(new CustomEvent('navigationHistoryUpdated'));
        }
        return;
      }

      // Check if auth is ready before making API call
      if (!isAuthReady()) {
        // Auth not ready yet, skip validation silently
        return;
      }

      // Skip validation when offline - no need to hit network
      if (!navigator.onLine) {
        return;
      }

      // Fetch current threads from API with safe fetch
      const response = await safeFetch('/api/threads/list');
      
      if (!response || !response.ok) {
        // Silently fail if auth not ready or error occurred
        return;
      }
      
      const threads = await response.json();
      const threadIds = new Set<string>(threads.map((t: any) => t.id as string));
      
      // Update cache
      validationCache.current = {
        timestamp: now,
        threadIds
      };
      
      // Get current history from localStorage (source of truth)
      const history = getNavigationHistory();
      
      // Add a 30-second grace period for newly created threads
      const thirtySecondsAgo = Date.now() - 30000;

      // Filter out deleted threads (keep spaces and thread_unorganized)
      const validatedHistory = history.filter((item: NavigationItem) => {
        // Always keep items created in the last 30 seconds to prevent race conditions
        if (item.firstAccessed > thirtySecondsAgo) {
          return true;
        }

        // Keep spaces (they're not validated against threads API)
        if (item.id.startsWith('space_')) return true;
        
        // Keep special unorganized thread
        if (item.id === 'thread_unorganized') return true;
        
        // For regular threads, check if they still exist
        if (item.id.startsWith('thread_')) {
          return threadIds.has(item.id);
        }
        
        // Keep other items by default
        return true;
      });
      
      // Only update if something was removed
      if (validatedHistory.length < history.length) {
        saveNavigationHistory(validatedHistory);
        
        // Update React state directly and dispatch an event instead of forcing a reload
        setNavigationHistory(validatedHistory);
        window.dispatchEvent(new CustomEvent('navigationHistoryUpdated'));
      }
    } catch (error) {
      // Silently fail - validation is not critical
      console.error('Error validating navigation history:', error);
    }
  };

  // Debounced validation function
  const debouncedValidate = (force = false) => {
    if (validationTimeoutRef.current) {
      clearTimeout(validationTimeoutRef.current);
    }
    validationTimeoutRef.current = setTimeout(() => {
      validateNavigationHistory(force);
    }, VALIDATION_DEBOUNCE_DELAY);
  };

  // Initialize navigation history on mount and refresh it
  // This ensures we have the latest data even if localStorage was updated right before navigation
  useEffect(() => {
      // Refresh from localStorage to ensure we have the latest data
      // (especially important after navigation when localStorage might have been updated)
      const refreshHistory = () => {
        const history = getNavigationHistory();
        setNavigationHistory(history);
      };
    
    // Refresh immediately - single refresh is sufficient
    refreshHistory();
    
    // Track current page access
    trackNavigationAccess();
    
    // Delay validation to avoid blocking initial render
    // Use requestIdleCallback if available, otherwise setTimeout
    const scheduleValidation = () => {
      if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(() => {
          debouncedValidate();
        }, { timeout: 3000 });
      } else {
        setTimeout(() => {
          debouncedValidate();
        }, 2000);
      }
    };
    
    scheduleValidation();
    
    // Listen for View Transitions and page loads
    // Use requestAnimationFrame to ensure updates happen after DOM is ready
    const handlePageLoad = () => {
      console.log('[NavigationContext] astro:page-load event fired');
      // Use requestAnimationFrame for immediate visual updates
      requestAnimationFrame(() => {
        console.log('[NavigationContext] Inside requestAnimationFrame after page load');
        // Refresh navigation history from localStorage on page load
        // This ensures we have the latest data after navigation
        refreshHistory();
        trackNavigationAccess();
        
        // Check if we're on a note page and refresh navigation counts
        // This ensures badge counts are accurate when navigating to note pages
        // This is especially important after creating a note with a suggested thread and redirecting
        const currentPath = window.location.pathname;
        const isNotePage = currentPath.startsWith('/note_');
        
        if (isNotePage) {
          // Refresh navigation counts after a delay to ensure counts are accurate after redirect
          // Use debounced version to prevent multiple rapid refreshes from overwriting each other
          debouncedRefreshNavigationCounts();
        }
        
        // Only validate if cache is stale - don't validate on every page load
        // Validation will happen automatically via debouncedValidate if needed
      });
    };
    
    // Listen for space creation events
    const handleSpaceCreated = (event: CustomEvent) => {
      const space = event.detail?.space;
      if (space) {
        // Skip specific test spaces (exact title matches only)
        const testSpaceTitles = ['Test Space', 'Test Close Icon', 'Test Immediate Nav', 'Test Event Dispatch'];
        if (testSpaceTitles.includes(space.title)) {
          return;
        }
        // Reload navigation history from localStorage (which was updated synchronously)
        const history = getNavigationHistory();
        setNavigationHistory(history);
      }
    };
    
    // Listen for thread creation events
    const handleThreadCreated = (event: CustomEvent) => {
      const thread = event.detail?.thread;
      if (thread) {
        // Skip specific test threads (exact title matches only)
        const testThreadTitles = ['Test Space', 'Test Close Icon', 'Test Immediate Nav', 'Test Event Dispatch'];
        if (testThreadTitles.includes(thread.title)) {
          return;
        }
        // Reload navigation history from localStorage (which was updated synchronously)
        const history = getNavigationHistory();
        setNavigationHistory(history);
      }
    };

    // Listen for thread deletion events
    const handleThreadDeleted = (event: CustomEvent) => {
      const threadId = event.detail?.threadId;
      if (threadId) {
        // Remove the thread from navigation history immediately
        removeFromNavigationHistory(threadId);
        
        // Force validation to catch any edge cases and clear cache
        // This is necessary after deletion to ensure consistency
        validateNavigationHistory(true);
      }
    };

    // Listen for note creation events to update thread counts
    const handleNoteCreated = async (event: CustomEvent) => {
      // PHASE 2: Use event detail as primary source (includes threadId and noteId)
      const note = event.detail?.note;
      // Use threadId from event detail first, then actualThreadId, then note.threadId
      const actualThreadId = event.detail?.threadId || event.detail?.actualThreadId || note?.threadId;
      if (note && actualThreadId) {
        // Track this note as recently created to avoid double-counting in noteAddedToThread
        // Remove it after 2 seconds (enough time for noteAddedToThread to fire)
        if (note.id) {
          recentlyCreatedNotes.current.add(note.id);
          setTimeout(() => {
            recentlyCreatedNotes.current.delete(note.id);
          }, 2000);
        }
        
        // If actualThreadId is provided and it's not unorganized, don't add unorganized to navigation
        // This prevents unorganized from appearing when a note is created with a suggested thread
        // The note was never actually in unorganized (it was immediately added to the thread via junction table)
        const wasCreatedWithThread = event.detail?.actualThreadId && event.detail.actualThreadId !== 'thread_unorganized';
        
        // CRITICAL: If note was created with a specific thread (not unorganized), never add unorganized
        // Even if the legacy threadId field is 'thread_unorganized', the note is actually in the specified thread
        // via the junction table, so unorganized should not appear in navigation
        // Use current React state to check if thread exists and update/add it
        setNavigationHistory(currentHistory => {
          const threadIndex = currentHistory.findIndex((item: any) => item.id === actualThreadId);
          
          if (threadIndex !== -1) {
            // Thread exists in history - update the count immediately for UI responsiveness
            // Also check if we need to update title/backgroundGradient if they're incomplete
            // (e.g., if a minimal entry was created with just the threadId)
            const existingItem = currentHistory[threadIndex];
            const oldCount = existingItem.count || 0;
            const newCount = oldCount + 1;
            
            // Check if entry has incomplete data (title is same as id, indicating minimal entry)
            const needsFullData = existingItem.title === existingItem.id || !existingItem.backgroundGradient || existingItem.backgroundGradient === 'var(--color-paper)';
            
            if (needsFullData) {
              // Fetch full thread data to update the entry
              safeFetch('/api/threads/list')
                .then(response => {
                  if (response && response.ok) {
                    return response.json();
                  }
                  return null;
                })
                .then(threads => {
                  if (threads) {
                    const threadData = threads.find((t: any) => t.id === actualThreadId);
                    if (threadData) {
                      // Update the existing entry with full data
                      const updatedHistory = currentHistory.map((item, index) => 
                        index === threadIndex 
                          ? { 
                              ...item, 
                              count: newCount,
                              title: threadData.title,
                              backgroundGradient: threadData.backgroundGradient || item.backgroundGradient
                            }
                          : item
                      );
                      saveNavigationHistory(updatedHistory);
                      setNavigationHistory(updatedHistory);
                    }
                  }
                })
                .catch(error => {
                  console.error('NavigationContext: Error fetching thread data for update:', error);
                });
            }
            
            // Update count immediately (even if we're fetching full data)
            const updatedHistory = currentHistory.map((item, index) => 
              index === threadIndex 
                ? { ...item, count: newCount }
                : item
            );
            
            saveNavigationHistory(updatedHistory);
            return updatedHistory;
          }
          
          // Thread not in history - we need to fetch it and add it
          // Return current state for now, then fetch and add asynchronously
          // Fetch thread data asynchronously and add it
          // Check auth before making API call
          if (!isAuthReady()) {
            // Auth not ready yet, skip silently
            return currentHistory;
          }
          
          safeFetch('/api/threads/list')
            .then(response => {
              if (response && response.ok) {
                return response.json();
              }
              // Silently fail if auth not ready or error occurred
              return null;
            })
            .then(threads => {
              if (!threads) {
                // Auth not ready or error occurred, skip silently
                return;
              }
              
              const threadData = threads.find((t: any) => t.id === actualThreadId);
              
              if (threadData) {
                // Add thread to navigation history using addToNavigationHistory
                // This will update both localStorage and React state
                addToNavigationHistory({
                  id: threadData.id,
                  title: threadData.title,
                  count: threadData.noteCount || 1, // Use fetched count or at least 1 (the new note)
                  backgroundGradient: threadData.backgroundGradient || 'var(--color-gradient-gray)'
                });
              } else if (actualThreadId === 'thread_unorganized' && !wasCreatedWithThread) {
                // Special handling for unorganized thread (only if note actually has no junction entries)
                // Don't add unorganized if the note was created with a specific thread (wasCreatedWithThread)
                // This prevents unorganized from appearing when a note is created with a suggested thread
                // IMPORTANT: If wasCreatedWithThread is true, unorganized should NEVER be added
                addToNavigationHistory({
                  id: 'thread_unorganized',
                  title: 'Unorganized',
                  count: 1, // At least 1 (the new note)
                  backgroundGradient: 'linear-gradient(180deg, var(--color-paper) 0%, var(--color-paper) 100%)'
                });
              }
              // If wasCreatedWithThread is true and actualThreadId is not 'thread_unorganized',
              // we've already added the thread above, so unorganized should NOT be added here
            })
            .catch(error => {
              console.error('NavigationContext: Error fetching thread data:', error);
              // Fallback: add unorganized thread with minimal data if fetch fails
              // Only if the note actually belongs to unorganized (no junction entries)
              // Don't add unorganized if the note was created with a specific thread
              // IMPORTANT: If wasCreatedWithThread is true, unorganized should NEVER be added, even on error
              if (actualThreadId === 'thread_unorganized' && !wasCreatedWithThread) {
                addToNavigationHistory({
                  id: 'thread_unorganized',
                  title: 'Unorganized',
                  count: 1,
                  backgroundGradient: 'linear-gradient(180deg, var(--color-paper) 0%, var(--color-paper) 100%)'
                });
              }
              // If wasCreatedWithThread is true, we should NOT add unorganized even if the fetch fails
              // The note was created with a specific thread, so unorganized should never appear
            });
          
          // Return current state unchanged - the async fetch will update it via addToNavigationHistory
          return currentHistory;
        });
        
        // Refresh counts from API after a delay to ensure database is committed
        // Use debounced version to prevent multiple rapid refreshes from overwriting each other
        debouncedRefreshNavigationCounts();
      }
    };

    // Listen for note removal from thread events
    const handleNoteRemovedFromThread = (event: CustomEvent) => {
      const { noteId, threadId } = event.detail;
      if (threadId) {
        // Use current React state instead of reading from localStorage
        // Combine both updates into a single state update to prevent double renders
        setNavigationHistory(currentHistory => {
          const threadIndex = currentHistory.findIndex((item: any) => item.id === threadId);
          const unorganizedIndex = currentHistory.findIndex((item: any) => item.id === 'thread_unorganized');
          
          // Build updated history in a single pass
          const updatedHistory = currentHistory.map((item, index) => {
            if (index === threadIndex) {
              // Update thread count
              const oldCount = item.count || 0;
              return { ...item, count: Math.max(0, oldCount - 1) };
            }
            if (index === unorganizedIndex) {
              // Increment unorganized thread count (note was moved back to unorganized)
              const oldUnorganizedCount = item.count || 0;
              return { ...item, count: oldUnorganizedCount + 1 };
            }
            return item;
          });
          
          saveNavigationHistory(updatedHistory);
          return updatedHistory;
        });
        
        // Refresh counts from API after a delay to ensure database is committed
        setTimeout(async () => {
          await refreshNavigationCounts();
          // Check if unorganized should be reopened if it was closed
          // Check auth before making API call
          if (isAuthReady()) {
            const history = getNavigationHistory();
            const unorganizedInHistory = history.find(i => i.id === 'thread_unorganized');
            if (!unorganizedInHistory && isItemClosed('thread_unorganized')) {
              // It's closed, let's get the count and see if we should reopen
              // But only if it actually has notes (count > 0)
              const response = await safeFetch('/api/navigation/data');
              if (response && response.ok) {
                const data = await response.json();
                const threads = data.threads || [];
                const unorganizedThread = threads.find((t: any) => t.id === 'thread_unorganized');
                // Only reopen if unorganized has notes (count > 0)
                // This prevents it from appearing when notes are created with suggested threads
                if (unorganizedThread && unorganizedThread.noteCount > 0) {
                  // Reopen it
                  addToNavigationHistory({
                    id: 'thread_unorganized',
                    title: 'Unorganized',
                    count: unorganizedThread.noteCount,
                    backgroundGradient: 'linear-gradient(180deg, var(--color-paper) 0%, var(--color-paper) 100%)'
                  });
                }
              }
            }
          }
        }, 300);
      }
    };

    // Listen for note addition to thread events
    const handleNoteAddedToThread = (event: CustomEvent) => {
      const { noteId, threadId } = event.detail;
      if (threadId && threadId !== 'thread_unorganized') {
        // Check if this note was just created (within last 2 seconds)
        // If so, it was never actually in unorganized, so don't add unorganized to navigation
        const wasJustCreated = recentlyCreatedNotes.current.has(noteId);
        
        // Notes always start in unorganized, so when moved to a thread, decrement unorganized
        // Use current React state instead of reading from localStorage
        // Combine both updates into a single state update to prevent double renders
        setNavigationHistory(currentHistory => {
          const threadIndex = currentHistory.findIndex((item: any) => item.id === threadId);
          const unorganizedIndex = currentHistory.findIndex((item: any) => item.id === 'thread_unorganized');
          
          // If note was just created and unorganized isn't in history, don't add it
          // This prevents unorganized from appearing when notes are created with suggested threads
          if (wasJustCreated && unorganizedIndex === -1) {
            // Note was just created with a thread, so unorganized shouldn't appear
            // Just update the thread count and return
            if (threadIndex !== -1) {
              const updatedHistory = currentHistory.map((item, index) => {
                if (index === threadIndex) {
                  const oldCount = item.count || 0;
                  return { ...item, count: oldCount + 1 };
                }
                return item;
              });
              saveNavigationHistory(updatedHistory);
              return updatedHistory;
            }
          }
          
          // Build updated history in a single pass
          let shouldRemoveUnorganized = false;
          const updatedHistory = currentHistory.map((item, index) => {
            if (index === threadIndex) {
              // Update thread count
              const oldCount = item.count || 0;
              return { ...item, count: oldCount + 1 };
            }
            if (index === unorganizedIndex) {
              // Always decrement unorganized when a note is moved to a thread
              // Notes always start in unorganized, so this is correct
              const oldUnorganizedCount = item.count || 0;
              const newUnorganizedCount = Math.max(0, oldUnorganizedCount - 1);
              
              // If unorganized thread is now empty, mark for removal
              if (newUnorganizedCount === 0) {
                shouldRemoveUnorganized = true;
                return null; // Mark for removal
              }
              
              return { ...item, count: newUnorganizedCount };
            }
            return item;
          }).filter(item => item !== null) as NavigationItem[];
          
          // If unorganized wasn't in navigation history but we need to decrement it,
          // we'll rely on the API refresh to get the correct count
          // This handles the case where a note is created with a thread and unorganized
          // isn't in navigation history yet
          
          saveNavigationHistory(updatedHistory);
          
          // If unorganized thread was removed, call the standard removal function
          // to handle closed items tracking
          if (shouldRemoveUnorganized) {
            addToClosedItems('thread_unorganized');
            safeSetItem('unorganized-thread-closed', 'true', {
              cleanupOldest: false,
              fallbackToSession: true,
            });
          }
          
          return updatedHistory;
        });
        
        // Remove from recently created set after processing
        recentlyCreatedNotes.current.delete(noteId);
        
        // Refresh navigation counts immediately with verification (no debounce delay)
        refreshNavigationCountsImmediate();
      }
    };

    // Listen for space deletion events
    const handleSpaceDeleted = (event: CustomEvent) => {
      const spaceId = event.detail?.spaceId;
      if (spaceId) {
        // Remove the space from navigation history
        removeFromNavigationHistory(spaceId);
      }
    };

    // Listen for note deletion events
    const handleNoteDeleted = (event: CustomEvent) => {
      const { noteId, threadId } = event.detail;
      const actualThreadId = threadId || event.detail?.note?.threadId;
      
      if (noteId && actualThreadId) {
        // Track deletion in sessionStorage for refresh detection
        trackNoteDeletion(noteId, actualThreadId);
        
        let shouldCloseUnorganized = false;

        setNavigationHistory(currentHistory => {
          const threadIndex = currentHistory.findIndex((item: any) => item.id === actualThreadId);
          if (threadIndex === -1) {
            return currentHistory;
          }

          const oldCount = currentHistory[threadIndex].count || 0;
          const newCount = Math.max(0, oldCount - 1);
            
          // If the unorganized thread is now empty, set a flag to close it
          if (actualThreadId === 'thread_unorganized' && newCount === 0) {
            shouldCloseUnorganized = true;
          }
            
          const updatedHistory = currentHistory.map((item, index) => 
            index === threadIndex 
              ? { ...item, count: newCount }
              : item
          );
          saveNavigationHistory(updatedHistory);
          return updatedHistory;
        });

        // Call removal function outside of the state update
        if (shouldCloseUnorganized) {
          removeFromNavigationHistory('thread_unorganized');
        }
        
        // Refresh counts immediately with verification (no debounce delay)
        refreshNavigationCountsImmediate();
      }
    };
    
    document.addEventListener('astro:page-load', handlePageLoad);
    document.addEventListener('spaceCreated', handleSpaceCreated as EventListener);
    window.addEventListener('spaceDeleted', handleSpaceDeleted as EventListener);
    document.addEventListener('threadCreated', handleThreadCreated as EventListener);
    window.addEventListener('threadDeleted', handleThreadDeleted as EventListener);
    window.addEventListener('noteCreated', handleNoteCreated as unknown as EventListener);
    window.addEventListener('noteDeleted', handleNoteDeleted as unknown as EventListener);
    window.addEventListener('noteRemovedFromThread', handleNoteRemovedFromThread as unknown as EventListener);
    window.addEventListener('noteAddedToThread', handleNoteAddedToThread as unknown as EventListener);
    
    // Expose functions to global scope for non-React code
    (window as any).removeFromNavigationHistory = removeFromNavigationHistory;
    (window as any).addToNavigationHistory = addToNavigationHistory;
    (window as any).trackNavigationAccess = trackNavigationAccess;
    (window as any).refreshNavigation = refreshNavigation;
    
    return () => {
      // Clean up validation timeout if it exists
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current);
      }
      document.removeEventListener('astro:page-load', handlePageLoad);
      document.removeEventListener('spaceCreated', handleSpaceCreated as EventListener);
      window.removeEventListener('spaceDeleted', handleSpaceDeleted as EventListener);
      document.removeEventListener('threadCreated', handleThreadCreated as EventListener);
      window.removeEventListener('threadDeleted', handleThreadDeleted as EventListener);
      window.removeEventListener('noteCreated', handleNoteCreated as unknown as EventListener);
      window.removeEventListener('noteDeleted', handleNoteDeleted as unknown as EventListener);
      window.removeEventListener('noteRemovedFromThread', handleNoteRemovedFromThread as unknown as EventListener);
      window.removeEventListener('noteAddedToThread', handleNoteAddedToThread as unknown as EventListener);
    };
  }, []);

  // Listen for entity ID changes (when local IDs become server IDs during sync)
  useEffect(() => {
    const handleIdChange = (event: CustomEvent) => {
      const { oldId, newId, entityType } = event.detail;
      
      // Update navigation history
      setNavigationHistory(prev => 
        prev.map(item => item.id === oldId ? { ...item, id: newId } : item)
      );
      
      // Update closed items if needed
      const closedItems = getClosedItems();
      if (closedItems.includes(oldId)) {
        // Remove old ID and add new ID to closed items
        removeFromClosedItems(oldId);
        addToClosedItems(newId);
      }
      
      // Update storage to persist the change
      const history = getNavigationHistory();
      const updated = history.map(item => 
        item.id === oldId ? { ...item, id: newId } : item
      );
      saveNavigationHistory(updated);
    };
    
    window.addEventListener('entityIdChanged', handleIdChange as EventListener);
    return () => {
      window.removeEventListener('entityIdChanged', handleIdChange as EventListener);
    };
  }, []);

  // Memoize filtered navigation history to prevent recalculation on unrelated renders
  const filteredNavigationHistory = useMemo(() => {
    const testItemTitles = ['Test Space', 'Test Close Icon', 'Test Immediate Nav', 'Test Event Dispatch'];
    return navigationHistory.filter(item => !testItemTitles.includes(item.title));
  }, [navigationHistory]);

  // Memoize context value to ensure React detects changes properly
  // The value object reference changes when navigationHistory changes, triggering re-renders
  const value: NavigationContextType = useMemo(() => {
    const newValue = {
      navigationHistory: filteredNavigationHistory,
      addToNavigationHistory,
      removeFromNavigationHistory,
      trackNavigationAccess,
      refreshNavigation,
      getCurrentActiveItemId
    };
    return newValue;
  }, [filteredNavigationHistory]);

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
  
  // During client-side rendering, return default values if context is not available
  // This allows components to work even if not wrapped in NavigationProvider
  // (graceful degradation)
  if (context === undefined) {
    return defaultContextValue;
  }
  
  return context;
};

