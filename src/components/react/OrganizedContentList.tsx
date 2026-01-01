import React, { useState, useEffect, useRef, useCallback } from 'react';
import InfiniteScrollList from './InfiniteScrollList';
import CardNote from './CardNote';
import CardThread from './CardThread';
import CondensedNoteItem from './CondensedNoteItem';
import { getThreadColorCSS } from '@/utils/colors';
import { debug } from '@/utils/logger';

interface OrganizedContentItem {
  id: string;
  type: 'thread' | 'note';
  title: string;
  content?: string;
  subtitle?: string;
  count?: number;
  threadId?: string;
  noteId?: string;
  accentColor?: string;
  lastUpdated?: string;
  noteType?: 'default' | 'scripture' | 'resource';
  isPrivate?: boolean;
  resourceTitle?: string | null;
  resourceDescription?: string | null;
  resourceImage?: string | null;
  threadColors?: Array<{ color: string; frequency: number }>;
  scriptureReferences?: Array<{ reference: string; noteId: string; threadColors?: Array<{ color: string; frequency: number }> }>; // Scripture references for this note (from junction table)
  lastVisited?: Date | string | null;
  createdAt?: Date | string | null;
}

interface OrganizedContentListProps {
  initialItems: OrganizedContentItem[];
  filter?: 'all' | 'threads' | 'notes' | 'scripture' | 'resources';
}

// Helper function to detect if running in PWA context
function isPWA(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches ||
         (window.navigator as any).standalone === true;
}

