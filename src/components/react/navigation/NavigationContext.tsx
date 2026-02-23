import React, { createContext, useContext, useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { safeSetItem, safeGetItem, safeRemoveItem, getStorage } from '@/utils/safe-storage';
import { safeFetch, isAuthReady } from '@/utils/safe-fetch';
import { idToUrl, extractIdFromPath, detectEntityTypeFromPath } from '@/utils/url-helpers';
import { shouldForceRefresh, trackNoteDeletion, refreshBadgeCountsWithVerification } from '@/utils/badge-count-refresh';
import { getSelectedSpaceId, setSelectedSpaceId } from './selectedSpace';

// Navigation item interface
export interface NavigationItem {
  id: string;
  title: string;
  count?: number;
  backgroundGradient?: string;
  spaceId?: string | null;
  // The selected space context when this item was opened.
  // This enables per-space persistence independent of the thread's actual space.
  //
  // Multi-scope: a thread can be opened from multiple spaces; it should persist in each
  // until explicitly closed. `null` represents “My Home”.
  openedInSpaceIds?: Array<string | null>;
  // Legacy single-scope field (back-compat)
  openedInSpaceId?: string | null;
  firstAccessed: number;
  lastAccessed: number;
}

// Options for removeFromNavigationHistory (e.g. erase: update history only, caller navigates)
export interface RemoveFromNavigationHistoryOptions {
  navigateIfActive?: boolean;
  /** When closing a thread, remove all threads with this title from history so the thread disappears from nav */
  sameTitleAs?: string;
}

// Navigation context interface
interface NavigationContextType {
  navigationHistory: NavigationItem[];
  addToNavigationHistory: (item: Omit<NavigationItem, 'firstAccessed' | 'lastAccessed'>) => void;
  removeFromNavigationHistory: (itemId: string, options?: RemoveFromNavigationHistoryOptions) => void;
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
  const normalizeOpenedInSpaceId = (value: unknown): string | null => {
    if (value == null) return null;
    const trimmed = String(value).trim();
    if (!trimmed || trimmed === 'home') return null;
    const withoutLeading = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
    const withoutTrailing = withoutLeading.endsWith('/') ? withoutLeading.slice(0, -1) : withoutLeading;
    const normalized = withoutTrailing || null;
    if (!normalized) return null;
    // Only accept real space ids; everything else is treated as Home.
    if (normalized.startsWith('space_')) return normalized;
    return null;
  };

  const getItemOpenedInSpaceIds = (item: Partial<NavigationItem>): Array<string | null> => {
    const fromArray = Array.isArray((item as any).openedInSpaceIds) ? ((item as any).openedInSpaceIds as Array<unknown>) : null;
    if (fromArray) {
      const normalized = fromArray.map(normalizeOpenedInSpaceId);
      // Keep nulls (Home) and dedupe while preserving order
      const seen = new Set<string>();
      const out: Array<string | null> = [];
      for (const s of normalized) {
        const key = s ?? 'home';
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(s);
      }
      return out.length > 0 ? out : [null];
    }

    const legacy = normalizeOpenedInSpaceId((item as any).openedInSpaceId ?? null);
    if (legacy !== null) return [legacy];

    // Back-compat fallback: if openedInSpaceId missing, use thread's actual spaceId (or Home).
    const fromSpaceId = normalizeOpenedInSpaceId((item as any).spaceId ?? null);
    return [fromSpaceId];
  };

  const mergeOpenedInSpaceIds = (
    existing: Array<string | null>,
    additions: Array<string | null>
  ): Array<string | null> => {
    const seen = new Set<string>();
    const out: Array<string | null> = [];
    const push = (s: string | null) => {
      const key = s ?? 'home';
      if (seen.has(key)) return;
      seen.add(key);
      out.push(s);
    };
    for (const s of existing) push(normalizeOpenedInSpaceId(s));
    for (const s of additions) push(normalizeOpenedInSpaceId(s));
    return out.length > 0 ? out : [null];
  };

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

  // IMPORTANT: start empty for SSR + first client render to avoid hydration mismatches.
  // We load from storage after mount in the initialization effect below.
  const [navigationHistory, setNavigationHistory] = useState<NavigationItem[]>([]);

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

      // REMOVED: sessionStorage fallback mechanism
      // The sessionStorage 'harvous-pending-thread' fallback has been removed because:
      // 1. NavigationContext.handleNoteCreated now handles all thread additions after note creation
      // 2. The fallback was causing duplication during page transitions
      // 3. No code writes to 'harvous-pending-thread' anymore, so this is dead code
      // Clean up any stale sessionStorage data
      try {
        sessionStorage.removeItem('harvous-pending-thread');
      } catch (error) {
        // Silently fail if sessionStorage is not available
      }
      
      // Normalize opened-in scopes (multi-scope migration + back-compat).
      // If we had to normalize anything, persist back to storage.
      const normalizedItems = (parsed as any[]).map((raw) => {
        const item = raw as NavigationItem;
        const openedInSpaceIds = getItemOpenedInSpaceIds(item);
        const hasArray = Array.isArray((item as any).openedInSpaceIds);
        const arrayMatches =
          hasArray &&
          JSON.stringify((item as any).openedInSpaceIds) === JSON.stringify(openedInSpaceIds);

        if (!hasArray || !arrayMatches) {
          needsMigration = true;
        }

        // Keep legacy single value around for older consumers (use the most recent added scope if present)
        const legacyOpenedIn = normalizeOpenedInSpaceId((item as any).openedInSpaceId ?? null);

        return {
          ...item,
          openedInSpaceIds,
          openedInSpaceId: legacyOpenedIn,
        } as NavigationItem;
      });

      if (needsMigration) {
        safeSetItem('harvous-navigation-history-v2', JSON.stringify(normalizedItems), {
          cleanupOldest: true,
          fallbackToSession: true,
        });
      }

      // Filter out specific test items (exact title matches only)
      const testItemTitles = ['Test Space', 'Test Close Icon', 'Test Immediate Nav', 'Test Event Dispatch'];
      const filteredItems = normalizedItems.filter((item: NavigationItem) => {
        if (testItemTitles.includes(item.title)) return false;
        if (typeof item.id === 'string' && item.id.startsWith('space_')) return false;
        if (isItemClosed(item.id)) return false;
        return true;
      });

      // Dedupe by id so we never expose duplicate entries (e.g. from races on note create)
      const deduped = filteredItems.reduce((acc: NavigationItem[], current: NavigationItem) => {
        const existingItem = acc.find((item) => item.id === current.id);
        if (!existingItem) {
          acc.push(current);
        } else if ((current.lastAccessed ?? 0) > (existingItem.lastAccessed ?? 0)) {
          const index = acc.findIndex((item) => item.id === current.id);
          acc[index] = current;
        }
        return acc;
      }, []);

      return deduped;
    } catch (error) {
      console.error('Error getting navigation history:', error);
      const backup = (window as any).navigationHistoryBackup || [];
      
      // Defensive: ensure backup is an array
      const safeBackup = Array.isArray(backup) ? backup : [];
      
      // Filter out specific test items from backup too (exact title matches only)
      const testItemTitles = ['Test Space', 'Test Close Icon', 'Test Immediate Nav', 'Test Event Dispatch'];
      const filteredBackup = safeBackup.filter((item: NavigationItem) => {
        if (testItemTitles.includes(item.title)) return false;
        if (typeof item.id === 'string' && item.id.startsWith('space_')) return false;
        if (isItemClosed(item.id)) return false;
        return true;
      });

      const dedupedBackup = filteredBackup.reduce((acc: NavigationItem[], current: NavigationItem) => {
        const existingItem = acc.find((item) => item.id === current.id);
        if (!existingItem) {
          acc.push(current);
        } else if ((current.lastAccessed ?? 0) > (existingItem.lastAccessed ?? 0)) {
          const index = acc.findIndex((item) => item.id === current.id);
          acc[index] = current;
        }
        return acc;
      }, []);

      return dedupedBackup;
    }
  };

  // Save navigation history to storage
  const saveNavigationHistory = (history: NavigationItem[]) => {
    // Handle SSR - do nothing if not in browser
    if (typeof window === 'undefined') {
      return;
    }

    // Dedupe by id so we never persist duplicate entries (e.g. from races on note create)
    const deduped = history.reduce((acc: NavigationItem[], current: NavigationItem) => {
      const existingItem = acc.find((item) => item.id === current.id);
      if (!existingItem) {
        acc.push(current);
      } else if ((current.lastAccessed ?? 0) > (existingItem.lastAccessed ?? 0)) {
        const index = acc.findIndex((item) => item.id === current.id);
        acc[index] = current;
      }
      return acc;
    }, []);

    try {
      const jsonString = JSON.stringify(deduped);
      const success = safeSetItem('harvous-navigation-history-v2', jsonString, {
        cleanupOldest: true,
        fallbackToSession: true,
      });
      
      // Also update the backup
      (window as any).navigationHistoryBackup = [...deduped];

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
    // Spaces should not appear as persistent nav buttons; they live only in the space switcher dropdown.
    if (item.id.startsWith('space_')) {
      return;
    }

    // Skip specific test items (exact title matches only)
    const testItemTitles = ['Test Space', 'Test Close Icon', 'Test Immediate Nav', 'Test Event Dispatch'];
    if (testItemTitles.includes(item.title)) {
      return;
    }

    // Remove from closed items list if it was previously closed
    // This handles the case where user explicitly navigates to a closed item
    removeFromClosedItems(item.id);

    // When adding unorganized to history, clear the closed flag so it shows in mobile nav
    if (item.id === 'thread_unorganized') {
      safeRemoveItem('unorganized-thread-closed');
    }

    // Use raw history so we preserve spaces when saving (getNavigationHistory filters out spaces)
    const rawHistory = getRawNavigationHistory();

    // Check if item already exists - use strict equality check
    const existingIndex = rawHistory.findIndex((h: any) => h.id === item.id);

    const itemOpenedInSpaceIds = mergeOpenedInSpaceIds(
      getItemOpenedInSpaceIds(item),
      [getSelectedSpaceId()]
    );

    if (existingIndex !== -1) {
      // Item already exists - update lastAccessed time but keep position
      const existingItem = rawHistory[existingIndex];
      const preservedFirstAccessed = (existingItem.firstAccessed != null) ? existingItem.firstAccessed : Date.now();
      rawHistory[existingIndex] = {
        ...existingItem,
        ...item,
        openedInSpaceIds: mergeOpenedInSpaceIds(getItemOpenedInSpaceIds(existingItem), getItemOpenedInSpaceIds(item)),
        openedInSpaceId: normalizeOpenedInSpaceId((item as any).openedInSpaceId ?? null),
        firstAccessed: preservedFirstAccessed,
        lastAccessed: Date.now()
      };
    } else {
      // Item doesn't exist - add to the end (first time opening behavior)
      const newItem: NavigationItem = {
        ...item,
        openedInSpaceIds: itemOpenedInSpaceIds,
        openedInSpaceId: normalizeOpenedInSpaceId((item as any).openedInSpaceId ?? null),
        firstAccessed: Date.now(),
        lastAccessed: Date.now()
      };
      rawHistory.push(newItem);
    }

    // Sort by firstAccessed to maintain chronological order (full list: threads + spaces)
    rawHistory.sort((a: any, b: any) => {
      const aFirst = (a.firstAccessed != null) ? a.firstAccessed : Number.MAX_SAFE_INTEGER;
      const bFirst = (b.firstAccessed != null) ? b.firstAccessed : Number.MAX_SAFE_INTEGER;
      return aFirst - bFirst;
    });

    // Remove any duplicates by ID (defensive programming)
    const uniqueHistory = rawHistory.reduce((acc: any[], current: any) => {
      const existing = acc.find((i: any) => i.id === current.id);
      if (!existing) {
        acc.push(current);
      } else if ((current.lastAccessed ?? 0) > (existing.lastAccessed ?? 0)) {
        const index = acc.findIndex((i: any) => i.id === current.id);
        acc[index] = current;
      }
      return acc;
    }, []);

    uniqueHistory.sort((a: any, b: any) => {
      const aFirst = (a.firstAccessed != null) ? a.firstAccessed : Number.MAX_SAFE_INTEGER;
      const bFirst = (b.firstAccessed != null) ? b.firstAccessed : Number.MAX_SAFE_INTEGER;
      return aFirst - bFirst;
    });

    // Limit to 10 items, keeping the most recently accessed (full list so spaces are preserved)
    const limitedHistory = uniqueHistory.length > 10 ? uniqueHistory.slice(0, 10) : uniqueHistory;

    saveNavigationHistory(limitedHistory);
    setNavigationHistory(getNavigationHistory());

    // CRITICAL: Dispatch custom event to notify PersistentNavigation to refresh
    // This is needed because React Context updates don't reliably propagate during View Transitions
    // Use setTimeout to ensure child components have mounted and set up their event listeners
    if (typeof window !== 'undefined') {
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('navigationHistoryUpdated'));
      }, 0);
    }
  };

  // Helper function to get the current active item ID
  // Returns the active thread/space ID, handling note pages by returning their parent thread
  const getCurrentActiveItemId = (): string => {
    // Handle SSR - return empty string if not in browser
    if (typeof window === 'undefined') {
      return '';
    }

    const currentPath = window.location.pathname;
    const currentItemId = extractIdFromPath(currentPath) ?? (currentPath.startsWith('/') ? currentPath.substring(1) : currentPath);

    // If we're on a note page, we need to determine the parent thread
    if (currentItemId.startsWith('note_')) {
      // Priority 0: Check if this note was recently created - use sessionStorage thread ID
      // This handles the race condition where DOM data attributes haven't updated yet
      try {
        const recentNotesStr = sessionStorage.getItem('recentlyCreatedNotes');
        if (recentNotesStr) {
          const recentNotes = JSON.parse(recentNotesStr);
          const fiveSecondsAgo = Date.now() - 5000;
          // Find if current note was recently created
          const recentNote = recentNotes.find((n: any) =>
            n.noteId === currentItemId && n.timestamp > fiveSecondsAgo
          );
          if (recentNote && recentNote.threadId) {
            return recentNote.threadId;
          }
        }
      } catch {
        // Ignore sessionStorage errors, fall through to DOM-based detection
      }

      // Priority 1: try to get from navigation element (set by Layout - more reliable for unorganized notes)
      const navigationElement =
        (document.querySelector('[data-navigation-active="true"]') as HTMLElement | null) ??
        (document.querySelector('[slot="navigation"]') as HTMLElement | null);

      if (navigationElement && navigationElement.dataset.parentThreadId) {
        return navigationElement.dataset.parentThreadId;
      }

      // Priority 2: try to get parent thread from note element (fallback)
      const noteElement = document.querySelector('[data-note-id]') as HTMLElement;

      if (noteElement && noteElement.dataset.parentThreadId) {
        return noteElement.dataset.parentThreadId;
      }

      // Final fallback: assume unorganized thread
      return 'thread_unorganized';
    }

    return currentItemId;
  };

  // Get raw navigation history from storage (including spaces)
  // Used when finding next item after closing, since getNavigationHistory filters out spaces
  const getRawNavigationHistory = (): any[] => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = safeGetItem('harvous-navigation-history-v2');
      const parsed = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error('Error getting raw navigation history:', error);
      return [];
    }
  };

  // Remove item from navigation history
  const removeFromNavigationHistory = (itemId: string, options?: RemoveFromNavigationHistoryOptions) => {
    const navigateIfActive = options?.navigateIfActive !== false;
    const history = getNavigationHistory();
    
    // Check if the item being removed is currently active
    const currentActiveItemId = getCurrentActiveItemId();
    // For spaces, also check if it's the selected space (in case pathname doesn't match)
    const selectedSpaceId = getSelectedSpaceId();
    const isActive = itemId === currentActiveItemId || (itemId.startsWith('space_') && itemId === selectedSpaceId);
    
    // If removing an active item, navigate to the next available item first
    if (isActive) {
      // Use raw history (including spaces) to find next item
      const rawHistory = getRawNavigationHistory();
      // When closing a thread with sameTitleAs, remove itemId and all same-title threads so the thread disappears from nav
      const sameTitleIds =
        itemId.startsWith('thread_') && options?.sameTitleAs
          ? rawHistory
              .filter(
                (item: any) =>
                  item?.id?.startsWith('thread_') &&
                  item.title === options.sameTitleAs &&
                  item.id !== itemId
              )
              .map((item: any) => item.id)
          : [];
      const idsToRemove = [itemId, ...sameTitleIds];
      const filteredRawHistory = rawHistory.filter((item: any) => !idsToRemove.includes(item.id));
      const filteredHistory = history.filter((item) => !idsToRemove.includes(item.id));

      const closedIds = getClosedItems();
      const isSpaceOpened = (item: any) =>
        item?.id && item.id.startsWith('space_') && item.id !== itemId && !closedIds.includes(item.id);
      let nextItem = null;
      if (itemId.startsWith('space_')) {
        nextItem = filteredRawHistory.find((item: any) => isSpaceOpened(item)) || null;
      } else {
        const currentIndex = filteredRawHistory.findIndex((item: any) => item.id === itemId);
        nextItem =
          currentIndex !== -1
            ? (filteredRawHistory[currentIndex + 1] || filteredRawHistory[currentIndex - 1] || null)
            : null;
      }

      idsToRemove.forEach((id) => addToClosedItems(id));
      
      // Special handling for unorganized thread
      if (itemId === 'thread_unorganized') {
        safeSetItem('unorganized-thread-closed', 'true', {
          cleanupOldest: false,
          fallbackToSession: true,
        });
      }
      
      // Save the updated raw history (includes spaces) to storage
      saveNavigationHistory(filteredRawHistory);
      // Use spread operator to create new array reference for React (filtered, no spaces)
      setNavigationHistory([...filteredHistory]);

      if (typeof window !== 'undefined') {
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('navigationHistoryUpdated'));
        }, 0);
      }
      
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
      
      // Navigate to next item, current space, or dashboard (unless caller will navigate, e.g. Erase Space → Menu goes to /)
      if (navigateIfActive) {
        let targetUrl: string;
        if (nextItem) {
          targetUrl = `${idToUrl(nextItem.id)}?closed=${encodeURIComponent(itemId)}`;
        } else {
          const selectedSpaceId = getSelectedSpaceId();
          targetUrl = selectedSpaceId && selectedSpaceId.startsWith('space_') ? idToUrl(selectedSpaceId) : '/';
        }
        if (document.hidden) {
          window.location.href = targetUrl;
          return;
        }
        import('astro:transitions/client')
          .then(({ navigate }) => {
            navigate(targetUrl, { history: 'replace' });
          })
          .catch(async (error) => {
            const errorObj = error instanceof Error ? error : new Error(String(error));
            console.warn('View Transitions import failed, using standard navigation:', errorObj);
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
      }
      return; // Exit early since we're navigating or caller will navigate
    }
    
    // Proceed with removal (for non-active items)
    // Use raw history to ensure spaces are also removed from storage
    const rawHistory = getRawNavigationHistory();
    // When closing a thread with sameTitleAs, remove itemId and all same-title threads
    const sameTitleIdsNonActive =
      itemId.startsWith('thread_') && options?.sameTitleAs
        ? rawHistory
            .filter(
              (item: any) =>
                item?.id?.startsWith('thread_') &&
                item.title === options.sameTitleAs &&
                item.id !== itemId
            )
            .map((item: any) => item.id)
        : [];
    const idsToRemoveNonActive = [itemId, ...sameTitleIdsNonActive];
    const filteredRawHistory = rawHistory.filter((item: any) => !idsToRemoveNonActive.includes(item.id));
    const filteredHistory = history.filter((item) => !idsToRemoveNonActive.includes(item.id));

    idsToRemoveNonActive.forEach((id) => addToClosedItems(id));

    // Special handling for unorganized thread
    if (itemId === 'thread_unorganized') {
      safeSetItem('unorganized-thread-closed', 'true', {
        cleanupOldest: false,
        fallbackToSession: true,
      });
    }
    
    // Save the updated raw history (includes spaces) to storage
    saveNavigationHistory(filteredRawHistory);
    // Use spread operator to create new array reference for React (filtered, no spaces)
    setNavigationHistory([...filteredHistory]);

    if (typeof window !== 'undefined') {
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('navigationHistoryUpdated'));
      }, 0);
    }
  };

  // Extract item data from page
  const extractItemDataFromPage = (currentItemId: string): Omit<NavigationItem, 'firstAccessed' | 'lastAccessed'> | null => {
    // Handle SSR - return null if not in browser
    if (typeof window === 'undefined') {
      return null;
    }

    // Get data from the stable navigation wrapper (set by NavigationColumnReact.astro).
    // NOTE: The `slot="navigation"` attribute is not reliable at runtime with view transitions.
    const navigationElement =
      (document.querySelector('[data-navigation-active="true"]') as HTMLElement | null) ??
      (document.querySelector('[slot="navigation"]') as HTMLElement | null);

    // For notes, try fallback to data-note-id element if navigation element not found
    if (currentItemId.startsWith('note_') && !navigationElement) {
      const noteElement = document.querySelector('[data-note-id]') as HTMLElement;
      if (noteElement && noteElement.dataset.parentThreadId) {
        return {
          id: noteElement.dataset.parentThreadId,
          title: noteElement.dataset.parentThreadTitle || 'Thread',
          count: parseInt(noteElement.dataset.parentThreadCount || '0'),
          backgroundGradient: noteElement.dataset.parentThreadBackgroundGradient || 'var(--color-gradient-gray)',
          spaceId: noteElement.dataset.parentThreadSpaceId || null,
        };
      }
    }

    if (!navigationElement) {
      return null;
    }

    // Page-level metadata is more reliable than the navigation wrapper during View Transitions
    // because the React island can be preserved while the main content swaps.
    const pageMetaElement =
      (document.querySelector(`[data-navigation-item="${currentItemId}"]`) as HTMLElement | null) ??
      (document.querySelector('[data-navigation-item]') as HTMLElement | null);

    // For notes, use parent thread data
    if (currentItemId.startsWith('note_')) {
      const parentThreadId = navigationElement.dataset.parentThreadId;
      if (parentThreadId) {
        return {
          id: parentThreadId,
          title: navigationElement.dataset.parentThreadTitle || 'Thread',
          count: parseInt(navigationElement.dataset.parentThreadCount || '0'),
          backgroundGradient: navigationElement.dataset.parentThreadBackgroundGradient || 'var(--color-gradient-gray)',
          spaceId: navigationElement.dataset.parentThreadSpaceId || null,
        };
      }
      
      // Fallback: try to get from data-note-id element
      const noteElement = document.querySelector('[data-note-id]') as HTMLElement;
      if (noteElement && noteElement.dataset.parentThreadId) {
        return {
          id: noteElement.dataset.parentThreadId,
          title: noteElement.dataset.parentThreadTitle || 'Thread',
          count: parseInt(noteElement.dataset.parentThreadCount || '0'),
          backgroundGradient: noteElement.dataset.parentThreadBackgroundGradient || 'var(--color-gradient-gray)',
          spaceId: noteElement.dataset.parentThreadSpaceId || null,
        };
      }
    }
    
    // For threads
    if (currentItemId.startsWith('thread_') || navigationElement.dataset.threadId || navigationElement.dataset.threadTitle) {
      // CRITICAL: if we're on a thread route, the URL is the source of truth for the ID.
      // The navigation wrapper dataset can be stale under View Transitions.
      const threadId = currentItemId.startsWith('thread_') ? currentItemId : (navigationElement.dataset.threadId || null);
      if (threadId) {
        const titleFromPage = pageMetaElement?.dataset?.title;
        const countFromPage = pageMetaElement?.dataset?.count;
        const gradientFromPage = pageMetaElement?.dataset?.backgroundGradient;
        return {
          id: threadId,
          title: titleFromPage || navigationElement.dataset.threadTitle || 'Thread',
          count: parseInt(countFromPage || navigationElement.dataset.threadNoteCount || '0'),
          backgroundGradient: gradientFromPage || navigationElement.dataset.threadBackgroundGradient || 'var(--color-gradient-gray)',
          spaceId: navigationElement.dataset.threadSpaceId || null,
        };
      }
    }
    
    // For spaces
    if (currentItemId.startsWith('space_') || navigationElement.dataset.spaceId || navigationElement.dataset.spaceTitle) {
      // Same issue as threads: prefer the URL ID when on a space route.
      const spaceId = currentItemId.startsWith('space_') ? currentItemId : (navigationElement.dataset.spaceId || null);
      if (spaceId) {
        const titleFromPage = pageMetaElement?.dataset?.title;
        const countFromPage = pageMetaElement?.dataset?.count;
        const gradientFromPage = pageMetaElement?.dataset?.backgroundGradient;
        return {
          id: spaceId,
          title: titleFromPage || navigationElement.dataset.spaceTitle || 'Space',
          count: parseInt(countFromPage || navigationElement.dataset.spaceItemCount || '0'),
          backgroundGradient: gradientFromPage || navigationElement.dataset.spaceBackgroundGradient || 'var(--color-gradient-gray)'
        };
      }
    }
    
    return null;
  };

  const getOpenedInSpaceIdForCurrentLocation = (): string | null => {
    if (typeof window === 'undefined') return null;
    try {
      const fromQuery = normalizeOpenedInSpaceId(new URLSearchParams(window.location.search).get('space'));
      return fromQuery ?? getSelectedSpaceId();
    } catch {
      return getSelectedSpaceId();
    }
  };

  // Track navigation access with retry logic
  const trackNavigationAccess = (retryCount = 0) => {
    // Handle SSR - do nothing if not in browser
    if (typeof window === 'undefined') {
      return;
    }

    const currentPath = window.location.pathname;
    const currentItemId = extractIdFromPath(currentPath) ?? (currentPath.startsWith('/') ? currentPath.substring(1) : currentPath);

    // Skip dashboard and empty paths
    if (currentItemId === 'dashboard' || currentItemId === '' || currentItemId === 'sign-in' || currentItemId === 'sign-up') {
      return;
    }

    // Skip pages that don't have navigation data (profile, find, etc.)
    const pagesWithoutNavigationData = ['profile', 'search', 'new-space', 'new-thread'];
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
    const itemData = extractItemDataFromPage(currentItemId);
    const openedInSpaceId = getOpenedInSpaceIdForCurrentLocation();

    // Retry logic: if element not found and we haven't retried too many times, retry after a delay
    if (!itemData && retryCount < 3) {
      const retryDelay = 100 * (retryCount + 1); // 100ms, 200ms, 300ms
      setTimeout(() => {
        trackNavigationAccess(retryCount + 1);
      }, retryDelay);
      return;
    }

    if (itemData) {
      // Special handling for spaces - they need to be tracked separately
      // because addToNavigationHistory explicitly skips spaces
      if (itemData.id.startsWith('space_')) {
        // Get current active item ID to check if user explicitly navigated to this space
        const currentActiveItemId = getCurrentActiveItemId();
        const isCurrentlyActive = itemData.id === currentActiveItemId;
        
        // Check if space was closed
        if (isItemClosed(itemData.id)) {
          if (isCurrentlyActive) {
            // User is viewing the space - restore it
            removeFromClosedItems(itemData.id);
          } else {
            // Space is closed and user isn't viewing it - don't add it back
            return;
          }
        }
        
        // Handle space tracking manually (similar to addSpaceToNavigationHistory in NavigationColumn)
        const rawHistory = getRawNavigationHistory();
        const existingIndex = rawHistory.findIndex((item: any) => item.id === itemData.id);
        
        let updatedHistory: any[];
        
        if (existingIndex !== -1) {
          // Update existing space
          updatedHistory = rawHistory.map((item: any, index: number) => {
            if (index === existingIndex) {
              return {
                ...item,
                title: itemData.title,
                backgroundGradient: itemData.backgroundGradient || item.backgroundGradient || 'var(--color-paper)',
                count: itemData.count ?? item.count,
                lastAccessed: Date.now()
              };
            }
            return item;
          });
        } else {
          // Add new space
          const newSpace = {
            id: itemData.id,
            title: itemData.title,
            backgroundGradient: itemData.backgroundGradient || 'var(--color-paper)',
            count: itemData.count ?? 0,
            firstAccessed: Date.now(),
            lastAccessed: Date.now()
          };
          updatedHistory = [...rawHistory, newSpace];
        }
        
        // Sort by firstAccessed to maintain chronological order
        updatedHistory.sort((a: any, b: any) => {
          const aFirst = (a.firstAccessed != null) ? a.firstAccessed : Number.MAX_SAFE_INTEGER;
          const bFirst = (b.firstAccessed != null) ? b.firstAccessed : Number.MAX_SAFE_INTEGER;
          return aFirst - bFirst;
        });
        
        // Limit to 10 items
        const limitedHistory = updatedHistory.length > 10 ? updatedHistory.slice(0, 10) : updatedHistory;
        
        // Save to storage
        saveNavigationHistory(limitedHistory);
        
        // Update React state (filtered, no spaces)
        const filteredHistory = limitedHistory.filter((item: any) => !item.id.startsWith('space_'));
        setNavigationHistory(filteredHistory);
        
        // Dispatch event to update UI
        if (typeof window !== 'undefined') {
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('navigationHistoryUpdated'));
          }, 0);
        }
        
        // Refresh counts from API after updating
        refreshNavigationCounts();
        return; // Exit early - space handling is complete
      }

      const itemDataWithOpenedIn = {
        ...itemData,
        openedInSpaceIds: [openedInSpaceId],
        openedInSpaceId: openedInSpaceId,
      };

      // Special handling for unorganized thread
      if (currentItemId === 'thread_unorganized' || itemData.id === 'thread_unorganized') {
        safeRemoveItem('unorganized-thread-closed');
        // Also remove from closed items list if it was there
        removeFromClosedItems('thread_unorganized');
      }

      // Check if this is a new item (not in history yet)
      // Use raw history so we don't drop spaces when saving (getNavigationHistory filters out spaces)
      const rawHistory = getRawNavigationHistory();
      const existingItem = rawHistory.find((h: any) => h.id === itemData.id);

      // Get current active item ID to check if user explicitly navigated to this item
      // For notes: if we extracted thread data, check if we're viewing content in this thread
      // For threads/spaces: check if we're directly viewing this item
      const currentActiveItemId = getCurrentActiveItemId();
      const isCurrentlyActive = itemData.id === currentActiveItemId ||
        (currentItemId.startsWith('note_') && itemData.id && itemData.id.startsWith('thread_'));

      if (!existingItem) {
        // Item doesn't exist in history - check if it was closed
        if (isItemClosed(itemData.id)) {
          // Item was previously closed
          if (isCurrentlyActive) {
            // User is viewing content in this thread - restore it
            removeFromClosedItems(itemData.id);
            addToNavigationHistory(itemDataWithOpenedIn);

            // Refresh counts from API after adding new item to ensure accuracy
            // Use debounced version to prevent multiple rapid refreshes
            refreshNavigationCountsImmediate();
          } else {
            // Item is closed and user isn't viewing it - don't add it back
            return;
          }
        } else {
          // Item is not closed - add it to history (first time opening)
          addToNavigationHistory(itemDataWithOpenedIn);

          // Refresh counts from API after adding new item to ensure accuracy (retry logic handles transient failures)
          refreshNavigationCounts();
        }
      } else {
        // Item exists in history - update it
        // If it was closed but user is now viewing it, remove from closed list
        if (isItemClosed(itemData.id) && isCurrentlyActive) {
          removeFromClosedItems(itemData.id);
        }

        // Update the item data but DON'T change its position (use raw history to preserve spaces)
        const existingIndex = rawHistory.findIndex((h: any) => h.id === itemData.id);
        const updatedRawHistory = rawHistory.map((item: any, index: number) => {
          if (index === existingIndex) {
            const mergedScopes = mergeOpenedInSpaceIds(getItemOpenedInSpaceIds(item), [openedInSpaceId]);
            return {
              ...item,
              ...itemData,
              openedInSpaceIds: mergedScopes,
              openedInSpaceId: openedInSpaceId,
              lastAccessed: Date.now()
            };
          }
          return item;
        });

        saveNavigationHistory(updatedRawHistory);
        setNavigationHistory(getNavigationHistory());

        // CRITICAL: Dispatch custom event to force UI update during View Transitions
        // React Context updates don't always trigger re-renders during View Transitions
        // Use setTimeout to ensure child components have mounted and set up their event listeners
        if (typeof window !== 'undefined') {
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('navigationHistoryUpdated'));
          }, 0);
        }

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
      // Use raw history so we preserve spaces when saving (getNavigationHistory filters out spaces)
      const rawHistory = getRawNavigationHistory();
      
      // Get unorganized thread from API response
      const unorganizedThreadFromAPI = threads.find((t: any) => t.id === 'thread_unorganized');
      const unorganizedCountFromAPI = unorganizedThreadFromAPI?.noteCount || 0;
      
      const updatedHistory = rawHistory.map((item: any) => {
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
              return { ...item, count: newCount, spaceId: threadData.spaceId ?? item.spaceId ?? null };
            }
            // If API count is lower, it might be stale - keep current count
            // But still fill spaceId if missing.
            if (item.spaceId == null && threadData.spaceId != null) {
              return { ...item, spaceId: threadData.spaceId };
            }
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
                return { ...item, count: newCount, spaceId: null };
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
      const hasChanges = rawHistory.length !== filteredHistory.length ||
        rawHistory.some((item: any, index: number) => {
          const filteredItem = filteredHistory[index];
          return !filteredItem || item.count !== filteredItem.count;
        });

      // Save and update state if there were changes (filteredHistory includes spaces)
      if (hasChanges) {
        saveNavigationHistory(filteredHistory);
        setNavigationHistory(getNavigationHistory());
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

  // Validation cache to prevent redundant API calls (threads + spaces for stale-item cleanup)
  const validationCache = useRef<{ timestamp: number; threadIds: Set<string>; spaceIds: Set<string> } | null>(null);
  const VALIDATION_CACHE_DURATION = 60 * 1000; // 1 minute cache
  const VALIDATION_DEBOUNCE_DELAY = 2000; // 2 seconds debounce
  const validationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Track recently created notes to avoid double-counting
  // When a note is created with a suggested thread, it's immediately added to that thread
  // We shouldn't decrement unorganized if the note was never actually in unorganized
  const recentlyCreatedNotes = useRef<Set<string>>(new Set());

  // Function to validate navigation history and remove deleted threads and spaces
  const validateNavigationHistory = async (force = false) => {
    try {
      // Check cache first - skip if recent validation exists and not forced
      const now = Date.now();
      if (!force && validationCache.current && (now - validationCache.current.timestamp) < VALIDATION_CACHE_DURATION) {
        const threadIds = validationCache.current.threadIds;
        const spaceIds = validationCache.current.spaceIds ?? new Set<string>();
        const rawHistory = getRawNavigationHistory();
        const thirtySecondsAgo = Date.now() - 30000;

        const validatedHistory = rawHistory.filter((item: any) => {
          if (item.firstAccessed > thirtySecondsAgo) return true;
          if (item.id.startsWith('space_')) return spaceIds.size === 0 || spaceIds.has(item.id);
          if (item.id === 'thread_unorganized') return true;
          if (item.id.startsWith('thread_')) return threadIds.has(item.id);
          return true;
        });

        if (validatedHistory.length < rawHistory.length) {
          saveNavigationHistory(validatedHistory);
          setNavigationHistory(getNavigationHistory());
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

      // Fetch current threads and spaces in one call (used for dropdown + nav; validates both)
      const response = await safeFetch('/api/navigation/data');
      
      if (!response || !response.ok) {
        return;
      }
      
      const data = await response.json();
      const threads = data.threads ?? [];
      const spaces = data.spaces ?? [];
      const threadIds = new Set<string>(threads.map((t: any) => t.id as string));
      const spaceIds = new Set<string>(spaces.map((s: any) => s.id as string));
      
      validationCache.current = {
        timestamp: now,
        threadIds,
        spaceIds
      };
      
      const rawHistory = getRawNavigationHistory();
      const thirtySecondsAgo = Date.now() - 30000;

      const validatedHistory = rawHistory.filter((item: any) => {
        if (item.firstAccessed > thirtySecondsAgo) return true;
        if (item.id.startsWith('space_')) return spaceIds.has(item.id);
        if (item.id === 'thread_unorganized') return true;
        if (item.id.startsWith('thread_')) return threadIds.has(item.id);
        return true;
      });
      
      if (validatedHistory.length < rawHistory.length) {
        saveNavigationHistory(validatedHistory);
        setNavigationHistory(getNavigationHistory());
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

    // Seed navigation history from API when empty (e.g. first load in production, new device).
    // Ensures mobile dropdown shows threads/spaces even before user has navigated to them.
    // In production Clerk may not be ready on first mount, so retry after short delays.
    const seedFromApiWhenEmpty = async () => {
      try {
        if (typeof window === 'undefined' || !navigator.onLine) return;
        const rawHistory = getRawNavigationHistory();
        const hasThreads = rawHistory.some((item: any) => item?.id?.startsWith('thread_'));
        if (hasThreads) return;
        if (!isAuthReady()) return;

        const response = await safeFetch('/api/navigation/data');
        if (!response?.ok) return;
        const data = await response.json();
        const threadsFromApi = data.threads ?? [];
        const spacesFromApi = data.spaces ?? [];
        const existingIds = new Set(rawHistory.map((item: any) => item.id));

        // When seeding from API (empty history), only add a minimal "recent" thread set,
        // not all threads, so nav reflects "last opened" instead of "all available."
        const MAX_RECENT_THREADS_TO_SEED = 2;
        let recentThreadsAdded = 0;

        const now = Date.now();
        const newItems: any[] = [];

        for (const s of spacesFromApi) {
          if (!s?.id || existingIds.has(s.id)) continue;
          existingIds.add(s.id);
          newItems.push({
            id: s.id,
            title: s.title || 'Space',
            backgroundGradient: s.backgroundGradient || 'var(--color-paper)',
            count: s.totalItemCount ?? s.itemCount ?? 0,
            firstAccessed: now,
            lastAccessed: now,
          });
        }
        for (const t of threadsFromApi) {
          if (!t?.id || existingIds.has(t.id)) continue;
          // Always seed Unorganized; for other threads, only seed up to MAX_RECENT_THREADS_TO_SEED
          if (t.id !== 'thread_unorganized' && recentThreadsAdded >= MAX_RECENT_THREADS_TO_SEED) continue;
          existingIds.add(t.id);
          if (t.id !== 'thread_unorganized') recentThreadsAdded += 1;
          const spaceId = t.spaceId ?? null;
          newItems.push({
            id: t.id,
            title: t.title || 'Thread',
            count: t.noteCount ?? 0,
            backgroundGradient: t.backgroundGradient || 'var(--color-gradient-gray)',
            spaceId,
            openedInSpaceIds: spaceId != null ? [spaceId] : [null],
            openedInSpaceId: spaceId,
            firstAccessed: now,
            lastAccessed: now,
          });
        }

        if (newItems.length === 0) return;
        const combined = [...rawHistory, ...newItems];
        const limited = combined.length > 10 ? combined.slice(-10) : combined;
        saveNavigationHistory(limited);
        setNavigationHistory(getNavigationHistory());
        window.dispatchEvent(new CustomEvent('navigationHistoryUpdated'));
      } catch {
        // non-critical
      }
    };

    seedFromApiWhenEmpty();
    // Retry when auth becomes ready (production: Clerk often loads after first paint)
    const seedRetry1 = window.setTimeout(seedFromApiWhenEmpty, 1500);
    const seedRetry2 = window.setTimeout(seedFromApiWhenEmpty, 3500);

    // Backfill thread spaceIds for existing navigation history entries (once per session as needed).
    const backfillThreadSpaceIds = async () => {
      try {
        if (typeof window === 'undefined') return;
        const rawHistory = getRawNavigationHistory();
        const needsBackfill = rawHistory.some((item: any) => {
          return item?.id?.startsWith('thread_') && item.id !== 'thread_unorganized' && item.spaceId === undefined;
        });
        if (!needsBackfill) return;

        if (!isAuthReady() || !navigator.onLine) return;
        const response = await safeFetch('/api/navigation/data');
        if (!response || !response.ok) return;
        const data = await response.json();
        const threadsFromApi = data.threads || [];
        const spaceIdByThreadId = new Map<string, string | null>();
        for (const t of threadsFromApi) {
          if (t?.id) spaceIdByThreadId.set(t.id, t.spaceId ?? null);
        }

        const updatedHistory = rawHistory.map((item: any) => {
          if (!item?.id?.startsWith('thread_') || item.id === 'thread_unorganized') return item;
          if (item.spaceId !== undefined) return item;
          return { ...item, spaceId: spaceIdByThreadId.get(item.id) ?? null };
        });

        saveNavigationHistory(updatedHistory);
        setNavigationHistory(getNavigationHistory());
        window.dispatchEvent(new CustomEvent('navigationHistoryUpdated'));
      } catch {
        // non-critical
      }
    };

    backfillThreadSpaceIds();
    
    // Run forced validation once after auth is likely ready (e.g. fresh sign-in on another browser).
    // This clears stale spaces/threads from localStorage so dropdown and nav don't show deleted items.
    const runInitialValidation = () => {
      const delay = 1500;
      setTimeout(() => {
        if (isAuthReady() && navigator.onLine) {
          validateNavigationHistory(true);
        } else {
          debouncedValidate();
        }
      }, delay);
    };

    // Delay validation to avoid blocking initial render
    const scheduleValidation = () => {
      if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(() => {
          runInitialValidation();
        }, { timeout: 3000 });
      } else {
        setTimeout(runInitialValidation, 2000);
      }
    };
    
    scheduleValidation();
    
    // Listen for View Transitions and page loads
    // Use requestAnimationFrame to ensure updates happen after DOM is ready
    const handlePageLoad = () => {
      // Use requestAnimationFrame for immediate visual updates
      requestAnimationFrame(() => {
        // Refresh navigation history from localStorage on page load
        // This ensures we have the latest data after navigation
        refreshHistory();
        trackNavigationAccess();
        
        // Check if we're on a note page and refresh navigation counts
        // This ensures badge counts are accurate when navigating to note pages
        // This is especially important after creating a note with a suggested thread and redirecting
        const currentPath = window.location.pathname;
        const isNotePage = currentPath.startsWith('/note/');
        
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
        
        // CRITICAL: Update localStorage SYNCHRONOUSLY before React state update
        // Use raw history so we preserve spaces when saving
        const rawHistory = getRawNavigationHistory();
        const threadIndex = rawHistory.findIndex((item: any) => item.id === actualThreadId);
        
        if (threadIndex !== -1) {
          // Thread exists in history - update the count immediately
          const existingItem = rawHistory[threadIndex];
          const oldCount = existingItem.count || 0;
          const newCount = oldCount + 1;
          
          // Update localStorage SYNCHRONOUSLY (before React state update)
          const updatedRawHistory = rawHistory.map((item: any, index: number) =>
            index === threadIndex
              ? { ...item, count: newCount }
              : item
          );
          saveNavigationHistory(updatedRawHistory);
          setNavigationHistory(getNavigationHistory());
          
          // Dispatch event for UI update
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('navigationHistoryUpdated'));
          }
          
          // Check if entry has incomplete data and fetch full data in background
          const needsFullData = existingItem.title === existingItem.id || !existingItem.backgroundGradient || existingItem.backgroundGradient === 'var(--color-paper)';
          if (needsFullData) {
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
                    const rawHistory = getRawNavigationHistory();
                    const fullDataHistory = rawHistory.map((item: any) =>
                      item.id === actualThreadId
                        ? {
                            ...item,
                            title: threadData.title,
                            backgroundGradient: threadData.backgroundGradient || item.backgroundGradient
                          }
                        : item
                    );
                    saveNavigationHistory(fullDataHistory);
                    setNavigationHistory(getNavigationHistory());
                  }
                }
              })
              .catch(error => {
                console.error('NavigationContext: Error fetching thread data for update:', error);
              });
          }
        } else {
          // Thread not in history - we need to fetch it and add it (unless caller will navigate to note)
          // CRITICAL: When note is created in unorganized, add unorganized synchronously even if we're about to navigate.
          // This ensures the desktop nav shows Unorganized before/after navigation (trackNavigationAccess can run before new DOM is ready).
          if (actualThreadId === 'thread_unorganized' && !wasCreatedWithThread) {
            addToNavigationHistory({
              id: 'thread_unorganized',
              title: 'Unorganized',
              count: 1, // At least 1 (the new note)
              backgroundGradient: 'linear-gradient(180deg, var(--color-paper) 0%, var(--color-paper) 100%)'
            });
          } else if (event.detail?.willNavigateToNote) {
            // Do nothing - trackNavigationAccess will handle it on the new page
          } else if (isAuthReady()) {
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
          }
        }
        
        // Refresh counts from API after a delay to ensure database is committed
        // Use debounced version to prevent multiple rapid refreshes from overwriting each other
        debouncedRefreshNavigationCounts();
      }
    };

    // Listen for note removal from thread events
    const handleNoteRemovedFromThread = (event: CustomEvent) => {
      const { noteId, threadId } = event.detail;
      if (threadId) {
        // Use raw history so we preserve spaces when saving
        const rawHistory = getRawNavigationHistory();
        const threadIndex = rawHistory.findIndex((item: any) => item.id === threadId);
        const unorganizedIndex = rawHistory.findIndex((item: any) => item.id === 'thread_unorganized');
        
        const updatedRawHistory = rawHistory.map((item: any, index: number) => {
          if (index === threadIndex) {
            const oldCount = item.count || 0;
            return { ...item, count: Math.max(0, oldCount - 1) };
          }
          if (index === unorganizedIndex) {
            const oldUnorganizedCount = item.count || 0;
            return { ...item, count: oldUnorganizedCount + 1 };
          }
          return item;
        });
        
        saveNavigationHistory(updatedRawHistory);
        setNavigationHistory(getNavigationHistory());
        
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
    const handleThreadUpdated = (event: CustomEvent) => {
      const { threadId } = event.detail || {};
      if (!threadId) return;
      
      // Fetch updated thread data and update navigation history
      if (!isAuthReady()) {
        return; // Auth not ready yet
      }
      
      safeFetch('/api/threads/list')
        .then(response => {
          if (response && response.ok) {
            return response.json();
          }
          return null;
        })
        .then(threads => {
          if (threads) {
            const threadData = threads.find((t: any) => t.id === threadId);
            if (threadData) {
              const rawHistory = getRawNavigationHistory();
              const threadIndex = rawHistory.findIndex((item: any) => item.id === threadId);
              if (threadIndex !== -1) {
                const updatedRawHistory = rawHistory.map((item: any, index: number) =>
                  index === threadIndex
                    ? {
                        ...item,
                        title: threadData.title,
                        backgroundGradient: threadData.backgroundGradient || item.backgroundGradient
                      }
                    : item
                );
                saveNavigationHistory(updatedRawHistory);
                setNavigationHistory(getNavigationHistory());
                window.dispatchEvent(new CustomEvent('navigationHistoryUpdated'));
              }
            }
          }
        })
        .catch(error => {
          console.error('NavigationContext: Error fetching thread data for update:', error);
        });
    };
    
    // Listen for space update events
    const handleSpaceUpdated = (event: CustomEvent) => {
      const { spaceId, title, backgroundGradient } = event.detail || {};
      if (!spaceId) return;
      
      // Use event detail if available (immediate update), otherwise fetch from API
      if (title && backgroundGradient) {
        const rawHistory = getRawNavigationHistory();
        const spaceIndex = rawHistory.findIndex((item: any) => item.id === spaceId);
        if (spaceIndex !== -1) {
          const updatedRawHistory = rawHistory.map((item: any, index: number) =>
            index === spaceIndex
              ? { ...item, title, backgroundGradient }
              : item
          );
          saveNavigationHistory(updatedRawHistory);
          setNavigationHistory(getNavigationHistory());
          window.dispatchEvent(new CustomEvent('navigationHistoryUpdated'));
        }
      } else {
        // Fallback: fetch from API if event detail is incomplete
        if (!isAuthReady()) {
          return; // Auth not ready yet
        }
        
        safeFetch('/api/navigation/data')
          .then(response => {
            if (response && response.ok) {
              return response.json();
            }
            return null;
          })
          .then(data => {
            if (data && data.spaces) {
              const spaceData = data.spaces.find((s: any) => s.id === spaceId);
              if (spaceData) {
                const rawHistory = getRawNavigationHistory();
                const spaceIndex = rawHistory.findIndex((item: any) => item.id === spaceId);
                if (spaceIndex !== -1) {
                  const updatedRawHistory = rawHistory.map((item: any, index: number) =>
                    index === spaceIndex
                      ? {
                          ...item,
                          title: spaceData.title,
                          backgroundGradient: spaceData.backgroundGradient || item.backgroundGradient
                        }
                      : item
                  );
                  saveNavigationHistory(updatedRawHistory);
                  setNavigationHistory(getNavigationHistory());
                  window.dispatchEvent(new CustomEvent('navigationHistoryUpdated'));
                }
              }
            }
          })
          .catch(error => {
            console.error('NavigationContext: Error fetching space data for update:', error);
          });
      }
    };
    
    const handleNoteAddedToThread = (event: CustomEvent) => {
      const { noteId, threadId } = event.detail;
      if (threadId && threadId !== 'thread_unorganized') {
        // Check if this note was just created (within last 2 seconds)
        // If so, it was never actually in unorganized, so don't add unorganized to navigation
        const wasJustCreated = recentlyCreatedNotes.current.has(noteId);
        
        // Notes always start in unorganized, so when moved to a thread, decrement unorganized
        // Use raw history so we preserve spaces when saving
        const rawHistory = getRawNavigationHistory();
        const threadIndex = rawHistory.findIndex((item: any) => item.id === threadId);
        const unorganizedIndex = rawHistory.findIndex((item: any) => item.id === 'thread_unorganized');
        
        let updatedRawHistory: any[];
        let shouldRemoveUnorganized = false;
        
        if (wasJustCreated && unorganizedIndex === -1 && threadIndex !== -1) {
          updatedRawHistory = rawHistory.map((item: any, index: number) => {
            if (index === threadIndex) {
              const oldCount = item.count || 0;
              return { ...item, count: oldCount + 1 };
            }
            return item;
          });
        } else {
          updatedRawHistory = rawHistory.map((item: any, index: number) => {
            if (index === threadIndex) {
              const oldCount = item.count || 0;
              return { ...item, count: oldCount + 1 };
            }
            if (index === unorganizedIndex) {
              const oldUnorganizedCount = item.count || 0;
              const newUnorganizedCount = Math.max(0, oldUnorganizedCount - 1);
              if (newUnorganizedCount === 0) {
                shouldRemoveUnorganized = true;
                return null;
              }
              return { ...item, count: newUnorganizedCount };
            }
            return item;
          }).filter((item: any) => item !== null);
        }
        
        saveNavigationHistory(updatedRawHistory);
        setNavigationHistory(getNavigationHistory());
        if (shouldRemoveUnorganized) {
          addToClosedItems('thread_unorganized');
          safeSetItem('unorganized-thread-closed', 'true', {
            cleanupOldest: false,
            fallbackToSession: true,
          });
        }
        
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
        // Remove the space from navigation history only; Menu already navigates to /
        removeFromNavigationHistory(spaceId, { navigateIfActive: false });
        // Clear selected space so desktop nav shows "My Home" after redirect
        if (getSelectedSpaceId() === spaceId) {
          setSelectedSpaceId(null);
        }
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
        const rawHistory = getRawNavigationHistory();
        const threadIndex = rawHistory.findIndex((item: any) => item.id === actualThreadId);
        if (threadIndex !== -1) {
          const oldCount = rawHistory[threadIndex].count || 0;
          const newCount = Math.max(0, oldCount - 1);
          if (actualThreadId === 'thread_unorganized' && newCount === 0) {
            shouldCloseUnorganized = true;
          }
          const updatedRawHistory = rawHistory.map((item: any, index: number) =>
            index === threadIndex ? { ...item, count: newCount } : item
          );
          saveNavigationHistory(updatedRawHistory);
          setNavigationHistory(getNavigationHistory());
        }

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
    window.addEventListener('threadUpdated', handleThreadUpdated as unknown as EventListener);
    window.addEventListener('spaceUpdated', handleSpaceUpdated as unknown as EventListener);
    
    // Expose functions to global scope for non-React code
    (window as any).removeFromNavigationHistory = removeFromNavigationHistory;
    (window as any).addToNavigationHistory = addToNavigationHistory;
    (window as any).trackNavigationAccess = trackNavigationAccess;
    (window as any).refreshNavigation = refreshNavigation;
    
    return () => {
      window.clearTimeout(seedRetry1);
      window.clearTimeout(seedRetry2);
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
      window.removeEventListener('threadUpdated', handleThreadUpdated as unknown as EventListener);
      window.removeEventListener('spaceUpdated', handleSpaceUpdated as unknown as EventListener);
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
      
      // Update storage to persist the change (use raw history to preserve spaces)
      const rawHistory = getRawNavigationHistory();
      const updated = rawHistory.map((item: any) =>
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

