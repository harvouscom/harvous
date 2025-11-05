import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';

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
  // Storage utility - must be defined before getInitialHistory
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

  // Initialize state directly from the same storage that addToNavigationHistory uses
  // This ensures we read from the same place we write to
  const getInitialHistory = (): NavigationItem[] => {
    if (typeof window === 'undefined') {
      return [];
    }
    try {
      const storage = getStorage();
      let stored = storage.getItem('harvous-navigation-history-v2');
      let parsed = stored ? JSON.parse(stored) : [];
      
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
            // Update localStorage immediately
            storage.setItem('harvous-navigation-history-v2', JSON.stringify(parsed));
          }
          // Clear sessionStorage after use
          sessionStorage.removeItem('harvous-pending-thread');
        }
      } catch (error) {
        console.error('NavigationContext: Error processing pending thread:', error);
      }
      
      // Filter out test items
      const testItemTitles = ['Test Space', 'Test Close Icon', 'Test Immediate Nav', 'Test Event Dispatch'];
      const filtered = parsed.filter((item: NavigationItem) => !testItemTitles.includes(item.title));
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
      return;
    }
    
    const history = getNavigationHistory();
    
    // Check if item already exists - use strict equality check
    const existingIndex = history.findIndex(h => h.id === item.id);
    
    if (existingIndex !== -1) {
      // Item already exists - update lastAccessed time but keep position
      history[existingIndex] = {
        ...history[existingIndex],
        ...item,
        lastAccessed: Date.now()
      };
    } else {
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

  // Helper function to get the current active item ID
  // Returns the active thread/space ID, handling note pages by returning their parent thread
  const getCurrentActiveItemId = (): string => {
    // Handle SSR - return empty string if not in browser
    if (typeof window === 'undefined') {
      return '';
    }
    
    const currentPath = window.location.pathname;
    let currentItemId = currentPath.startsWith('/') ? currentPath.substring(1) : currentPath;
    
    // If we're on a note page, we need to determine the parent thread
    if (currentItemId.startsWith('note_')) {
      // First priority: try to get parent thread from note element (most reliable)
      const noteElement = document.querySelector('[data-note-id]') as HTMLElement;
      
      if (noteElement && noteElement.dataset.parentThreadId) {
        return noteElement.dataset.parentThreadId;
      }
      
      // Second priority: try to get from navigation element (set by server-side)
      const navigationElement = document.querySelector('[slot="navigation"]') as HTMLElement;
      
      if (navigationElement && navigationElement.dataset.parentThreadId) {
        return navigationElement.dataset.parentThreadId;
      }
      
      // Final fallback: assume unorganized thread
      return 'thread_unorganized';
    }
    
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
      
      // Special handling for unorganized thread
      if (itemId === 'thread_unorganized') {
        localStorage.setItem('unorganized-thread-closed', 'true');
      }
      
      // Save the updated history
      saveNavigationHistory(filteredHistory);
      setNavigationHistory(filteredHistory);
      
      // Navigate to next item or dashboard
      const targetUrl = nextItem ? `/${nextItem.id}` : '/dashboard';
      
      // Use replace to avoid adding to browser history
      window.location.replace(targetUrl);
      return; // Exit early since we're navigating
    }
    
    // Proceed with removal (for non-active items)
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
    let navigationElement = document.querySelector('[slot="navigation"]') as HTMLElement;
    
    // For notes, try fallback to data-note-id element if navigation element not found
    if (currentItemId.startsWith('note_') && !navigationElement) {
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

    // Skip dashboard and empty paths
    if (currentItemId === 'dashboard' || currentItemId === '' || currentItemId === 'sign-in' || currentItemId === 'sign-up') {
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
    
    // Retry logic: if element not found and we haven't retried too many times, retry after a delay
    if (!itemData && retryCount < 3) {
      const maxRetries = 3;
      const retryDelay = 100 * (retryCount + 1); // 100ms, 200ms, 300ms
      
      
      setTimeout(() => {
        trackNavigationAccess(retryCount + 1);
      }, retryDelay);
      return;
    }
    
    if (itemData) {
      // Special handling for unorganized thread
      if (currentItemId === 'thread_unorganized' || itemData.id === 'thread_unorganized') {
        localStorage.removeItem('unorganized-thread-closed');
      }
      
      // Check if this is a new item (not in history yet)
      const history = getNavigationHistory();
      const existingItem = history.find(h => h.id === itemData.id);
      
      if (!existingItem) {
        // Only add new items to history - this preserves the order
        addToNavigationHistory(itemData);
        
        // Refresh counts from API after adding new item to ensure accuracy
        setTimeout(() => {
          refreshThreadCounts();
        }, 300);
      } else {
        // Update the item data but DON'T change its position
        const existingIndex = history.findIndex(h => h.id === itemData.id);
        history[existingIndex] = {
          ...history[existingIndex],
          ...itemData,
          lastAccessed: Date.now()
        };
        
        saveNavigationHistory(history);
        setNavigationHistory(history);
        
        // Refresh counts from API after updating to ensure accuracy
        // This ensures counts match the database even if page data is stale
        setTimeout(() => {
          refreshThreadCounts();
        }, 300);
      }
    } else if (retryCount >= 3) {
      // If we've exhausted retries and still can't find data, log a warning
      console.warn('NavigationContext: Could not extract navigation data after retries for:', currentItemId);
    }
  };

  // Refresh navigation from storage
  const refreshNavigation = () => {
    const history = getNavigationHistory();
    setNavigationHistory(history);
  };

  // Refresh thread counts from API to ensure accuracy
  const refreshThreadCounts = async () => {
    // Handle SSR - do nothing if not in browser
    if (typeof window === 'undefined') {
      return;
    }

    try {
      console.log('NavigationContext: Refreshing thread counts from API...');
      
      // Fetch current thread counts from API
      const response = await fetch('/api/threads/list', {
        credentials: 'include'
      });

      if (!response.ok) {
        console.error('NavigationContext: Failed to fetch thread counts:', response.status);
        return;
      }

      const threads = await response.json();
      const history = getNavigationHistory();
      const updatedHistory = history.map((item) => {
        // Find matching thread in API response
        const threadData = threads.find((t: any) => t.id === item.id);
        
        if (threadData) {
          const newCount = threadData.noteCount || 0;
          // Always update count (even if same) to ensure accuracy
          // This handles cases where the count was stale
          if (item.count !== newCount) {
            return { ...item, count: newCount };
          }
          return item; // No change needed
        } else if (item.id === 'thread_unorganized') {
          // Special handling for unorganized thread - may not be in API response
          // Try to find it or fetch separately
          const unorganizedThread = threads.find((t: any) => t.id === 'thread_unorganized');
          if (unorganizedThread) {
            const newCount = unorganizedThread.noteCount || 0;
            if (item.count !== newCount) {
              return { ...item, count: newCount };
            }
          } else {
            // Unorganized thread not in API response - API should include it now, but fallback
            // Keep current count if API doesn't have it (shouldn't happen with new API fix)
          }
          return item; // No change needed
        } else {
          // Item not found in API - might be a space or deleted thread
          return item; // Keep as is
        }
      });

      // Check if any counts actually changed
      const hasChanges = history.some((item, index) => item.count !== updatedHistory[index].count);

      // Save and update state if there were changes
      if (hasChanges) {
        saveNavigationHistory(updatedHistory);
        setNavigationHistory(updatedHistory);
      }
    } catch (error) {
      console.error('NavigationContext: Error refreshing thread counts:', error);
    }
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
    
    // Refresh immediately
    refreshHistory();
    
    // Also refresh after delays to catch any late localStorage updates
    // This handles cases where localStorage was updated right before navigation
    const timeoutId1 = setTimeout(() => {
      refreshHistory();
    }, 50);
    
    const timeoutId2 = setTimeout(() => {
      refreshHistory();
    }, 200);
    
    const timeoutId3 = setTimeout(() => {
      refreshHistory();
    }, 500);
    
    // Track current page access
    trackNavigationAccess();
    
    // Listen for View Transitions and page loads
    const handlePageLoad = () => {
      // Refresh navigation history from localStorage on page load
      // This ensures we have the latest data after navigation
      refreshHistory();
      trackNavigationAccess();
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
        // Remove the thread from navigation history
        removeFromNavigationHistory(threadId);
      }
    };

    // Listen for note creation events to update thread counts
    const handleNoteCreated = async (event: CustomEvent) => {
      const note = event.detail?.note;
      if (note && note.threadId) {
        // Use current React state to check if thread exists and update/add it
        setNavigationHistory(currentHistory => {
          const threadIndex = currentHistory.findIndex((item: any) => item.id === note.threadId);
          
          if (threadIndex !== -1) {
            // Thread exists in history - just update the count immediately for UI responsiveness
            // Use immutable updates to ensure React detects the change
            const oldCount = currentHistory[threadIndex].count || 0;
            const newCount = oldCount + 1;
            
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
          fetch('/api/threads/list', {
            credentials: 'include'
          })
            .then(response => {
              if (response.ok) {
                return response.json();
              }
              throw new Error(`Failed to fetch: ${response.status}`);
            })
            .then(threads => {
              const threadData = threads.find((t: any) => t.id === note.threadId);
              
              if (threadData) {
                // Add thread to navigation history using addToNavigationHistory
                // This will update both localStorage and React state
                addToNavigationHistory({
                  id: threadData.id,
                  title: threadData.title,
                  count: threadData.noteCount || 1, // Use fetched count or at least 1 (the new note)
                  backgroundGradient: threadData.backgroundGradient || 'var(--color-gradient-gray)'
                });
              } else if (note.threadId === 'thread_unorganized') {
                // Special handling for unorganized thread
                addToNavigationHistory({
                  id: 'thread_unorganized',
                  title: 'Unorganized',
                  count: 1, // At least 1 (the new note)
                  backgroundGradient: 'linear-gradient(180deg, var(--color-paper) 0%, var(--color-paper) 100%)'
                });
              }
            })
            .catch(error => {
              console.error('NavigationContext: Error fetching thread data:', error);
              // Fallback: add unorganized thread with minimal data if fetch fails
              if (note.threadId === 'thread_unorganized') {
                addToNavigationHistory({
                  id: 'thread_unorganized',
                  title: 'Unorganized',
                  count: 1,
                  backgroundGradient: 'linear-gradient(180deg, var(--color-paper) 0%, var(--color-paper) 100%)'
                });
              }
            });
          
          // Return current state unchanged - the async fetch will update it via addToNavigationHistory
          return currentHistory;
        });
        
        // Refresh counts from API after a delay to ensure database is committed
        setTimeout(() => {
          refreshThreadCounts();
        }, 300);
      }
    };

    // Listen for note removal from thread events
    const handleNoteRemovedFromThread = (event: CustomEvent) => {
      const { noteId, threadId } = event.detail;
      if (threadId) {
        // Use current React state instead of reading from localStorage
        setNavigationHistory(currentHistory => {
          const threadIndex = currentHistory.findIndex((item: any) => item.id === threadId);
          if (threadIndex !== -1) {
            // Update count immediately for UI responsiveness
            // Use immutable updates to ensure React detects the change
            const oldCount = currentHistory[threadIndex].count || 0;
            const newCount = Math.max(0, oldCount - 1);
            
            const updatedHistory = currentHistory.map((item, index) => 
              index === threadIndex 
                ? { ...item, count: newCount }
                : item
            );
            saveNavigationHistory(updatedHistory);
            return updatedHistory;
          }
          return currentHistory;
        });
        
        // Refresh counts from API after a delay to ensure database is committed
        setTimeout(() => {
          refreshThreadCounts();
        }, 300);
      }
    };

    // Listen for note addition to thread events
    const handleNoteAddedToThread = (event: CustomEvent) => {
      const { noteId, threadId } = event.detail;
      if (threadId) {
        // Use current React state instead of reading from localStorage
        setNavigationHistory(currentHistory => {
          const threadIndex = currentHistory.findIndex((item: any) => item.id === threadId);
          if (threadIndex !== -1) {
            // Update count immediately for UI responsiveness
            // Use immutable updates to ensure React detects the change
            const oldCount = currentHistory[threadIndex].count || 0;
            const newCount = oldCount + 1;
            
            const updatedHistory = currentHistory.map((item, index) => 
              index === threadIndex 
                ? { ...item, count: newCount }
                : item
            );
            
            saveNavigationHistory(updatedHistory);
            return updatedHistory;
          }
          return currentHistory;
        });
        
        // Refresh counts from API after a delay to ensure database is committed
        setTimeout(() => {
          refreshThreadCounts();
        }, 300);
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
      const note = event.detail?.note;
      if (note && note.threadId) {
        // Use current React state instead of reading from localStorage
        setNavigationHistory(currentHistory => {
          const threadIndex = currentHistory.findIndex((item: any) => item.id === note.threadId);
          if (threadIndex !== -1) {
            // Update count immediately for UI responsiveness
            // Use immutable updates to ensure React detects the change
            const oldCount = currentHistory[threadIndex].count || 0;
            const newCount = Math.max(0, oldCount - 1);
            
            const updatedHistory = currentHistory.map((item, index) => 
              index === threadIndex 
                ? { ...item, count: newCount }
                : item
            );
            saveNavigationHistory(updatedHistory);
            return updatedHistory;
          }
          return currentHistory;
        });
        
        // Refresh counts from API after a delay to ensure database is committed
        setTimeout(() => {
          refreshThreadCounts();
        }, 300);
      }
    };
    
    document.addEventListener('astro:page-load', handlePageLoad);
    document.addEventListener('spaceCreated', handleSpaceCreated as EventListener);
    document.addEventListener('spaceDeleted', handleSpaceDeleted as EventListener);
    document.addEventListener('threadCreated', handleThreadCreated as EventListener);
    document.addEventListener('threadDeleted', handleThreadDeleted as EventListener);
    document.addEventListener('noteCreated', handleNoteCreated as EventListener);
    document.addEventListener('noteDeleted', handleNoteDeleted as EventListener);
    document.addEventListener('noteRemovedFromThread', handleNoteRemovedFromThread as EventListener);
    document.addEventListener('noteAddedToThread', handleNoteAddedToThread as EventListener);
    
    // Expose functions to global scope for non-React code
    (window as any).removeFromNavigationHistory = removeFromNavigationHistory;
    (window as any).addToNavigationHistory = addToNavigationHistory;
    (window as any).trackNavigationAccess = trackNavigationAccess;
    (window as any).refreshNavigation = refreshNavigation;
    
    return () => {
      clearTimeout(timeoutId1);
      clearTimeout(timeoutId2);
      clearTimeout(timeoutId3);
      document.removeEventListener('astro:page-load', handlePageLoad);
      document.removeEventListener('spaceCreated', handleSpaceCreated as EventListener);
      document.removeEventListener('spaceDeleted', handleSpaceDeleted as EventListener);
      document.removeEventListener('threadCreated', handleThreadCreated as EventListener);
      document.removeEventListener('threadDeleted', handleThreadDeleted as EventListener);
      document.removeEventListener('noteCreated', handleNoteCreated as EventListener);
      document.removeEventListener('noteDeleted', handleNoteDeleted as EventListener);
      document.removeEventListener('noteRemovedFromThread', handleNoteRemovedFromThread as EventListener);
      document.removeEventListener('noteAddedToThread', handleNoteAddedToThread as EventListener);
    };
  }, []);

  // Memoize context value to ensure React detects changes properly
  // The value object reference changes when navigationHistory changes, triggering re-renders
  const value: NavigationContextType = useMemo(() => {
    const newValue = {
      navigationHistory,
      addToNavigationHistory,
      removeFromNavigationHistory,
      trackNavigationAccess,
      refreshNavigation,
      getCurrentActiveItemId
    };
    return newValue;
  }, [navigationHistory]);

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
    console.warn('useNavigation: NavigationProvider not available, using default (no-op) values');
    return defaultContextValue;
  }
  
  return context;
};