// Helper function to normalize dates from API responses
function normalizeDate(date: Date | string | null | undefined): Date | null {
  if (!date) return null;
  if (date instanceof Date) return date;
  if (typeof date === 'string') {
    const parsed = new Date(date);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

// Helper function to detect stale data (all items have same lastUpdated/lastVisited or all null)
function isStaleData(items: OrganizedContentItem[]): boolean {
  if (!items || items.length === 0) return false;
  
  const lastUpdatedValues = items
    .map(item => item.lastUpdated || (item as any).lastVisited)
    .filter(val => val != null)
    .map(val => {
      const normalized = normalizeDate(val);
      return normalized ? normalized.getTime() : null;
    })
    .filter(val => val != null) as number[];
  
  // If all items have null lastUpdated/lastVisited, consider it stale
  if (lastUpdatedValues.length === 0) return true;
  
  // If all non-null values are the same, consider it stale
  const uniqueValues = new Set(lastUpdatedValues);
  if (uniqueValues.size === 1) return true;
  
  return false;
}

export default function OrganizedContentList({ 
  initialItems, 
  filter = 'all' 
}: OrganizedContentListProps) {
  const [deletedItemIds, setDeletedItemIds] = useState<Set<string>>(new Set());
  const deletedItemIdsRef = useRef<Set<string>>(new Set());
  // Initialize currentItems directly from initialItems
  const [currentItems, setCurrentItems] = useState<OrganizedContentItem[]>(initialItems || []);
  const isRefreshingRef = useRef(false);
  const isMountedRef = useRef(true);
  const lastRefreshTimeRef = useRef<number>(0);
  const pendingRefreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isNavigatingRef = useRef(false);
  const prevInitialItemsKeyRef = useRef<string>('');
  const previousPathnameRef = useRef<string>(typeof window !== 'undefined' ? window.location.pathname : '');
  const refreshContentRef = useRef<(() => Promise<void>) | null>(null);
  const filterRef = useRef<string>(filter);
  const isRefreshingItemsRef = useRef(false); // Track when we're refreshing to prevent auto-load
  const lastRefreshItemsKeyRef = useRef<string>(''); // Track what items we last refreshed
  const DEBOUNCE_WINDOW_MS = 2000; // 2 seconds minimum between refreshes
  const shouldBypassDebounceRef = useRef(false); // Flag to bypass debounce for navigation-triggered refreshes
  const pendingUpdateRef = useRef(false); // Track if an update event occurred while not on dashboard
  const currentItemsRef = useRef<OrganizedContentItem[]>(initialItems || []); // Track current items for verification
  // Track optimistically added items that haven't been confirmed by API yet
  const optimisticItemsRef = useRef<Map<string, { timestamp: number; item: OrganizedContentItem }>>(new Map());

  // Optimistic update: immediately update lastVisited and re-sort items
  const optimisticUpdateLastVisited = useCallback((itemId: string, itemType: 'thread' | 'note') => {
    setCurrentItems(prev => {
      // Find the item by ID - could be thread-{id}, note-{id}, or just {id}
      const itemIndex = prev.findIndex(item => {
        if (itemType === 'thread') {
          return item.threadId === itemId || item.id === `thread-${itemId}` || item.id === itemId;
        } else {
          return item.noteId === itemId || item.id === `note-${itemId}` || item.id === itemId;
        }
      });

      if (itemIndex === -1) {
        // Item not found in current list (might be filtered out)
        return prev;
      }

      // Update the item's lastVisited to now
      const updatedItems = [...prev];
      const currentItem = updatedItems[itemIndex];
      
      // Update lastUpdated which is used for sorting
      updatedItems[itemIndex] = {
        ...currentItem,
        lastUpdated: new Date().toISOString()
      };

      // Re-sort by lastUpdated (newest first) - API uses lastVisited but we use lastUpdated here
      return updatedItems.sort((a, b) => {
        const aTime = a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0;
        const bTime = b.lastUpdated ? new Date(b.lastUpdated).getTime() : 0;
        return bTime - aTime; // Descending order (newest first)
      });
    });
  }, []);

  // Extract item ID from pathname (thread_xxx or note_xxx)
  const extractItemIdFromPath = useCallback((pathname: string): { id: string; type: 'thread' | 'note' } | null => {
    if (pathname.startsWith('/thread_')) {
      const id = pathname.substring(1); // Remove leading '/'
      return { id, type: 'thread' as const };
    } else if (pathname.startsWith('/note_')) {
      const id = pathname.substring(1); // Remove leading '/'
      return { id, type: 'note' as const };
    }
    return null;
  }, []);

  // Verification-based refresh function
  const refreshContentWithVerification = useCallback(async (expectedItemId?: string, expectedItemType?: 'thread' | 'note'): Promise<boolean> => {
    if (!isMountedRef.current) return false;

    const verifyAndRefresh = async (maxAttempts = 3): Promise<boolean> => {
      const delays = [100, 200, 400]; // Exponential backoff in ms
      
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const currentFilter = filterRef.current;
          
          // Skip if scripture filter (has its own refresh logic)
          if (currentFilter === 'scripture') {
            return false;
          }
          
          const url = new URL('/api/content/load-more', window.location.origin);
          url.searchParams.set('offset', '0');
          url.searchParams.set('limit', '100');
          url.searchParams.set('filter', currentFilter);

          const response = await fetch(url.toString(), {
            credentials: 'include',
            cache: 'no-store'
          });

          if (!response.ok) {
            console.error('[OrganizedContentList] Failed to refresh content:', response.status);
            if (attempt < maxAttempts - 1) {
              await new Promise(resolve => setTimeout(resolve, delays[attempt]));
            }
            continue;
          }

          const data = await response.json();
          const freshItemsRaw = data.items || [];

          if (!isMountedRef.current) return false;

          // Normalize dates in fresh items
          const freshItems = freshItemsRaw.map((item: any) => ({
            ...item,
            lastUpdated: item.lastUpdated ? (normalizeDate(item.lastUpdated)?.toISOString() || item.lastUpdated) : item.lastUpdated,
            lastVisited: item.lastVisited ? (normalizeDate(item.lastVisited) || item.lastVisited) : item.lastVisited,
            createdAt: item.createdAt ? (normalizeDate(item.createdAt) || item.createdAt) : item.createdAt
          }));

          // If we're looking for a specific item, check if it exists
          if (expectedItemId) {
            const itemExists = freshItems.some((item: OrganizedContentItem) => {
              const itemId = expectedItemType === 'thread' ? `thread-${expectedItemId}` : 
                           expectedItemType === 'note' ? `note-${expectedItemId}` : expectedItemId;
              return item.id === itemId || item.threadId === expectedItemId || item.noteId === expectedItemId;
            });
            if (!itemExists && attempt < maxAttempts - 1) {
              // Item not found yet, wait and retry
              await new Promise(resolve => setTimeout(resolve, delays[attempt]));
              continue;
            }
          }

          // Filter out deleted items
          const filtered = freshItems.filter((item: OrganizedContentItem) => {
            return !deletedItemIdsRef.current.has(item.id);
          });

          // Merge with optimistic items that haven't been confirmed yet
          // Create a set of all confirmed item IDs (including both prefixed and raw IDs)
          const confirmedItemIds = new Set<string>();
          filtered.forEach(item => {
            confirmedItemIds.add(item.id);
            if (item.threadId) {
              confirmedItemIds.add(item.threadId);
              confirmedItemIds.add(`thread-${item.threadId}`);
            }
            if (item.noteId) {
              confirmedItemIds.add(item.noteId);
              confirmedItemIds.add(`note-${item.noteId}`);
            }
          });

          const optimisticItemsToKeep: OrganizedContentItem[] = [];
          const now = Date.now();
          const fiveSecondsAgo = now - 5000;

          // Keep optimistic items that:
          // 1. Haven't been confirmed by API yet
          // 2. Were added recently (within last 5 seconds)
          // 3. Match the current filter
          optimisticItemsRef.current.forEach(({ timestamp, item }, itemId) => {
            // Check if item is confirmed (by ID, threadId, or noteId)
            const isConfirmed = confirmedItemIds.has(itemId) ||
                               (item.threadId && confirmedItemIds.has(item.threadId)) ||
                               (item.noteId && confirmedItemIds.has(item.noteId)) ||
                               confirmedItemIds.has(item.id);

            if (!isConfirmed && timestamp > fiveSecondsAgo) {
              // Check if item matches current filter
              const currentFilter = filterRef.current;
              const matchesFilter = currentFilter === 'all' ||
                                   (currentFilter === 'threads' && item.type === 'thread') ||
                                   (currentFilter === 'notes' && item.type === 'note' && (item.noteType === 'default' || !item.noteType)) ||
                                   (currentFilter === 'resources' && item.type === 'note' && item.noteType === 'resource');
              
              if (matchesFilter && !deletedItemIdsRef.current.has(itemId) && !deletedItemIdsRef.current.has(item.id)) {
                optimisticItemsToKeep.push(item);
              }
            } else if (isConfirmed) {
              // Item confirmed by API, remove from optimistic tracking (check all possible keys)
              optimisticItemsRef.current.delete(itemId);
              if (item.threadId) {
                optimisticItemsRef.current.delete(item.threadId);
                optimisticItemsRef.current.delete(`thread-${item.threadId}`);
              }
              if (item.noteId) {
                optimisticItemsRef.current.delete(item.noteId);
                optimisticItemsRef.current.delete(`note-${item.noteId}`);
              }
              optimisticItemsRef.current.delete(item.id);
            }
          });

          // Combine API items with optimistic items
          const combinedItems = [...filtered, ...optimisticItemsToKeep];
          
          // Create a key from the refreshed items to track what we just loaded
          const refreshedItemsKey = combinedItems.map((item: OrganizedContentItem) => item.id).join(',') + `|${combinedItems.length}`;
          
          // Double-check we're still on dashboard and mounted before updating
          if (isMountedRef.current && window.location.pathname === '/' && !isNavigatingRef.current && filterRef.current !== 'scripture') {
            // Only update if items actually changed (avoid unnecessary updates that trigger loops)
            if (refreshedItemsKey !== lastRefreshItemsKeyRef.current) {
              // Mark that we're refreshing to prevent InfiniteScrollList from auto-loading
              isRefreshingItemsRef.current = true;
              lastRefreshItemsKeyRef.current = refreshedItemsKey;
              
              setCurrentItems(combinedItems);
              currentItemsRef.current = combinedItems;
              debug('[OrganizedContentList] Updated currentItems with verification', { itemCount: combinedItems.length, optimisticCount: optimisticItemsToKeep.length });
              
              // Clear the refreshing flag after a short delay to allow InfiniteScrollList to process the update
              setTimeout(() => {
                isRefreshingItemsRef.current = false;
              }, 100);
            }
          }

          // If we're looking for a specific item and it exists (in API or optimistic), remove from optimistic tracking
          if (expectedItemId) {
            const itemExists = combinedItems.some(item => {
              const itemId = expectedItemType === 'thread' ? `thread-${expectedItemId}` : 
                           expectedItemType === 'note' ? `note-${expectedItemId}` : expectedItemId;
              return item.id === itemId || item.threadId === expectedItemId || item.noteId === expectedItemId;
            });
            
            if (itemExists && (confirmedItemIds.has(expectedItemId) || 
                (expectedItemType === 'thread' && confirmedItemIds.has(`thread-${expectedItemId}`)) ||
                (expectedItemType === 'note' && confirmedItemIds.has(`note-${expectedItemId}`)))) {
              optimisticItemsRef.current.delete(expectedItemId);
              if (expectedItemType === 'thread') {
                optimisticItemsRef.current.delete(`thread-${expectedItemId}`);
              } else if (expectedItemType === 'note') {
                optimisticItemsRef.current.delete(`note-${expectedItemId}`);
              }
            }
          }
          
          return true; // Success
        } catch (error) {
          console.error('[OrganizedContentList] Error refreshing content:', error);
          if (attempt < maxAttempts - 1) {
            await new Promise(resolve => setTimeout(resolve, delays[attempt]));
          }
        }
      }
      
      return false; // Failed after all attempts
    };

    // If no expected item ID, just refresh once
    if (!expectedItemId) {
      return await verifyAndRefresh(1);
    } else {
      // Verify item exists with retries
      return await verifyAndRefresh(3);
    }
  }, [filter]);

  // Refresh content by fetching fresh data from API
  const refreshContent = useCallback(async () => {
    // Guard against SSR and ensure browser APIs are available
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    
    // Check if we're on the dashboard/for you page
    const isDashboard = window.location.pathname === '/';
    if (!isDashboard) {
      return; // Don't refresh if not on dashboard
    }
    
    // Skip refresh if filter is 'scripture' - scripture tab handles its own refresh
    // This prevents refreshContent from overwriting scripture-specific fetch results
    if (filterRef.current === 'scripture') {
      debug('[OrganizedContentList] Skipping refreshContent - scripture filter has its own refresh logic');
      return;
    }
    
    // Check if navigation is in progress
    if (isNavigatingRef.current) {
      return; // Skip refresh during navigation
    }
    
    // Check if component is still mounted
    if (!isMountedRef.current) {
      return;
    }
    
    // Debounce: Check if enough time has passed since last refresh
    // Allow immediate refresh if lastRefreshTime is 0 (forced refresh) or bypass flag is set
    const now = Date.now();
    const timeSinceLastRefresh = now - lastRefreshTimeRef.current;
    if (lastRefreshTimeRef.current > 0 && timeSinceLastRefresh < DEBOUNCE_WINDOW_MS && !shouldBypassDebounceRef.current) {
      // Too soon since last refresh, skip this one (unless forced or bypassed)
      return;
    }
    
    // Reset bypass flag after checking
    if (shouldBypassDebounceRef.current) {
      shouldBypassDebounceRef.current = false;
    }
    
    // Check if already refreshing
    if (isRefreshingRef.current) {
      return;
    }
    
    // Clear any pending refresh timeout
    if (pendingRefreshTimeoutRef.current) {
      clearTimeout(pendingRefreshTimeoutRef.current);
      pendingRefreshTimeoutRef.current = null;
    }
    
    isRefreshingRef.current = true;
    lastRefreshTimeRef.current = now;
    
    // Retry logic for refresh failures
    const attemptRefresh = async (retryCount = 0): Promise<void> => {
      const maxRetries = 2;
      try {
        // Use filterRef.current to get the current filter value (not closure value)
        const currentFilter = filterRef.current;
        
        // Double-check we're not on scripture filter (should have been caught earlier, but extra safety)
        if (currentFilter === 'scripture') {
          debug('[OrganizedContentList] Skipping refreshContent attempt - scripture filter');
          return;
        }
        
        const url = new URL('/api/content/load-more', window.location.origin);
        url.searchParams.set('offset', '0');
        url.searchParams.set('limit', '100'); // Match server-side limit
        url.searchParams.set('filter', currentFilter);

        const response = await fetch(url.toString(), {
          credentials: 'include'
        });

        if (!response.ok) {
          throw new Error(`Failed to refresh content: ${response.status}`);
        }

        const data = await response.json();
        const threadItems = data.items?.filter((i: OrganizedContentItem) => i.type === 'thread') || [];
        debug('[OrganizedContentList] Refresh response', { 
          itemCount: data.items?.length, 
          filter: currentFilter,
          threadItemsCount: threadItems.length
        });
        // Filter out deleted items from refreshed items
        const filteredItems = data.items.filter((item: OrganizedContentItem) => {
          return !deletedItemIdsRef.current.has(item.id);
        });
        
        // Create a key from the refreshed items to track what we just loaded
        const refreshedItemsKey = filteredItems.map((item: OrganizedContentItem) => item.id).join(',') + `|${filteredItems.length}`;
        
        // Double-check we're still on dashboard and mounted before updating
        // Also verify we're not on scripture filter (extra safety check)
        if (isMountedRef.current && window.location.pathname === '/' && !isNavigatingRef.current && filterRef.current !== 'scripture') {
          // Only update if items actually changed (avoid unnecessary updates that trigger loops)
          if (refreshedItemsKey !== lastRefreshItemsKeyRef.current) {
            // Mark that we're refreshing to prevent InfiniteScrollList from auto-loading
            isRefreshingItemsRef.current = true;
            lastRefreshItemsKeyRef.current = refreshedItemsKey;
            
            setCurrentItems(filteredItems);
            currentItemsRef.current = filteredItems;
            debug('[OrganizedContentList] Updated currentItems', { itemCount: filteredItems.length });
            
            // Clear the refreshing flag after a short delay to allow InfiniteScrollList to process the update
            setTimeout(() => {
              isRefreshingItemsRef.current = false;
            }, 100);
          } else {
            debug('[OrganizedContentList] Refresh returned same items, skipping update', { itemCount: filteredItems.length });
            // Still clear refreshing flag even if we didn't update
            isRefreshingRef.current = false;
          }
        } else {
          // Not updating, so clear refreshing flag
          isRefreshingRef.current = false;
        }
      } catch (error) {
        console.error(`[OrganizedContentList] Error refreshing content (attempt ${retryCount + 1}/${maxRetries + 1}):`, error);
        // Reset refreshing flags on error
        if (isMountedRef.current && retryCount === 0) {
          isRefreshingItemsRef.current = false;
        }
        // Retry if we haven't exceeded max retries
        if (retryCount < maxRetries && isMountedRef.current && window.location.pathname === '/') {
          debug('[OrganizedContentList] Retrying refresh');
          setTimeout(() => {
            if (isMountedRef.current && !isNavigatingRef.current) {
              attemptRefresh(retryCount + 1);
            }
          }, 500);
        } else {
          console.error('[OrganizedContentList] Max retries reached or component unmounted, giving up');
        }
      } finally {
        if (isMountedRef.current && retryCount === 0) {
          isRefreshingRef.current = false;
        }
      }
    };

    attemptRefresh();
  }, [filter]);

  // Refresh scripture notes by fetching fresh data from API
  const refreshScriptureNotes = useCallback(async (forceUpdate = false) => {
    // Guard against SSR and ensure browser APIs are available
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    
    // Check if we're on the dashboard/for you page
    const isDashboard = window.location.pathname === '/';
    if (!isDashboard) {
      return; // Don't refresh if not on dashboard
    }
    
    // Only refresh if filter is 'scripture'
    if (filterRef.current !== 'scripture') {
      return;
    }
    
    // Check if navigation is in progress
    if (isNavigatingRef.current) {
      return; // Skip refresh during navigation
    }
    
    // Check if component is still mounted
    if (!isMountedRef.current) {
      return;
    }
    
    // Check if already refreshing
    if (isRefreshingRef.current) {
      return;
    }
    
    isRefreshingRef.current = true;
    
    try {
      const url = new URL('/api/content/load-more', window.location.origin);
      url.searchParams.set('offset', '0');
      url.searchParams.set('limit', '200');
      url.searchParams.set('filter', 'scripture');

      const response = await fetch(url.toString(), {
        credentials: 'include',
        cache: 'no-store' // Ensure we get fresh data, not cached
      });

      if (!response.ok) {
        throw new Error(`Failed to load scripture notes: ${response.status}`);
      }

      const data = await response.json();
      
      // Filter out deleted items from refreshed items
      const filteredItems = data.items.filter((item: OrganizedContentItem) => {
        return !deletedItemIdsRef.current.has(item.id);
      });
      
      // Create a key from the refreshed items to track what we just loaded
      const refreshedItemsKey = filteredItems.map((item: OrganizedContentItem) => item.id).join(',') + `|${filteredItems.length}`;
      
      // Double-check we're still on dashboard and mounted before updating
      // Also verify we're still on scripture filter
      if (isMountedRef.current && window.location.pathname === '/' && !isNavigatingRef.current && filterRef.current === 'scripture') {
        // Update if items changed OR if forceUpdate is true (to handle cases where refresh happens before DB commits)
        if (refreshedItemsKey !== lastRefreshItemsKeyRef.current || forceUpdate) {
          // Mark that we're refreshing to prevent InfiniteScrollList from auto-loading
          isRefreshingItemsRef.current = true;
          lastRefreshItemsKeyRef.current = refreshedItemsKey;
          
          setCurrentItems(filteredItems);
          currentItemsRef.current = filteredItems;
          debug('[OrganizedContentList] Updated scripture notes', { itemCount: filteredItems.length, forceUpdate });
          
          // Clear the refreshing flag after a short delay to allow InfiniteScrollList to process the update
          setTimeout(() => {
            isRefreshingItemsRef.current = false;
          }, 100);
        } else {
          debug('[OrganizedContentList] Scripture refresh returned same items, skipping update', { itemCount: filteredItems.length });
          isRefreshingRef.current = false;
        }
      } else {
        // Not updating, so clear refreshing flag
        isRefreshingRef.current = false;
      }
    } catch (error) {
      console.error('[OrganizedContentList] Error refreshing scripture notes:', error);
      isRefreshingRef.current = false;
      isRefreshingItemsRef.current = false;
    }
  }, []);

  // Keep refreshContent and filter refs in sync
  useEffect(() => {
    refreshContentRef.current = refreshContent;
  }, [refreshContent]);

  useEffect(() => {
    filterRef.current = filter;
  }, [filter]);

  // Keep ref in sync with state
  useEffect(() => {
    deletedItemIdsRef.current = deletedItemIds;
  }, [deletedItemIds]);

  // Keep currentItemsRef in sync with state
  useEffect(() => {
    currentItemsRef.current = currentItems;
  }, [currentItems]);

  // Track previous filter to detect tab switches
  const prevFilterRef = useRef<string | null>(null);
  
  // Watch for filter changes and reload data for scripture tab
  useEffect(() => {
    // Clear refresh tracking when filter changes
    lastRefreshItemsKeyRef.current = '';
    
    // If filter is 'scripture', always fetch all scripture notes (including referenced ones)
    // This ensures we show all scripture notes, not just the ones from initialItems
    if (filter === 'scripture') {
      // Only fetch if filter just changed to scripture (not on every render)
      if (prevFilterRef.current !== filter) {
        setCurrentItems([]);
        currentItemsRef.current = [];
        refreshScriptureNotes();
      }
    }
    prevFilterRef.current = filter;
  }, [filter, refreshScriptureNotes]);
  
  // Update currentItems when initialItems change (e.g., after navigation)
  useEffect(() => {
    // Skip updating from initialItems if filter is 'scripture' - the filter useEffect handles fetching all scripture notes
    if (filter === 'scripture') {
      return;
    }
    
    if (!initialItems || !Array.isArray(initialItems)) {
      setCurrentItems([]);
      currentItemsRef.current = [];
      prevInitialItemsKeyRef.current = '';
      lastRefreshItemsKeyRef.current = ''; // Clear refresh tracking when items are cleared
      return;
    }
    
    // Create a lightweight key from initialItems to detect actual changes
    // This helps detect changes during View Transitions even if the array reference is the same
    const itemsKey = initialItems
      .map((item: OrganizedContentItem) => item?.id ?? '')
      .join(',') + `|${initialItems.length}`;
    
    // Only update if items actually changed (not just reference)
    // Note: Filter changes are handled by the separate useEffect above
    if (itemsKey === prevInitialItemsKeyRef.current) {
      debug('[OrganizedContentList] initialItems unchanged, skipping update', {
        itemCount: initialItems.length,
        filter
      });
      return;
    }
    
    prevInitialItemsKeyRef.current = itemsKey;
    // Clear refresh tracking when initialItems change (e.g., navigation)
    // This allows loadMore to work properly after navigation
    lastRefreshItemsKeyRef.current = '';
    // Also clear refreshing flag to allow InfiniteScrollList to load more
    isRefreshingItemsRef.current = false;
    
    // Filter out deleted items first
    let filtered = initialItems.filter((item: OrganizedContentItem) => item && item.id && !deletedItemIds.has(item.id));
    
    // Apply additional filtering based on filter type
    if (filter === 'threads') {
      // Ensure only threads are shown (initialItems should already be filtered, but double-check)
      filtered = filtered.filter(item => item.type === 'thread');
    } else if (filter === 'notes') {
      // Ensure only default note type notes are shown (exclude scripture and resource notes)
      filtered = filtered.filter(item => item.type === 'note' && (item.noteType === 'default' || !item.noteType));
    } else if (filter === 'resources') {
      filtered = filtered.filter(item => item.type === 'note' && item.noteType === 'resource');
    }
    // For 'all' filter, no additional filtering needed - server handles filtering referenced scripture notes
    // For 'scripture' filter, we skip this useEffect entirely and let the filter useEffect handle it
    
    debug('[OrganizedContentList] Updating currentItems from initialItems', {
      initialItemsCount: initialItems.length,
      filteredCount: filtered.length,
      filter,
      itemsKey
    });
    
    setCurrentItems(filtered);
    currentItemsRef.current = filtered;
  }, [initialItems, deletedItemIds, filter]);

  // Listen for deletion events to track deleted items
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const handleNoteDeleted = (event: CustomEvent) => {
      const { noteId } = event.detail;
      if (noteId) {
        // Remove from optimistic tracking if it exists
        optimisticItemsRef.current.delete(noteId);
        optimisticItemsRef.current.delete(`note-${noteId}`);
        
        setDeletedItemIds((prev: Set<string>) => {
          // Add both raw ID and prefixed ID to match item.id format (note-${id})
          const newSet = new Set([...prev, noteId, `note-${noteId}`]);
          deletedItemIdsRef.current = newSet;
          return newSet;
        });
      }
    };

    const handleThreadDeleted = (event: CustomEvent) => {
      const { threadId } = event.detail;
      if (threadId) {
        // Remove from optimistic tracking if it exists
        optimisticItemsRef.current.delete(threadId);
        optimisticItemsRef.current.delete(`thread-${threadId}`);
        
        setDeletedItemIds((prev: Set<string>) => {
          // Add both raw ID and prefixed ID to match item.id format (thread-${id})
          const newSet = new Set([...prev, threadId, `thread-${threadId}`]);
          deletedItemIdsRef.current = newSet;
          return newSet;
        });
      }
    };

    window.addEventListener('noteDeleted', handleNoteDeleted as EventListener);
    window.addEventListener('threadDeleted', handleThreadDeleted as EventListener);

    return () => {
      window.removeEventListener('noteDeleted', handleNoteDeleted as EventListener);
      window.removeEventListener('threadDeleted', handleThreadDeleted as EventListener);
    };
  }, []);

  // Check sessionStorage on mount for recently created items
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.pathname !== '/') return; // Only check on dashboard

    try {
      // Check for recently created notes
      const recentNotesStr = sessionStorage.getItem('recentlyCreatedNotes');
      if (recentNotesStr) {
        const recentNotes = JSON.parse(recentNotesStr);
        const fiveSecondsAgo = Date.now() - 5000;

        // Check if any note was created within last 5 seconds
        const relevantNote = recentNotes.find((n: any) => n.timestamp > fiveSecondsAgo);

        if (relevantNote && relevantNote.noteId) {
          // Force immediate refresh with verification
          refreshContentWithVerification(relevantNote.noteId, 'note').then((success) => {
            if (success) {
              const noteExists = currentItemsRef.current.some(item => 
                item.noteId === relevantNote.noteId
              );
              if (noteExists) {
                // Note confirmed in list, safe to remove from sessionStorage
                const filtered = recentNotes.filter((n: any) => n.noteId !== relevantNote.noteId);
                sessionStorage.setItem('recentlyCreatedNotes', JSON.stringify(filtered));
              }
            }
          });
        }
      }

      // Check for recently created threads
      const recentThreadsStr = sessionStorage.getItem('recentlyCreatedThreads');
      if (recentThreadsStr) {
        const recentThreads = JSON.parse(recentThreadsStr);
        const fiveSecondsAgo = Date.now() - 5000;

        // Check if any thread was created within last 5 seconds
        const relevantThread = recentThreads.find((t: any) => t.timestamp > fiveSecondsAgo);

        if (relevantThread && relevantThread.threadId) {
          // Force immediate refresh with verification
          refreshContentWithVerification(relevantThread.threadId, 'thread').then((success) => {
            if (success) {
              const threadExists = currentItemsRef.current.some(item => 
                item.threadId === relevantThread.threadId
              );
              if (threadExists) {
                // Thread confirmed in list, safe to remove from sessionStorage
                const filtered = recentThreads.filter((t: any) => t.threadId !== relevantThread.threadId);
                sessionStorage.setItem('recentlyCreatedThreads', JSON.stringify(filtered));
              }
            }
          });
        }
      }
    } catch (error) {
      console.error('[OrganizedContentList] Error checking sessionStorage:', error);
    }
  }, [refreshContentWithVerification]);

  // Listen for content creation events to refresh the list
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Only set up listeners if we're on the dashboard page
    const checkAndRefresh = () => {
      // Check if still on dashboard page
      if (window.location.pathname === '/' && !isNavigatingRef.current && isMountedRef.current) {
        refreshContentRef.current?.();
      } else {
        // If not on dashboard, mark that we have a pending update
        pendingUpdateRef.current = true;
      }
    };
    
    const handleNoteCreated = async (event?: Event) => {
      const customEvent = event as CustomEvent;
      const note = customEvent?.detail?.note;
      const noteId = customEvent?.detail?.noteId || note?.id;
      const currentFilter = filterRef.current;
      
      debug('[OrganizedContentList] noteCreated event received', { 
        noteId, 
        noteType: note?.noteType,
        currentFilter,
        currentPath: window.location.pathname 
      });
      
      // Clear any pending timeout first
      if (pendingRefreshTimeoutRef.current) {
        clearTimeout(pendingRefreshTimeoutRef.current);
        pendingRefreshTimeoutRef.current = null;
      }
      
      // If we're on dashboard, refresh immediately
      if (window.location.pathname === '/') {
        // Always refresh scripture tab when on it
        if (currentFilter === 'scripture') {
          debug('[OrganizedContentList] Refreshing scripture notes after note creation', {
            noteId,
            noteType: note?.noteType
          });
          // Force update to ensure we refresh even if items appear unchanged (handles DB commit timing)
          refreshScriptureNotes(true);
        } else {
          // Use verification-based refresh for other filters
          const expectedItemId = noteId;
          const expectedItemType = note?.noteType === 'scripture' ? undefined : 'note'; // Don't verify scripture notes in non-scripture filters
          
          // Optimistic update if note matches current filter
          if (note && (currentFilter === 'all' || currentFilter === 'notes')) {
            const noteItem: OrganizedContentItem = {
              id: `note-${note.id}`,
              type: 'note',
              title: note.title || 'Untitled Note',
              noteType: note.noteType || 'default',
              content: note.content,
              noteId: note.id,
              threadColors: note.threadColors,
              resourceTitle: note.resourceTitle,
              resourceDescription: note.resourceDescription,
              resourceImage: note.resourceImage
            };

            // Track as optimistic item (use noteId as key)
            optimisticItemsRef.current.set(noteId, {
              timestamp: Date.now(),
              item: noteItem
            });
            
            setCurrentItems((prev: OrganizedContentItem[]) => {
              // Check if note already exists to avoid duplicates
              const exists = prev.some((item: OrganizedContentItem) => item.noteId === note.id);
              if (exists) {
                return prev;
              }
              // Add to beginning of list (newest first)
              const updated = [noteItem, ...prev];
              currentItemsRef.current = updated;
              return updated;
            });
          }
          
          // Verify with API after short delay (with retries to preserve optimistic item)
          setTimeout(() => {
            refreshContentWithVerification(expectedItemId, expectedItemType).then((success) => {
              if (success) {
                // Remove from sessionStorage after successful verification
                try {
                  const recentNotesStr = sessionStorage.getItem('recentlyCreatedNotes');
                  if (recentNotesStr && noteId) {
                    const recentNotes = JSON.parse(recentNotesStr);
                    const filtered = recentNotes.filter((n: any) => n.noteId !== noteId);
                    sessionStorage.setItem('recentlyCreatedNotes', JSON.stringify(filtered));
                  }
                } catch (error) {
                  console.error('[OrganizedContentList] Error cleaning up sessionStorage after noteCreated:', error);
                }
              } else {
                // Verification failed after all attempts - check if we should remove optimistic item
                // Only remove if it's been more than 2 seconds since creation (database likely doesn't have it)
                const optimisticItem = optimisticItemsRef.current.get(noteId);
                if (optimisticItem) {
                  const timeSinceCreation = Date.now() - optimisticItem.timestamp;
                  if (timeSinceCreation > 2000) {
                    // Remove optimistic item after 2 seconds if still not confirmed
                    optimisticItemsRef.current.delete(noteId);
                    setCurrentItems(prev => prev.filter(item => item.noteId !== noteId));
                  }
                }
              }
            });
          }, 200);
        }
      } else {
        // If not on dashboard, mark that we have a pending update
        pendingUpdateRef.current = true;
      }
    };

    const handleThreadCreated = async (event: Event) => {
      const customEvent = event as CustomEvent;
      const thread = customEvent.detail?.thread;
      const threadId = customEvent.detail?.threadId || thread?.id;
      const currentFilter = filterRef.current;
      debug('[OrganizedContentList] threadCreated event received', { threadId, filter: currentFilter });
      
      if (!thread || !threadId) {
        console.warn('[OrganizedContentList] threadCreated event missing thread data');
        return;
      }
      
      // Clear any pending timeout first
      if (pendingRefreshTimeoutRef.current) {
        clearTimeout(pendingRefreshTimeoutRef.current);
        pendingRefreshTimeoutRef.current = null;
      }
      
      // Immediately add the thread to the list if it matches the current filter
      // This provides instant feedback while the API refresh happens
      if (currentFilter === 'all' || currentFilter === 'threads') {
        const threadItem: OrganizedContentItem = {
          id: `thread-${thread.id}`,
          type: 'thread',
          title: thread.title || 'Untitled Thread',
          subtitle: '0 notes',
          threadId: thread.id,
          count: 0,
          lastUpdated: thread.updatedAt || thread.createdAt || new Date().toISOString(),
          accentColor: thread.color ? getThreadColorCSS(thread.color) : undefined,
          isPrivate: !thread.isPublic,
        };

        // Track as optimistic item (use threadId as key)
        optimisticItemsRef.current.set(threadId, {
          timestamp: Date.now(),
          item: threadItem
        });
        
        setCurrentItems((prev: OrganizedContentItem[]) => {
          // Check if thread already exists to avoid duplicates
          const exists = prev.some((item: OrganizedContentItem) => item.threadId === thread.id);
          if (exists) {
            debug('[OrganizedContentList] Thread already in list, skipping add');
            return prev;
          }
          debug('[OrganizedContentList] Adding thread to list immediately', { title: threadItem.title });
          // Add to beginning of list (newest first)
          const updated = [threadItem, ...prev];
          currentItemsRef.current = updated;
          return updated;
        });
      }
      
      // Use verification-based refresh instead of arbitrary delay (with retries to preserve optimistic item)
      setTimeout(() => {
        refreshContentWithVerification(threadId, 'thread').then((success) => {
          if (success) {
            // Remove from sessionStorage after successful verification
            try {
              const recentThreadsStr = sessionStorage.getItem('recentlyCreatedThreads');
              if (recentThreadsStr && threadId) {
                const recentThreads = JSON.parse(recentThreadsStr);
                const filtered = recentThreads.filter((t: any) => t.threadId !== threadId);
                sessionStorage.setItem('recentlyCreatedThreads', JSON.stringify(filtered));
              }
            } catch (error) {
              console.error('[OrganizedContentList] Error cleaning up sessionStorage after threadCreated:', error);
            }
          } else {
            // Verification failed after all attempts - check if we should remove optimistic item
            // Only remove if it's been more than 2 seconds since creation (database likely doesn't have it)
            const optimisticItem = optimisticItemsRef.current.get(threadId);
            if (optimisticItem) {
              const timeSinceCreation = Date.now() - optimisticItem.timestamp;
              if (timeSinceCreation > 2000) {
                // Remove optimistic item after 2 seconds if still not confirmed
                optimisticItemsRef.current.delete(threadId);
                setCurrentItems(prev => prev.filter(item => item.threadId !== threadId));
              }
            }
          }
        });
      }, 200);
    };

    const handleSpaceDeleted = () => {
      // When a space is deleted, threads and notes are preserved (spaceId set to null)
      // Refresh content to show the updated threads/notes
      // Clear any pending timeout first
      if (pendingRefreshTimeoutRef.current) {
        clearTimeout(pendingRefreshTimeoutRef.current);
        pendingRefreshTimeoutRef.current = null;
      }
      // Use verification-based refresh
      setTimeout(() => {
        refreshContentWithVerification();
      }, 200);
    };

    const handleNoteUpdated = (event?: Event) => {
      const customEvent = event as CustomEvent;
      const noteId = customEvent?.detail?.noteId;
      const currentFilter = filterRef.current;
      debug('[OrganizedContentList] noteUpdated event received', { 
        noteId, 
        currentFilter,
        currentPath: window.location.pathname 
      });
      
      // Note was updated - refresh to show latest changes
      // This also handles cases where scripture notes are created via processScriptureReferences
      // Clear any pending timeout first
      if (pendingRefreshTimeoutRef.current) {
        clearTimeout(pendingRefreshTimeoutRef.current);
        pendingRefreshTimeoutRef.current = null;
      }
      setTimeout(() => {
        // If we're on the scripture tab, refresh scripture notes
        // This ensures newly created scripture notes (from processScriptureReferences) appear
        if (window.location.pathname === '/' && currentFilter === 'scripture') {
          refreshScriptureNotes();
        } else {
          refreshContentWithVerification();
        }
      }, 200);
    };

    const handleThreadUpdated = () => {
      // Thread was updated - refresh to show latest changes
      // Clear any pending timeout first
      if (pendingRefreshTimeoutRef.current) {
        clearTimeout(pendingRefreshTimeoutRef.current);
        pendingRefreshTimeoutRef.current = null;
      }
      // Use verification-based refresh
      setTimeout(() => {
        refreshContentWithVerification();
      }, 200);
    };

    window.addEventListener('noteCreated', handleNoteCreated as EventListener);
    window.addEventListener('threadCreated', handleThreadCreated as EventListener);
    window.addEventListener('spaceDeleted', handleSpaceDeleted as EventListener);
    window.addEventListener('noteUpdated', handleNoteUpdated as EventListener);
    window.addEventListener('threadUpdated', handleThreadUpdated as EventListener);

    return () => {
      window.removeEventListener('noteCreated', handleNoteCreated as EventListener);
      window.removeEventListener('threadCreated', handleThreadCreated as EventListener);
      window.removeEventListener('spaceDeleted', handleSpaceDeleted as EventListener);
      window.removeEventListener('noteUpdated', handleNoteUpdated as EventListener);
      window.removeEventListener('threadUpdated', handleThreadUpdated as EventListener);
      // Clear pending timeout on cleanup
      if (pendingRefreshTimeoutRef.current) {
        clearTimeout(pendingRefreshTimeoutRef.current);
        pendingRefreshTimeoutRef.current = null;
      }
    };
  }, [refreshScriptureNotes, refreshContentWithVerification]); // Include refreshContentWithVerification in deps

  // Track if we've refreshed on mount to prevent duplicate refreshes
  const hasRefreshedOnMountRef = useRef<boolean>(false);

  // Listen for navigation events to skip refresh during navigation
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    
    // Initialize previous pathname on mount if not already set
    if (previousPathnameRef.current === '') {
      previousPathnameRef.current = window.location.pathname;
    }
    
    const handleBeforeNavigation = () => {
      isNavigatingRef.current = true;
      // Store current pathname before navigation
      previousPathnameRef.current = window.location.pathname;
      // Clear any pending refresh timeouts
      if (pendingRefreshTimeoutRef.current) {
        clearTimeout(pendingRefreshTimeoutRef.current);
        pendingRefreshTimeoutRef.current = null;
      }
    };
    
    const handlePageLoad = () => {
      // Reset navigation flag after page loads
      isNavigatingRef.current = false;
      
      const isDashboard = window.location.pathname === '/';
      const navigatedToDashboard = isDashboard && previousPathnameRef.current !== '/';
      
      // Check if we came from a thread or note page (for sorting updates)
      const referrer = document.referrer;
      const cameFromThreadOrNote = referrer && (
        referrer.includes('/thread_') || 
        referrer.includes('/note_') ||
        new URL(referrer).pathname.startsWith('/thread_') ||
        new URL(referrer).pathname.startsWith('/note_')
      );

      // Also check if previous pathname was a thread/note (for View Transitions scenarios)
      const previousWasThreadOrNote = previousPathnameRef.current.startsWith('/thread_') || 
                                      previousPathnameRef.current.startsWith('/note_');
      
      // Only refresh if we're on the dashboard page
      if (isDashboard && isMountedRef.current) {
        // If we navigated TO the dashboard, always refresh (bypass debounce)
        // Also refresh if there was a pending update while we were away
        // OR if we came from a thread/note page (to update lastVisited sorting)
        if (navigatedToDashboard || pendingUpdateRef.current || (cameFromThreadOrNote || previousWasThreadOrNote)) {
          // OPTIMISTIC UPDATE: Immediately update lastVisited and re-sort for instant feedback
          let visitedItemId: string | null = null;
          let visitedItemType: 'thread' | 'note' | null = null;

          // Try to extract item ID from previous pathname first (most reliable)
          if (previousWasThreadOrNote) {
            const extracted = extractItemIdFromPath(previousPathnameRef.current);
            if (extracted) {
              visitedItemId = extracted.id;
              visitedItemType = extracted.type;
            }
          }

          // Fallback to referrer if previous pathname didn't work
          if (!visitedItemId && cameFromThreadOrNote && referrer) {
            try {
              const referrerUrl = new URL(referrer);
              const extracted = extractItemIdFromPath(referrerUrl.pathname);
              if (extracted) {
                visitedItemId = extracted.id;
                visitedItemType = extracted.type;
              }
            } catch (e) {
              // Invalid referrer URL, skip
            }
          }

          // Perform optimistic update immediately if we found the item
          if (visitedItemId && visitedItemType) {
            debug('[OrganizedContentList] Performing optimistic update', { visitedItemId, visitedItemType });
            optimisticUpdateLastVisited(visitedItemId, visitedItemType);
          }

          debug('[OrganizedContentList] Navigated to dashboard, will refresh', {
            previousPath: previousPathnameRef.current,
            hadPendingUpdate: pendingUpdateRef.current,
            cameFromThreadOrNote: cameFromThreadOrNote || previousWasThreadOrNote,
            optimisticUpdate: visitedItemId ? { id: visitedItemId, type: visitedItemType } : null
          });
          // Clear pending update flag
          pendingUpdateRef.current = false;
          // Bypass debounce and reset refresh time for immediate refresh
          shouldBypassDebounceRef.current = true;
          lastRefreshTimeRef.current = 0;
          
          // Background API refresh with minimal delay (optimistic update already handled visual feedback)
          // Clear any pending timeout first
          if (pendingRefreshTimeoutRef.current) {
            clearTimeout(pendingRefreshTimeoutRef.current);
          }
          pendingRefreshTimeoutRef.current = setTimeout(() => {
            pendingRefreshTimeoutRef.current = null;
            if (isMountedRef.current && window.location.pathname === '/' && !isNavigatingRef.current && !isRefreshingRef.current) {
              // Use refreshContentWithVerification to get fresh data with updated lastVisited
              refreshContentWithVerification().then(() => {
                // Sorting is handled by the API response, but verify it's correct
              });
            }
          }, 100); // Reduced delay since optimistic update provides instant feedback
          previousPathnameRef.current = window.location.pathname;
          return;
        }
        
        // For other cases (page refresh on dashboard), check debounce but still refresh if needed
        const now = Date.now();
        const timeSinceLastRefresh = now - lastRefreshTimeRef.current;
        const shouldSkipRefresh = isRefreshingRef.current || 
          (lastRefreshTimeRef.current > 0 && timeSinceLastRefresh < DEBOUNCE_WINDOW_MS);
        
        if (shouldSkipRefresh) {
          debug('[OrganizedContentList] Skipping refresh on page load - too soon or already refreshing', {
            timeSinceLastRefresh,
            isRefreshing: isRefreshingRef.current
          });
          previousPathnameRef.current = window.location.pathname;
          return;
        }
        
        // Small delay to ensure page is fully loaded, initialItems are processed, and database is ready
        // Clear any pending timeout first
        if (pendingRefreshTimeoutRef.current) {
          clearTimeout(pendingRefreshTimeoutRef.current);
        }
        pendingRefreshTimeoutRef.current = setTimeout(() => {
          pendingRefreshTimeoutRef.current = null;
          if (isMountedRef.current && window.location.pathname === '/' && !isNavigatingRef.current) {
            // Double-check we're not already refreshing before calling
            if (!isRefreshingRef.current) {
              refreshContentRef.current?.();
            }
          }
        }, 300); // Slightly longer delay to ensure initialItems are processed first
      }
      
      // Update previous pathname for next navigation
      previousPathnameRef.current = window.location.pathname;
    };

    // Check on mount if we're coming from a note page (full page reload scenario)
    // Also check for PWA context and stale data
    const checkAndRefreshOnMount = () => {
      if (hasRefreshedOnMountRef.current) return;
      
      const isDashboard = window.location.pathname === '/';
      if (!isDashboard) return;
      
      // Check if running in PWA context - always refresh to get fresh data
      const inPWA = isPWA();
      
      // Check if initial data is stale
      const dataIsStale = isStaleData(initialItems);
      
      // Check if we came from a note page
      const referrer = document.referrer;
      const cameFromNotePage = referrer && (
        referrer.includes('/note_') || 
        new URL(referrer).pathname.startsWith('/note_')
      );
      
      // Also check if previous pathname was a note (for View Transitions scenarios)
      const previousWasNote = previousPathnameRef.current.startsWith('/note_');
      
      // Refresh if: PWA context, stale data, or coming from note page
      if (inPWA || dataIsStale || cameFromNotePage || previousWasNote) {
        hasRefreshedOnMountRef.current = true;
        // Immediate refresh for PWA/stale data, slight delay for navigation scenarios
        const delay = (inPWA || dataIsStale) ? 50 : 200;
        setTimeout(() => {
          if (isMountedRef.current && window.location.pathname === '/' && !isNavigatingRef.current && !isRefreshingRef.current) {
            refreshContentRef.current?.();
          }
        }, delay);
      }
    };

    // Check on mount (for full page reloads)
    checkAndRefreshOnMount();

    // Listen for navigation start to skip refreshes during navigation
    document.addEventListener('astro:before-preparation', handleBeforeNavigation);
    // Listen for View Transitions page load
    document.addEventListener('astro:page-load', handlePageLoad);

    return () => {
      document.removeEventListener('astro:before-preparation', handleBeforeNavigation);
      document.removeEventListener('astro:page-load', handlePageLoad);
      // Clear pending timeout on cleanup
      if (pendingRefreshTimeoutRef.current) {
        clearTimeout(pendingRefreshTimeoutRef.current);
        pendingRefreshTimeoutRef.current = null;
      }
    };
  }, [optimisticUpdateLastVisited, extractItemIdFromPath, refreshContentWithVerification]); // Include dependencies for optimistic updates

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      // Clear all pending timeouts on unmount
      if (pendingRefreshTimeoutRef.current) {
        clearTimeout(pendingRefreshTimeoutRef.current);
        pendingRefreshTimeoutRef.current = null;
      }
    };
  }, []);

  // Filter out deleted items from currentItems for display
  const filteredInitialItems = (currentItems || []).filter((item: OrganizedContentItem) => {
    // Use item.id as the primary identifier (it's always present)
    return item && item.id && !deletedItemIds.has(item.id);
  });

  const loadMore = useCallback(async (offset: number, limit: number) => {
    // Guard against SSR
    if (typeof window === 'undefined') {
      return { items: [], hasMore: false };
    }
    
    // Use filterRef.current to get the current filter value (not closure value)
    const currentFilter = filterRef.current;
    
    // Don't load more if we're currently refreshing (refreshContent is running)
    // This prevents loading duplicates when refreshContent updates items
    if (isRefreshingRef.current || isRefreshingItemsRef.current) {
      debug('[OrganizedContentList] Skipping loadMore - refresh in progress', { offset, filter: currentFilter });
      return { items: [], hasMore: false };
    }
    
    // If offset is 0 and we just refreshed via refreshContent (not from initialItems), skip this load
    // refreshContent already loaded items from offset 0 (but not for scripture filter)
    // For scripture filter, the initial fetch in useEffect handles offset 0
    // Only skip if we're actively refreshing (isRefreshingItemsRef) to avoid blocking normal pagination
    if (offset === 0 && isRefreshingItemsRef.current && currentFilter !== 'scripture') {
      debug('[OrganizedContentList] Skipping loadMore offset 0 - refresh in progress', { offset, filter: currentFilter });
      return { items: [], hasMore: false };
    }
    
    const url = new URL('/api/content/load-more', window.location.origin);
    url.searchParams.set('offset', offset.toString());
    url.searchParams.set('limit', limit.toString());
    url.searchParams.set('filter', currentFilter);

    const response = await fetch(url.toString(), {
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Failed to load more content');
    }

    const data = await response.json();
    // Filter out deleted items from loaded items using ref to get latest state
    const filteredItems = data.items.filter((item: OrganizedContentItem) => {
      // Use item.id as the primary identifier (it's always present)
      return !deletedItemIdsRef.current.has(item.id);
    });
    
    debug('[OrganizedContentList] loadMore completed', {
      offset,
      limit,
      filter: currentFilter,
      itemsReturned: filteredItems.length,
      hasMore: data.hasMore
    });
    
    return {
      items: filteredItems,
      hasMore: data.hasMore
    };
  }, [filter]);

  const renderItem = (item: OrganizedContentItem, index: number) => {
    const href = item.type === 'thread' 
      ? `/${item.threadId}` 
      : `/${item.noteId}`;

    const isScriptureNote = item.type === 'note' && item.noteType === 'scripture';

    return (
      <div 
        className={`content-item ${item.type}-item mb-3 card-enter`}
        style={{ animationDelay: `${index * 50}ms` }}
      >
        {item.type === 'note' && isScriptureNote ? (
          <CondensedNoteItem 
            title={item.title}
            noteType={(item.noteType as 'default' | 'scripture' | 'resource' | undefined) || 'default'}
            href={href}
            threadColors={item.threadColors}
            noteId={item.noteId}
          />
        ) : item.type === 'note' ? (
          <a 
            href={href}
            className="block transition-transform duration-200 hover:scale-[1.002] active:scale-[0.99]"
          >
            <CardNote 
              title={item.noteType === 'resource' && item.resourceTitle ? item.resourceTitle : item.title}
              content={item.noteType === 'resource' && item.resourceDescription ? item.resourceDescription : (item.content || '')}
              noteType={(item.noteType as 'default' | 'scripture' | 'resource' | undefined) || 'default'}
              resourceTitle={item.noteType === 'resource' ? (item.resourceTitle || null) : undefined}
              resourceDescription={item.noteType === 'resource' ? (item.resourceDescription || null) : undefined}
              resourceImage={item.noteType === 'resource' ? (item.resourceImage || null) : undefined}
              threadColors={item.threadColors}
              noteId={item.noteId}
              showScriptureRefsCollapsible={filter === 'all'}
              scriptureReferences={item.scriptureReferences}
            />
          </a>
        ) : (
          <a 
            href={href}
            className="block transition-transform duration-200 hover:scale-[1.002] active:scale-[0.99]"
          >
            <CardThread 
              thread={{
                id: item.threadId || '',
                title: item.title,
                subtitle: item.subtitle,
                count: item.count,
                accentColor: item.accentColor,
                lastUpdated: item.lastUpdated,
                isPrivate: item.isPrivate
              }}
            />
          </a>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col">
      <InfiniteScrollList
        initialItems={filteredInitialItems}
        loadMore={loadMore}
        renderItem={renderItem}
        itemKey={(item) => item.id}
        limit={20}
        className="flex flex-col"
      />
    </div>
  );
}

