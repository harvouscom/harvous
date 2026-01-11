import React, { useState, useEffect, useRef, useCallback } from 'react';
import InfiniteScrollList from './InfiniteScrollList';
import CardNote from './CardNote';
import CardThread from './CardThread';
import CondensedNoteItem from './CondensedNoteItem';
import { getThreadColorCSS } from '@/utils/colors';
import { debug } from '@/utils/logger';
import { normalizeDate, sortByLastVisited } from '@/utils/sorting';
import { isPWA, isStaleData } from '@/utils/content-list-helpers';
import { useOptimisticUpdates } from '@/hooks/useOptimisticUpdates';
import { buildAPIUrl, referrerMatchesPattern } from '@/utils/safe-url';
import { prefetchThreadContent, initThreadCacheCleanup } from '@/utils/thread-cache';

// Content cache removed - server is the single source of truth
// This simplification eliminates cache staleness and duplication issues

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
  threadColors?: Array<{ color: string; frequency: number }> | null;
  scriptureReferences?: Array<{ reference: string; noteId: string; threadColors?: Array<{ color: string; frequency: number }> }>;
  lastVisited?: Date | string | null;
  createdAt?: Date | string | null;
  syncStatus?: 'synced' | 'pending' | 'conflict' | 'deleted';
}

interface OrganizedContentListProps {
  initialItems: OrganizedContentItem[];
  filter?: 'all' | 'threads' | 'notes' | 'scripture' | 'resources';
  userId?: string;
}

// Helper to normalize dates once at API boundary
function normalizeItemDates(item: any): OrganizedContentItem {
  return {
    ...item,
    // All items should have lastVisited (with fallback) from data source
    lastVisited: item.lastVisited ? normalizeDate(item.lastVisited) : null,
    lastUpdated: item.lastUpdated ? (normalizeDate(item.lastUpdated)?.toISOString() || item.lastUpdated) : item.lastUpdated,
    createdAt: item.createdAt ? normalizeDate(item.createdAt) : null,
    // updatedAt is used as tiebreaker in sorting, normalize if present
    updatedAt: item.updatedAt ? normalizeDate(item.updatedAt) : null
  };
}

// Helper to sort items by lastVisited
// All items should have lastVisited (with fallback) set at data source level
function sortItems(items: OrganizedContentItem[]): OrganizedContentItem[] {
  // Normalize dates for all items, then sort
  const normalizedItems = items.map(item => ({
    ...item,
    lastVisited: item.lastVisited ? normalizeDate(item.lastVisited) : null,
    updatedAt: item.updatedAt ? normalizeDate(item.updatedAt) : null,
    createdAt: item.createdAt ? normalizeDate(item.createdAt) : null
  }));
  return sortByLastVisited(normalizedItems);
}

/**
 * Unified item matching helper that understands all ID formats:
 * - Prefixed IDs: "note-uuid" or "thread-uuid" (used in OrganizedContentList)
 * - UUIDs: "note_..." or "thread_..." (database IDs)
 * - Simple IDs: numeric or string IDs (for URL generation only)
 * 
 * This ensures consistent matching regardless of which ID format is used.
 */
function matchesItem(
  item: OrganizedContentItem,
  searchId: string,
  searchType: 'thread' | 'note'
): boolean {
  // Type must match
  if (item.type !== searchType) return false;

  // Normalize search ID: remove prefixes to get UUID
  const normalizedSearchId = searchId.startsWith('thread_') ? searchId.substring(7) :
                             searchId.startsWith('note_') ? searchId.substring(5) :
                             searchId.startsWith('thread-') ? searchId.substring(7) :
                             searchId.startsWith('note-') ? searchId.substring(5) :
                             searchId;

  // Check all possible ID formats
  if (searchType === 'thread') {
    // Match by prefixed ID
    if (item.id === `thread-${normalizedSearchId}` || item.id === searchId) return true;
    // Match by threadId (UUID)
    if (item.threadId === normalizedSearchId || item.threadId === searchId) return true;
  } else {
    // Match by prefixed ID
    if (item.id === `note-${normalizedSearchId}` || item.id === searchId) return true;
    // Match by noteId (UUID)
    if (item.noteId === normalizedSearchId || item.noteId === searchId) return true;
  }

  return false;
}

// Helper to get raw UUID from any ID format
function normalizeId(id: string | undefined | null): string {
  if (!id) return '';
  // Some IDs can end up double-prefixed (e.g. "thread-thread_abc" or "note-note_abc")
  // so strip prefixes repeatedly until stable.
  let out = id;
  for (let i = 0; i < 4; i++) {
    const next = out.replace(/^(note_|thread_|note-|thread-)/, '');
    if (next === out) break;
    out = next;
  }
  return out;
}

export default function OrganizedContentList({ 
  initialItems, 
  filter = 'all',
  userId
}: OrganizedContentListProps) {
  // Prevent a "flash" of server-rendered items that might include content the user deleted.
  // We can't read sessionStorage on the server, so we intentionally render a lightweight
  // placeholder until the client hydrates and we can apply the deleted ID filter.
  const [isHydrated, setIsHydrated] = useState(false);
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const [deletedItemIds, setDeletedItemIds] = useState<Set<string>>(() => {
    // Restore deleted items. We store in BOTH sessionStorage and localStorage because
    // sessionStorage can be unexpectedly cleared in some browser/PWA flows.
    const merged = new Set<string>();
    try {
      const sessionStored = typeof window !== 'undefined' ? sessionStorage.getItem('deletedContentItems') : null;
      if (sessionStored) {
        const ids = JSON.parse(sessionStored) as string[];
        ids.map(normalizeId).forEach(id => merged.add(id));
      }
    } catch (err) {
      console.error('[OrganizedContentList] Failed to restore deleted items from sessionStorage:', err);
    }
    try {
      const localStored = typeof window !== 'undefined' ? localStorage.getItem('deletedContentItems') : null;
      if (localStored) {
        const ids = JSON.parse(localStored) as string[];
        ids.map(normalizeId).forEach(id => merged.add(id));
      }
    } catch (err) {
      console.error('[OrganizedContentList] Failed to restore deleted items from localStorage:', err);
    }
    return merged;
  });
  const [hasMore, setHasMore] = useState<boolean>(() => {
    if (filter === 'scripture') return true;
    return (initialItems || []).length >= 20;
  });
  const [currentItems, setCurrentItems] = useState<OrganizedContentItem[]>(() => {
    if (filter === 'scripture') return [];
    
    // CRITICAL: Filter initialItems IMMEDIATELY in the state initializer
    // This prevents deleted items from appearing on the first render
    let initialDeleted = new Set<string>();
    try {
      if (typeof window !== 'undefined') {
        const sessionStored = sessionStorage.getItem('deletedContentItems');
        if (sessionStored) {
          (JSON.parse(sessionStored) as string[]).map(normalizeId).forEach(id => initialDeleted.add(id));
        }
        const localStored = localStorage.getItem('deletedContentItems');
        if (localStored) {
          (JSON.parse(localStored) as string[]).map(normalizeId).forEach(id => initialDeleted.add(id));
        }
      }
    } catch {}

    const rawItems = (initialItems || []).map(normalizeItemDates);
    const filtered = rawItems.filter(item => {
      if (!item || !item.id) return false;
      return !initialDeleted.has(normalizeId(item.id)) && 
             !initialDeleted.has(normalizeId(item.threadId)) && 
             !initialDeleted.has(normalizeId(item.noteId));
    });

    return sortItems(filtered);
  });

  // Offline-only data loading
  // ONLY loads from IndexedDB when truly offline - prevents duplication from mixing data sources
  useEffect(() => {
    if (!userId || !isHydrated) return;

    // CRITICAL: Only use local data when actually offline
    // When online, server is the single source of truth
    if (navigator.onLine) return;

    const loadOfflineData = async () => {
      try {
        const { getDashboardSnapshotLocal } = await import('@/utils/offline-read-layer');
        const snapshot = await getDashboardSnapshotLocal(userId);

        if (!snapshot) return;

        // Map snapshot data to OrganizedContentItem format
        // IMPORTANT: Preserve null lastVisited to distinguish visited from unvisited items
        const localItems: OrganizedContentItem[] = [
          ...snapshot.threads.map(t => ({
            id: `thread-${t.id}`,
            type: 'thread' as const,
            title: t.title,
            subtitle: t.subtitle || `${t.noteCount} notes`,
            count: t.noteCount,
            threadId: t.id,
            spaceId: t.spaceId,
            accentColor: t.color ? getThreadColorCSS(t.color) : getThreadColorCSS('blue'),
            lastVisited: t.lastVisited || null, // Preserve null to distinguish visited from unvisited items
            createdAt: t.createdAt,
            updatedAt: t.updatedAt || t.createdAt,
          })),
          ...snapshot.recentNotes.map(n => ({
            id: `note-${n.id}`,
            type: 'note' as const,
            title: n.title || 'Untitled Note',
            content: n.content,
            noteId: n.id,
            threadId: n.threadId,
            spaceId: n.spaceId,
            noteType: n.noteType,
            lastVisited: n.lastVisited || null, // Preserve null to distinguish visited from unvisited items
            createdAt: n.createdAt,
            updatedAt: n.updatedAt || n.createdAt,
            syncStatus: n.syncStatus,
          }))
        ];

        // Filter out deleted items
        const notDeletedItems = localItems.filter(item => {
          return !deletedItemIdsRef.current.has(normalizeId(item.id)) &&
                 !deletedItemIdsRef.current.has(normalizeId(item.threadId)) &&
                 !deletedItemIdsRef.current.has(normalizeId(item.noteId));
        });

        // Filter out recently created scripture notes without lastVisited (handles race condition)
        // This matches the server-side filtering logic in getContentItems
        const now = Date.now();
        const RECENT_CREATION_THRESHOLD = 5000; // 5 seconds

        const filteredByScriptureRules = notDeletedItems.filter(item => {
          if (item.type !== 'note' || item.noteType !== 'scripture') return true;
          
          // Filter out recently created scripture notes without lastVisited
          if (item.createdAt && !item.lastVisited) {
            const createdAtTime = new Date(item.createdAt).getTime();
            const isRecentlyCreated = (now - createdAtTime) < RECENT_CREATION_THRESHOLD;
            if (isRecentlyCreated) {
              return false; // Filter out
            }
          }
          
          return true;
        });

        // Apply filter
        let filteredItems = filteredByScriptureRules;
        if (filter === 'threads') filteredItems = filteredByScriptureRules.filter(i => i.type === 'thread');
        if (filter === 'notes') filteredItems = filteredByScriptureRules.filter(i => i.type === 'note' && (i.noteType === 'default' || !i.noteType));
        if (filter === 'scripture') filteredItems = filteredByScriptureRules.filter(i => i.type === 'note' && i.noteType === 'scripture');
        if (filter === 'resources') filteredItems = filteredByScriptureRules.filter(i => i.type === 'note' && i.noteType === 'resource');

        const sorted = sortItems(filteredItems.map(normalizeItemDates));

        // Replace entirely when offline - no merging
        setCurrentItems(sorted);
        debug(`[OrganizedContentList] Loaded ${sorted.length} items from offline storage`);
      } catch (err) {
        console.error('[OrganizedContentList] Offline data load failed:', err);
      }
    };

    loadOfflineData();
  }, [userId, filter, isHydrated]);

  // Essential refs only
  const isMountedRef = useRef(true);
  const currentItemsRef = useRef<OrganizedContentItem[]>(currentItems);
  const hasMoreRef = useRef<boolean>(hasMore);
  const deletedItemIdsRef = useRef<Set<string>>(deletedItemIds);
  const filterRef = useRef<string>(filter);
  const optimisticUpdates = useOptimisticUpdates<OrganizedContentItem>();
  
  // Consolidated refresh state
  const refreshStateRef = useRef({
    isRefreshing: false,
    lastRefreshTime: 0,
    lastRefreshTimestamp: 0,
    pendingTimeout: null as NodeJS.Timeout | null,
    isNavigating: false,
    shouldBypassDebounce: false,
    lastRefreshKey: ''
  });

  // Keep refs in sync with state
  useEffect(() => {
    currentItemsRef.current = currentItems;
  }, [currentItems]);

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  useEffect(() => {
    deletedItemIdsRef.current = deletedItemIds;
  }, [deletedItemIds]);

  useEffect(() => {
    filterRef.current = filter;
  }, [filter]);

  // Unified refresh function
  // IMPORTANT: This does a FULL REPLACEMENT of currentItems with server data
  // - Server response is the source of truth (complete, fresh list)
  // - We do NOT merge with existing currentItems to avoid duplicates and stale data
  // - Optimistic items are only kept if not confirmed by server response
  // - This ensures each refresh gets fresh data from the server
  const refreshContent = useCallback(async (options?: {
    expectedItemId?: string;
    expectedItemType?: 'thread' | 'note';
    maxRetries?: number;
  }): Promise<boolean> => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return false;
    if (!isMountedRef.current) return false;
    if (window.location.pathname !== '/') return false;
    if (refreshStateRef.current.isNavigating) return false;

    const currentFilter = filterRef.current;
    const maxRetries = options?.maxRetries ?? (options?.expectedItemId ? 3 : 1);
    const delays = [100, 200, 400];

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Debounce check (skip for verification refreshes)
        if (!options?.expectedItemId) {
          const now = Date.now();
          const timeSinceRefresh = now - refreshStateRef.current.lastRefreshTime;
          if (refreshStateRef.current.lastRefreshTime > 0 && 
              timeSinceRefresh < 2000 && 
              !refreshStateRef.current.shouldBypassDebounce) {
            return false;
          }
          refreshStateRef.current.shouldBypassDebounce = false;
        }

        if (refreshStateRef.current.isRefreshing) return false;

        refreshStateRef.current.isRefreshing = true;
        if (!options?.expectedItemId) {
          refreshStateRef.current.lastRefreshTime = Date.now();
        }

        // Determine limit based on filter
        const limit = currentFilter === 'scripture' ? 200 : 100;

        const url = buildAPIUrl('/api/content/load-more', {
          offset: '0',
          limit: limit.toString(),
          filter: currentFilter,
          _t: Date.now().toString() // Cache-busting timestamp
        });

        if (!url) {
          throw new Error('Failed to build refresh URL');
        }

        const response = await fetch(url, {
          credentials: 'include',
          cache: 'no-store' // Always bypass cache to ensure fresh data
        });

        if (!response.ok) {
          throw new Error(`Failed to refresh: ${response.status}`);
        }

        const data = await response.json();
        if (!isMountedRef.current) return false;

        // Normalize dates once at API boundary
        // Server is the source of truth - always use server data for lastVisited
        // This ensures consistent ordering across all devices
        const normalizedItems = (data.items || []).map(normalizeItemDates);

        // Only preserve threadColors from current items (UI enrichment, doesn't affect order)
        const currentSnapshot = [...currentItemsRef.current];
        normalizedItems.forEach((freshItem, index) => {
          if (!normalizedItems[index].threadColors) {
            const currentItem = currentSnapshot.find(item => {
              if (item.id === freshItem.id) return true;
              if (freshItem.type === 'thread' && freshItem.threadId) {
                return matchesItem(item, freshItem.threadId, 'thread');
              }
              if (freshItem.type === 'note' && freshItem.noteId) {
                return matchesItem(item, freshItem.noteId, 'note');
              }
              return false;
            });
            if (currentItem?.threadColors) {
              normalizedItems[index] = {
                ...normalizedItems[index],
                threadColors: currentItem.threadColors
              };
            }
          }
        });

        // Merge with optimistic items (unfiltered for master list)
        // Build confirmedIds set with all possible ID formats from server response
        const confirmedIds = new Set<string>();
        normalizedItems.forEach(item => {
          const normalizedId = normalizeId(item.id);
          confirmedIds.add(normalizedId);
          if (item.threadId) {
            confirmedIds.add(normalizeId(item.threadId));
            // Also add the prefixed version for matching
            confirmedIds.add(`thread-${normalizeId(item.threadId)}`);
          }
          if (item.noteId) {
            confirmedIds.add(normalizeId(item.noteId));
            // Also add the prefixed version for matching
            confirmedIds.add(`note-${normalizeId(item.noteId)}`);
          }
        });

        const optimisticItemsToKeep: OrganizedContentItem[] = [];
        const fiveSecondsAgo = Date.now() - 5000;

        optimisticUpdates.optimisticItemsRef.current.forEach(({ timestamp, item: optimisticItem }, itemId) => {
          // Check all possible ID formats to see if this optimistic item is confirmed by server response
          const normalizedItemId = normalizeId(itemId);
          const normalizedOptimisticId = normalizeId(optimisticItem.id);
          const normalizedOptimisticThreadId = optimisticItem.threadId ? normalizeId(optimisticItem.threadId) : null;
          const normalizedOptimisticNoteId = optimisticItem.noteId ? normalizeId(optimisticItem.noteId) : null;
          
          const isConfirmed = confirmedIds.has(normalizedItemId) || 
                             confirmedIds.has(normalizedOptimisticId) ||
                             (normalizedOptimisticThreadId && confirmedIds.has(normalizedOptimisticThreadId)) ||
                             (normalizedOptimisticNoteId && confirmedIds.has(normalizedOptimisticNoteId)) ||
                             // Also check if any server item matches this optimistic item
                             normalizedItems.some(serverItem => {
                               if (optimisticItem.type === 'thread') {
                                 return matchesItem(serverItem, optimisticItem.threadId || optimisticItem.id, 'thread');
                               } else {
                                 return matchesItem(serverItem, optimisticItem.noteId || optimisticItem.id, 'note');
                               }
                             });

          if (isConfirmed) {
            // Item confirmed by server - remove from optimistic tracking immediately
            optimisticUpdates.removeOptimistic(itemId);
            if (optimisticItem.threadId) optimisticUpdates.removeOptimistic(optimisticItem.threadId);
            if (optimisticItem.noteId) optimisticUpdates.removeOptimistic(optimisticItem.noteId);
            optimisticUpdates.removeOptimistic(optimisticItem.id);
          } else if (timestamp > fiveSecondsAgo) {
            // Not confirmed but recent - keep showing optimistically
            optimisticItemsToKeep.push(optimisticItem);
          } else {
            // Older than 5 seconds and not confirmed - remove to prevent stale data
            // This handles cases where sync failed or item was deleted elsewhere
            optimisticUpdates.removeOptimistic(itemId);
            if (optimisticItem.threadId) optimisticUpdates.removeOptimistic(optimisticItem.threadId);
            if (optimisticItem.noteId) optimisticUpdates.removeOptimistic(optimisticItem.noteId);
            optimisticUpdates.removeOptimistic(optimisticItem.id);
          }
        });

        // refreshContent does a FULL REPLACEMENT with server data as source of truth
        // We do NOT deduplicate against currentItemsRef because:
        // 1. Server response is authoritative - it contains the complete, fresh list
        // 2. Filtering against currentItemsRef would cause us to lose items or keep stale data
        // 3. This is a refresh operation, not a merge operation

        // Deduplicate optimistic items against server response
        // This ensures optimistic items that are confirmed by server are removed
        // (they're already handled by the confirmation logic above, but this is a safety check)
        const deduplicatedOptimisticItemsFinal = optimisticItemsToKeep.filter(optimisticItem => {
          // Check against all normalizedItems (server response) to ensure no duplicates
          return !normalizedItems.some(normalizedItem => {
            if (optimisticItem.type === 'thread' && normalizedItem.type === 'thread') {
              const optimisticThreadId = normalizeId(optimisticItem.threadId || optimisticItem.id);
              const normalizedThreadId = normalizeId(normalizedItem.threadId || normalizedItem.id);
              return optimisticThreadId === normalizedThreadId;
            } else if (optimisticItem.type === 'note' && normalizedItem.type === 'note') {
              const optimisticNoteId = normalizeId(optimisticItem.noteId || optimisticItem.id);
              const normalizedNoteId = normalizeId(normalizedItem.noteId || normalizedItem.id);
              return optimisticNoteId === normalizedNoteId;
            }
            return false;
          });
        });

        // Combine server response with unconfirmed optimistic items
        // Server response (normalizedItems) is the source of truth
        // Optimistic items are only kept if not confirmed by server
        const combined = [...normalizedItems, ...deduplicatedOptimisticItemsFinal];
        
        // Final deduplication pass: use a Set to track seen items by normalized ID
        // This is a safety net to catch any duplicates within the refresh response itself
        // (e.g., if server response has duplicates or optimistic items weren't properly filtered)
        const seenIds = new Set<string>();
        const finalDeduplicated = combined.filter(item => {
          // Get the unique identifier for this item (threadId for threads, noteId for notes)
          const uniqueId = item.type === 'thread' 
            ? normalizeId(item.threadId || item.id)
            : normalizeId(item.noteId || item.id);
          
          // If we've seen this ID before, skip it (duplicate)
          if (seenIds.has(uniqueId)) {
            return false;
          }
          
          // Mark this ID as seen
          seenIds.add(uniqueId);
          return true;
        });
        
        // Sort the final deduplicated list
        const sorted = sortItems(finalDeduplicated);

        // Check if we're looking for a specific item (using filtering logic for check only)
        if (options?.expectedItemId && options?.expectedItemType) {
          const itemExists = sorted.some(item => 
            matchesItem(item, options.expectedItemId, options.expectedItemType) &&
            !deletedItemIdsRef.current.has(normalizeId(item.id)) &&
            !deletedItemIdsRef.current.has(normalizeId(item.threadId)) &&
            !deletedItemIdsRef.current.has(normalizeId(item.noteId))
          );
          if (!itemExists && attempt < maxRetries - 1) {
            await new Promise(resolve => setTimeout(resolve, delays[attempt]));
            continue;
          }
        }

        // Update state with the master list
        const refreshedKey = sorted.map(item => item.id).join(',') + `|${sorted.length}`;
        if (isMountedRef.current && window.location.pathname === '/' && 
            !refreshStateRef.current.isNavigating && filterRef.current === currentFilter) {
          if (refreshedKey !== refreshStateRef.current.lastRefreshKey || options?.expectedItemId) {
            refreshStateRef.current.lastRefreshKey = refreshedKey;
            const newHasMore = sorted.length >= limit;
            setHasMore(newHasMore);
            hasMoreRef.current = newHasMore;
            setCurrentItems(sorted);
            currentItemsRef.current = sorted;

            setTimeout(() => {
              refreshStateRef.current.isRefreshing = false;
              refreshStateRef.current.lastRefreshTimestamp = Date.now();
            }, 0);
          } else {
            refreshStateRef.current.isRefreshing = false;
          }
        } else {
          refreshStateRef.current.isRefreshing = false;
        }

        return true;
      } catch (error) {
        console.error('[OrganizedContentList] Refresh error:', error);
        if (attempt < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, delays[attempt]));
        }
      }
    }

    refreshStateRef.current.isRefreshing = false;
    return false;
  }, []);

  // Optimistic update for lastVisited
  const optimisticUpdateLastVisited = useCallback((itemId: string, itemType: 'thread' | 'note') => {
    if (!isMountedRef.current) return;

    setCurrentItems(prev => {
      // Use unified matching helper to find the item
      const itemIndex = prev.findIndex(item => matchesItem(item, itemId, itemType));

      if (itemIndex === -1) return prev;

      const updated = [...prev];
      const now = new Date();
      updated[itemIndex] = {
        ...updated[itemIndex],
        lastVisited: now,
        lastUpdated: now.toISOString()
      };

      return sortItems(updated);
    });
  }, []);

  // Extract item ID from pathname
  const extractItemIdFromPath = useCallback((pathname: string): { id: string; type: 'thread' | 'note' } | null => {
    const cleanPath = pathname.split('?')[0].split('#')[0];
    const pathWithoutSlash = cleanPath.startsWith('/') ? cleanPath.substring(1) : cleanPath;
    
    if (pathWithoutSlash.startsWith('thread_') && pathWithoutSlash.length > 7) {
      return { id: pathWithoutSlash, type: 'thread' };
    } else if (pathWithoutSlash.startsWith('note_') && pathWithoutSlash.length > 5) {
      return { id: pathWithoutSlash, type: 'note' };
    }
    return null;
  }, []);

  // Handle filter changes - simple fetch for scripture tab
  useEffect(() => {
    if (filter === 'scripture' && isMountedRef.current) {
      setCurrentItems([]);
      currentItemsRef.current = [];
      // Set hasMore to false initially to prevent InfiniteScrollList from auto-loading
      // until the refresh completes
      setHasMore(false);
      hasMoreRef.current = false;
      // Trigger refresh which will update hasMore based on actual data
      refreshContent().then(() => {
        // Refresh completed - InfiniteScrollList will handle loading more if needed
      });
    }
  }, [filter, refreshContent]);

  // Simple refresh on mount to ensure fresh data
  // No caching - server is the single source of truth
  useEffect(() => {
    if (!isMountedRef.current) return;
    if (typeof window === 'undefined') return;
    if (window.location.pathname !== '/') return;
    if (filter === 'scripture') return;

    // Refresh to ensure we have latest data
    // Only if we have initial items (SSR worked) and component is mounted
    if (initialItems && initialItems.length > 0) {
      // Small delay to let the UI settle
      const timeout = setTimeout(() => {
        refreshContent();
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [filter, refreshContent]);

  // Track previous initialItems to detect actual changes from server
  const prevPropsInitialItemsRef = useRef<string>('');

  // Handle initialItems changes (server-side props update)
  useEffect(() => {
    if (filter === 'scripture') return;
    if (!initialItems || !Array.isArray(initialItems)) {
      setCurrentItems([]);
      currentItemsRef.current = [];
      return;
    }

    const itemsKey = initialItems.map(i => i.id).join(',');
    const isNewServerData = itemsKey !== prevPropsInitialItemsRef.current;

    if (isNewServerData) {
      prevPropsInitialItemsRef.current = itemsKey;
      
      const rawItems = initialItems.map(normalizeItemDates);
      const sorted = sortItems(rawItems);
      
      setHasMore(sorted.length >= 20);
      hasMoreRef.current = sorted.length >= 20;
      setCurrentItems(sorted);
      currentItemsRef.current = sorted;
    }
  }, [initialItems, filter]); // Removed deletedItemIds from dependencies to prevent list reset on deletion

  // Listen for deletion events (client-only)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleNoteDeleted = (event: CustomEvent) => {
      const { noteId } = event.detail;
      if (noteId) {
        const normId = normalizeId(noteId);
        optimisticUpdates.removeOptimistic(noteId);
        optimisticUpdates.removeOptimistic(`note-${noteId}`);
        setDeletedItemIds(prev => {
          const newSet = new Set([...prev, normId]);
          deletedItemIdsRef.current = newSet;
          // Persist deletion state so deleted items stay deleted across page refreshes
          try {
            sessionStorage.setItem('deletedContentItems', JSON.stringify([...newSet]));
            localStorage.setItem('deletedContentItems', JSON.stringify([...newSet]));
          } catch (err) {
            console.error('[OrganizedContentList] Failed to persist deleted items:', err);
          }
          return newSet;
        });
      }
    };

    const handleThreadDeleted = (event: CustomEvent) => {
      const { threadId } = event.detail;
      if (threadId) {
        const normId = normalizeId(threadId);
        optimisticUpdates.removeOptimistic(threadId);
        optimisticUpdates.removeOptimistic(`thread-${threadId}`);
        setDeletedItemIds(prev => {
          const newSet = new Set([...prev, normId]);
          deletedItemIdsRef.current = newSet;
          // Persist deletion state so deleted items stay deleted across page refreshes
          try {
            sessionStorage.setItem('deletedContentItems', JSON.stringify([...newSet]));
            localStorage.setItem('deletedContentItems', JSON.stringify([...newSet]));
          } catch (err) {
            console.error('[OrganizedContentList] Failed to persist deleted items:', err);
          }
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
  }, [optimisticUpdates]);

  // sessionStorage tracking for recently created items has been removed
  // Optimistic updates are the single mechanism for showing newly created items
  // This eliminates a source of duplication when items appeared both in
  // sessionStorage and in the server response

  // Handle content creation/update events
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleNoteCreated = async (event?: Event) => {
      const customEvent = event as CustomEvent;
      const note = customEvent?.detail?.note;
      const noteId = customEvent?.detail?.noteId || note?.id;
      const currentFilter = filterRef.current;

      // CRITICAL: Don't add if the note was just deleted (using normalized check)
      if (noteId && deletedItemIdsRef.current.has(normalizeId(noteId))) {
        debug('[OrganizedContentList] handleNoteCreated: Skipping deleted note', { noteId });
        return;
      }

      if (window.location.pathname === '/') {
        if (currentFilter === 'scripture') {
          refreshContent();
        } else {
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

            optimisticUpdates.addOptimistic(noteId, noteItem);
          }

          refreshContent({ 
            expectedItemId: noteId, 
            expectedItemType: note?.noteType === 'scripture' ? undefined : 'note' 
          });
        }
      }
    };

    const handleThreadCreated = async (event: Event) => {
      const customEvent = event as CustomEvent;
      const thread = customEvent.detail?.thread;
      const threadId = customEvent.detail?.threadId || thread?.id;
      const currentFilter = filterRef.current;

      if (!thread || !threadId) return;

      // CRITICAL: Don't add if the thread was just deleted (using normalized check)
      if (deletedItemIdsRef.current.has(normalizeId(threadId))) {
        debug('[OrganizedContentList] handleThreadCreated: Skipping deleted thread', { threadId });
        return;
      }

      if (window.location.pathname === '/') {
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
            isPrivate: !thread.isPublic
          };

          optimisticUpdates.addOptimistic(threadId, threadItem);
        }

        refreshContent({ expectedItemId: threadId, expectedItemType: 'thread' });
      }
    };

    const handleNoteUpdated = () => {
      if (window.location.pathname === '/') {
        if (filterRef.current === 'scripture') {
          refreshContent();
        } else {
          refreshContent();
        }
      }
    };

    const handleThreadUpdated = () => {
      if (window.location.pathname === '/') {
        refreshContent();
      }
    };

    const handleSpaceDeleted = () => {
      if (window.location.pathname === '/') {
        refreshContent();
      }
    };

    window.addEventListener('noteCreated', handleNoteCreated as EventListener);
    window.addEventListener('threadCreated', handleThreadCreated as EventListener);
    window.addEventListener('noteUpdated', handleNoteUpdated as EventListener);
    window.addEventListener('threadUpdated', handleThreadUpdated as EventListener);
    window.addEventListener('spaceDeleted', handleSpaceDeleted as EventListener);

    return () => {
      window.removeEventListener('noteCreated', handleNoteCreated as EventListener);
      window.removeEventListener('threadCreated', handleThreadCreated as EventListener);
      window.removeEventListener('noteUpdated', handleNoteUpdated as EventListener);
      window.removeEventListener('threadUpdated', handleThreadUpdated as EventListener);
      window.removeEventListener('spaceDeleted', handleSpaceDeleted as EventListener);
    };
  }, [refreshContent, optimisticUpdates]);

  // Navigation tracking refs
  const previousPathnameRef = useRef<string>(typeof window !== 'undefined' ? window.location.pathname : '');
  const lastBackgroundTimeRef = useRef<number>(0);
  const lastVisibilityRefreshRef = useRef<number>(0);

  // Handle navigation events
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const handleBeforeNavigation = () => {
      refreshStateRef.current.isNavigating = true;
      previousPathnameRef.current = window.location.pathname;
      if (refreshStateRef.current.pendingTimeout) {
        clearTimeout(refreshStateRef.current.pendingTimeout);
        refreshStateRef.current.pendingTimeout = null;
      }
    };

    const handlePageLoad = () => {
      refreshStateRef.current.isNavigating = false;

      const isDashboard = window.location.pathname === '/';
      const navigatedToDashboard = isDashboard && previousPathnameRef.current !== '/';
      const previousWasThreadOrNote = previousPathnameRef.current.startsWith('/thread_') || 
                                      previousPathnameRef.current.startsWith('/note_');

      if (isDashboard && isMountedRef.current) {
        if (navigatedToDashboard || previousWasThreadOrNote) {
          // Optimistic update for visited item
          if (previousWasThreadOrNote) {
            const extracted = extractItemIdFromPath(previousPathnameRef.current);
            if (extracted) {
              optimisticUpdateLastVisited(extracted.id, extracted.type);
            }
          }

          refreshStateRef.current.shouldBypassDebounce = true;
          refreshStateRef.current.lastRefreshTime = 0;

          if (refreshStateRef.current.pendingTimeout) {
            clearTimeout(refreshStateRef.current.pendingTimeout);
          }
          refreshStateRef.current.pendingTimeout = setTimeout(() => {
            refreshStateRef.current.pendingTimeout = null;
            if (isMountedRef.current && window.location.pathname === '/' && 
                !refreshStateRef.current.isNavigating && !refreshStateRef.current.isRefreshing) {
              refreshContent();
            }
          }, 150);
        } else {
          const now = Date.now();
          const timeSinceRefresh = now - refreshStateRef.current.lastRefreshTime;
          if (refreshStateRef.current.lastRefreshTime > 0 && timeSinceRefresh < 2000) {
            previousPathnameRef.current = window.location.pathname;
            return;
          }

          if (refreshStateRef.current.pendingTimeout) {
            clearTimeout(refreshStateRef.current.pendingTimeout);
          }
          refreshStateRef.current.pendingTimeout = setTimeout(() => {
            refreshStateRef.current.pendingTimeout = null;
            if (isMountedRef.current && window.location.pathname === '/' && !refreshStateRef.current.isNavigating) {
              if (!refreshStateRef.current.isRefreshing) {
                refreshContent();
              }
            }
          }, 300);
        }
      }

      previousPathnameRef.current = window.location.pathname;
    };

    const checkAndRefreshOnMount = () => {
      const isDashboard = window.location.pathname === '/';
      if (!isDashboard) return;

      const inPWA = isPWA();
      const dataIsStale = isStaleData(initialItems, (item) => item.lastUpdated || item.lastVisited);
      const cameFromNotePage = referrerMatchesPattern('/note_');
      const previousWasNote = previousPathnameRef.current.startsWith('/note_');

      if (inPWA || dataIsStale || cameFromNotePage || previousWasNote) {
        // Removed delays for instant refresh
        if (isMountedRef.current && window.location.pathname === '/' &&
            !refreshStateRef.current.isNavigating && !refreshStateRef.current.isRefreshing) {
          refreshContent();
        }
      }
    };

    checkAndRefreshOnMount();

    document.addEventListener('astro:before-preparation', handleBeforeNavigation);
    document.addEventListener('astro:page-load', handlePageLoad);

    return () => {
      document.removeEventListener('astro:before-preparation', handleBeforeNavigation);
      document.removeEventListener('astro:page-load', handlePageLoad);
      if (refreshStateRef.current.pendingTimeout) {
        clearTimeout(refreshStateRef.current.pendingTimeout);
        refreshStateRef.current.pendingTimeout = null;
      }
    };
  }, [refreshContent, optimisticUpdateLastVisited, extractItemIdFromPath, initialItems]);

  // Handle visibility changes for PWA
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const MIN_BACKGROUND_TIME = 5000;
    const MIN_REFRESH_INTERVAL = 2000;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        lastBackgroundTimeRef.current = Date.now();
      } else {
        const isDashboard = window.location.pathname === '/';
        if (!isDashboard) return;

        const timeInBackground = lastBackgroundTimeRef.current > 0 
          ? Date.now() - lastBackgroundTimeRef.current 
          : 0;
        const timeSinceLastRefresh = Date.now() - lastVisibilityRefreshRef.current;
        const inPWA = isPWA();

        const shouldRefresh = (timeInBackground > MIN_BACKGROUND_TIME || inPWA || lastBackgroundTimeRef.current === 0) &&
                              timeSinceLastRefresh > MIN_REFRESH_INTERVAL &&
                              !refreshStateRef.current.isNavigating &&
                              !refreshStateRef.current.isRefreshing &&
                              isMountedRef.current;

        if (shouldRefresh) {
          lastVisibilityRefreshRef.current = Date.now();
          refreshStateRef.current.isRefreshing = true;

          // Removed PWA delay for instant refresh
          if (isMountedRef.current && window.location.pathname === '/' &&
              !refreshStateRef.current.isNavigating && refreshStateRef.current.isRefreshing) {
            refreshContent().then(() => {
              refreshStateRef.current.isRefreshing = false;
            }).catch(() => {
              refreshStateRef.current.isRefreshing = false;
            });
          } else {
            refreshStateRef.current.isRefreshing = false;
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshContent]);

  // Initialize thread cache cleanup on mount
  useEffect(() => {
    initThreadCacheCleanup();
  }, []);

  // Set up Intersection Observer for prefetching threads as they come into view
  useEffect(() => {
    if (typeof window === 'undefined' || !userId) return;

    const observerOptions = {
      root: null,
      rootMargin: '200px', // Start prefetching 200px before item is visible
      threshold: 0
    };

    const observerCallback = (entries: IntersectionObserverEntry[]) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const element = entry.target as HTMLElement;
          const threadId = element.dataset.threadId;

          if (threadId && userId) {
            // Prefetch thread content in the background
            prefetchThreadContent(threadId, userId);
          }
        }
      });
    };

    const observer = new IntersectionObserver(observerCallback, observerOptions);

    // Observe all thread items
    const threadItems = document.querySelectorAll('[data-thread-id]');
    threadItems.forEach(item => observer.observe(item));

    return () => {
      observer.disconnect();
    };
  }, [currentItems, userId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (refreshStateRef.current.pendingTimeout) {
        clearTimeout(refreshStateRef.current.pendingTimeout);
        refreshStateRef.current.pendingTimeout = null;
      }
    };
  }, []);

  // Load more function
  const loadMore = useCallback(async (_ignoredOffset: number, limit: number) => {
    if (typeof window === 'undefined') {
      return { items: [], hasMore: false };
    }

    const currentFilter = filterRef.current;
    const now = Date.now();
    const timeSinceRefresh = now - refreshStateRef.current.lastRefreshTimestamp;
    const inCooldown = timeSinceRefresh < 500;

    if (refreshStateRef.current.isRefreshing || inCooldown) {
      return { items: [], hasMore: false };
    }

    // Use the raw currentItems length for the offset to ensure correct pagination
    const offset = currentItemsRef.current.length;

    const url = buildAPIUrl('/api/content/load-more', {
      offset: offset.toString(),
      limit: limit.toString(),
      filter: currentFilter
    });

    if (!url) {
      throw new Error('Failed to build load-more URL');
    }

    const response = await fetch(url, {
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Failed to load more content');
    }

    const data = await response.json();
    const newItems = (data.items || []).map(normalizeItemDates);

    // CRITICAL: Deduplicate new items against existing items to prevent duplicates
    // This is essential because pagination offset may overlap or items may have been
    // added optimistically
    const existingIds = new Set(
      currentItemsRef.current.map(item =>
        item.type === 'thread'
          ? normalizeId(item.threadId || item.id)
          : normalizeId(item.noteId || item.id)
      )
    );

    const dedupedNewItems = newItems.filter(item => {
      const uniqueId = item.type === 'thread'
        ? normalizeId(item.threadId || item.id)
        : normalizeId(item.noteId || item.id);
      return !existingIds.has(uniqueId);
    });

    // Update the master list with only truly new items
    if (dedupedNewItems.length > 0) {
      setCurrentItems(prev => [...prev, ...dedupedNewItems]);
    }

    setHasMore(data.hasMore);
    hasMoreRef.current = data.hasMore;

    // Return empty items because we've already updated the parent state
    // which will update the 'items' prop of the InfiniteScrollList
    return {
      items: [],
      hasMore: data.hasMore
    };
  }, []);

  const renderItem = (item: OrganizedContentItem, index: number) => {
    const href = item.type === 'thread'
      ? `/${item.threadId}`
      : `/${item.noteId}`;

    const isScriptureNote = item.type === 'note' && item.noteType === 'scripture';

    const handleNoteClick = () => {
      window.location.href = href;
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleNoteClick();
      }
    };

    // Prefetch on hover for faster navigation
    const handleMouseEnter = () => {
      if (typeof document !== 'undefined') {
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = href;
        document.head.appendChild(link);
      }
    };

    return (
      <div
        className={`content-item ${item.type}-item mb-3 card-enter`}
        style={{ animationDelay: `${index * 50}ms` }}
        onMouseEnter={handleMouseEnter}
        data-thread-id={item.type === 'thread' ? item.threadId : undefined}
      >
        {item.type === 'note' && isScriptureNote ? (
          <CondensedNoteItem
            title={item.title}
            noteType={(item.noteType as 'default' | 'scripture' | 'resource' | undefined) || 'default'}
            href={href}
            threadColors={item.threadColors || undefined}
            noteId={item.noteId}
          />
        ) : item.type === 'note' ? (
          <div
            role="link"
            tabIndex={0}
            className="block transition-transform duration-200 hover:scale-[1.002] active:scale-[0.99]"
            onClick={handleNoteClick}
            onKeyDown={handleKeyDown}
            aria-label={item.title}
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
              isPendingSync={item.syncStatus === 'pending'}
            />
          </div>
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
                lastVisited: item.lastVisited,
                createdAt: item.createdAt,
                isPrivate: item.isPrivate
              }}
            />
          </a>
        )}
      </div>
    );
  };

  const displayItems = (currentItems || []).filter((item: OrganizedContentItem) => {
    if (!item || !item.id) return false;
    return !deletedItemIds.has(normalizeId(item.id)) && 
           !deletedItemIds.has(normalizeId(item.threadId)) && 
           !deletedItemIds.has(normalizeId(item.noteId));
  });

  return (
    <div className="flex flex-col">
      {displayItems.length > 0 ? (
        <InfiniteScrollList
          initialItems={displayItems}
          items={displayItems}
          loadMore={loadMore}
          renderItem={renderItem}
          itemKey={(item) => item.id}
          limit={20}
          className="flex flex-col"
          initialHasMore={hasMore}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px', width: '100%', textAlign: 'center', paddingTop: '64px', paddingBottom: '64px' }}>
          <div className="empty-state-message">
            <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, color: '#4a473d', fontSize: '18px', lineHeight: '1.2' }}>
              <p>So when's move-in day?</p>
            </div>
            <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, color: '#78766f', fontSize: '14px', lineHeight: '1.3', maxWidth: '250px' }}>
              <p>Add to your Harvous and this area will start to feel lived in.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
