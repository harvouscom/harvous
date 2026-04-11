import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
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
import { idToUrl } from '@/utils/url-helpers';
import {
  getSectionKeyForItem,
  SECTION_ORDER,
  SECTION_LABELS,
  type SectionKey
} from '@/utils/last-visited-sections';

// SPA-compatible dashboard path check — Astro uses '/', SPA uses '/dashboard'
const isDashboardPath = () =>
  window.location.pathname === '/' || window.location.pathname === '/dashboard';

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
  scriptureReferences?: Array<{ reference: string; noteId: string; translation?: string; threadColors?: Array<{ color: string; frequency: number }> }>;
  updatedAt?: Date | string | null;
  lastVisited?: Date | string | null;
  createdAt?: Date | string | null;
  syncStatus?: 'synced' | 'pending' | 'conflict' | 'deleted';
  contentEncrypted?: boolean;
  // Bible translation abbreviation for scripture notes (e.g. 'ESV', 'KJV')
  version?: string;
}

interface OrganizedContentListProps {
  initialItems: OrganizedContentItem[];
  filter?: 'all' | 'threads' | 'notes' | 'scripture' | 'resources';
  userId?: string;
  dataGeneratedAt?: number; // Timestamp when SSR data was generated - used to detect stale cached pages
  /** Optional SPA navigation handler — when provided, item clicks use client-side navigation instead of full page reload */
  onNavigate?: (href: string) => void;
  /** When true (e.g. parent React Query fetching), show loading until initialItems arrive. Avoids duplicate fetch on mount. */
  parentIsLoading?: boolean;
  /** When provided, use the API's hasMore from the parent (e.g. last page of dashboard query) instead of inferring from item count. */
  initialHasMoreFromParent?: boolean;
  /** Called on pointer enter for note items — use to prefetch note data before click */
  onNotePrefetch?: (noteId: string) => void;
  /** Called when user hovers/focuses a thread row — prefetch thread route data (SPA React Query) */
  onThreadIntent?: (threadId: string) => void;
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
 * Unified item matching helper - now simplified since all IDs use thread_/note_ format.
 * Matches items by comparing normalized IDs (stripping prefixes to get raw UUIDs).
 */
function matchesItem(
  item: OrganizedContentItem,
  searchId: string,
  searchType: 'thread' | 'note'
): boolean {
  // Type must match
  if (item.type !== searchType) return false;

  // Normalize both search ID and item IDs to raw UUIDs for comparison
  const normalizedSearchId = normalizeId(searchId);
  const normalizedItemId = normalizeId(item.id);
  const normalizedItemThreadId = item.threadId ? normalizeId(item.threadId) : null;
  const normalizedItemNoteId = item.noteId ? normalizeId(item.noteId) : null;

  // Match by normalized IDs - this handles all format variations
  if (normalizedItemId === normalizedSearchId) return true;
  if (searchType === 'thread' && normalizedItemThreadId === normalizedSearchId) return true;
  if (searchType === 'note' && normalizedItemNoteId === normalizedSearchId) return true;
  
  // Also check exact matches (for backward compatibility during transition)
  if (item.id === searchId) return true;
  if (searchType === 'thread' && item.threadId === searchId) return true;
  if (searchType === 'note' && item.noteId === searchId) return true;

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
  userId,
  dataGeneratedAt,
  onNavigate,
  parentIsLoading = false,
  initialHasMoreFromParent,
  onNotePrefetch,
  onThreadIntent,
}: OrganizedContentListProps) {
  // Prevent a "flash" of server-rendered items that might include content the user deleted.
  // We can't read sessionStorage on the server, so we intentionally render a lightweight
  // placeholder until the client hydrates and we can apply the deleted ID filter.
  const [isHydrated, setIsHydrated] = useState(false);
  const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;
  useIsomorphicLayoutEffect(() => {
    setIsHydrated(true);
  }, []);

  // Stale cache detection: If SSR data is older than MAX_SSR_AGE, skip rendering stale data
  // and show loading state until fresh data arrives
  const MAX_SSR_AGE = 60000; // 60 seconds
  const isDataFromStaleCache = dataGeneratedAt && typeof window !== 'undefined' && (Date.now() - dataGeneratedAt > MAX_SSR_AGE);
  const [isWaitingForFreshData, setIsWaitingForFreshData] = useState<boolean>(() => !!isDataFromStaleCache);
  // True while a filter-change or initial-mount fetch is in flight. Prevents the
  // empty state from flashing before content loads (SPA always passes initialItems=[]).
  const [isLoadingFilter, setIsLoadingFilter] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

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
    if (initialHasMoreFromParent !== undefined) return initialHasMoreFromParent;
    if (filter === 'scripture') return true;
    return (initialItems || []).length >= 20;
  });
  const [currentItems, setCurrentItems] = useState<OrganizedContentItem[]>(() => {
    if (filter === 'scripture') return [];

    // STALE CACHE CHECK: If SSR data is from a cached page older than MAX_SSR_AGE,
    // skip rendering stale data - it will show loading state and wait for fresh data
    if (dataGeneratedAt && typeof window !== 'undefined') {
      const ssrAge = Date.now() - dataGeneratedAt;
      if (ssrAge > 60000) { // 60 seconds
        debug('[OrganizedContentList] SSR data is stale (age: ' + Math.round(ssrAge / 1000) + 's), skipping initial render');
        return [];
      }
    }

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

    // Debug logging to track lastVisited values on SSR initialization
    debug('[OrganizedContentList] SSR Init - Items with lastVisited:', {
      items: rawItems.slice(0, 10).map(i => ({
        id: i.id,
        type: i.type,
        title: i.title?.substring(0, 30),
        lastVisited: i.lastVisited instanceof Date ? i.lastVisited.toISOString() : (i.lastVisited ?? 'null')
      }))
    });

    const filtered = rawItems.filter(item => {
      if (!item || !item.id) return false;
      return !initialDeleted.has(normalizeId(item.id)) &&
             !initialDeleted.has(normalizeId(item.threadId)) &&
             !initialDeleted.has(normalizeId(item.noteId));
    });

    // Filter out deleted scripture notes from scriptureReferences arrays
    const filteredScriptureRefs = filtered.map(item => {
      if (item.scriptureReferences && item.scriptureReferences.length > 0) {
        const filteredRefs = item.scriptureReferences.filter(ref => {
          return !initialDeleted.has(normalizeId(ref.noteId));
        });
        return {
          ...item,
          scriptureReferences: filteredRefs
        };
      }
      return item;
    });

    return sortItems(filteredScriptureRefs);
  });

  // Offline-first data loading
  // Load from IndexedDB ONLY when offline
  // When online, server data (SSR + API) is the single source of truth
  // This prevents order inconsistency between browser and PWA caused by data source racing
  const hasLoadedFromIndexedDBRef = useRef(false);

  useEffect(() => {
    if (!userId || !isHydrated) return;
    if (hasLoadedFromIndexedDBRef.current) return; // Only load once per mount

    const loadOfflineDataFirst = async () => {
      try {
        // Only use IndexedDB as data source when OFFLINE
        // When online, server data (SSR props + API refresh) is the single source of truth
        // This prevents order inconsistency between browser and PWA
        if (typeof navigator !== 'undefined' && navigator.onLine) {
          debug('[OrganizedContentList] Online - skipping IndexedDB load, using server as source of truth');
          hasLoadedFromIndexedDBRef.current = true; // Mark as loaded to prevent retry
          return;
        }

        const { getDashboardSnapshotLocal } = await import('@/utils/offline-read-layer');
        const snapshot = await getDashboardSnapshotLocal(userId);

        if (!snapshot) return;

        // Map snapshot data to OrganizedContentItem format
        const localItems: OrganizedContentItem[] = [
          ...snapshot.threads.map(t => ({
            id: t.id, // Use t.id directly (already in thread_ format)
            type: 'thread' as const,
            title: t.title,
            subtitle: t.subtitle || `${t.noteCount} notes`,
            count: t.noteCount,
            threadId: t.id,
            spaceId: t.spaceId,
            accentColor: t.color ? getThreadColorCSS(t.color) : getThreadColorCSS('blue'),
            lastVisited: t.lastVisited || null,
            createdAt: t.createdAt,
            updatedAt: t.updatedAt || t.createdAt,
          })),
          ...snapshot.recentNotes.map(n => {
            const isEncrypted = (n as any).contentEncrypted === true;
            return {
              id: n.id, // Use n.id directly (already in note_ format)
              type: 'note' as const,
              title: n.title || 'Untitled Note',
              content: isEncrypted ? '' : n.content,
              noteId: n.id,
              threadId: n.threadId,
              spaceId: n.spaceId,
              noteType: n.noteType,
              lastVisited: n.lastVisited || null,
              createdAt: n.createdAt,
              updatedAt: n.updatedAt || n.createdAt,
              syncStatus: n.syncStatus,
              contentEncrypted: isEncrypted,
            };
          })
        ];

        // Filter out deleted items
        const notDeletedItems = localItems.filter(item => {
          return !deletedItemIdsRef.current.has(normalizeId(item.id)) &&
                 !deletedItemIdsRef.current.has(normalizeId(item.threadId)) &&
                 !deletedItemIdsRef.current.has(normalizeId(item.noteId));
        });

        // All items pass through - no client-side filtering needed
        // (lastVisited is set at creation time, so new notes appear at top via sorting)
        const filteredByScriptureRules = notDeletedItems;

        // Apply filter
        let filteredItems = filteredByScriptureRules;
        if (filter === 'threads') filteredItems = filteredByScriptureRules.filter(i => i.type === 'thread');
        if (filter === 'notes') filteredItems = filteredByScriptureRules.filter(i => i.type === 'note' && (i.noteType === 'default' || !i.noteType));
        if (filter === 'scripture') filteredItems = filteredByScriptureRules.filter(i => i.type === 'note' && i.noteType === 'scripture');
        if (filter === 'resources') filteredItems = filteredByScriptureRules.filter(i => i.type === 'note' && i.noteType === 'resource');

        const sorted = sortItems(filteredItems.map(normalizeItemDates));

        // Only update if IndexedDB has data AND we're truly offline
        // If we have initialItems from SSR, don't overwrite with potentially stale IndexedDB data
        // Server data (SSR + API) is always the source of truth when online
        if (sorted.length > 0) {
          // Double-check we're still offline before using IndexedDB data
          const isStillOffline = typeof navigator !== 'undefined' && !navigator.onLine;
          const hasInitialItems = initialItems && initialItems.length > 0;
          
          // Only use IndexedDB data if:
          // 1. We're still offline, AND
          // 2. We don't have initialItems from SSR (which means we're truly offline-first)
          if (isStillOffline && !hasInitialItems) {
            hasLoadedFromIndexedDBRef.current = true;
            setCurrentItems(sorted);
            debug(`[OrganizedContentList] Loaded ${sorted.length} items from IndexedDB (offline-first, no SSR data)`);
          } else if (isStillOffline && hasInitialItems) {
            // We're offline but have SSR data - IndexedDB might be stale, so don't use it
            debug(`[OrganizedContentList] Skipping IndexedDB load - have SSR data which is more authoritative`);
            hasLoadedFromIndexedDBRef.current = true; // Mark as loaded to prevent retry
          } else {
            // We came back online - server refresh will provide fresh data
            debug(`[OrganizedContentList] Skipping IndexedDB load - came back online, server will refresh`);
            hasLoadedFromIndexedDBRef.current = true; // Mark as loaded to prevent retry
          }
        }
      } catch (err) {
        console.error('[OrganizedContentList] IndexedDB load failed:', err);
      }
    };

    loadOfflineDataFirst();
  }, [userId, filter, isHydrated]);

  // Essential refs only
  const isMountedRef = useRef(true);
  const currentItemsRef = useRef<OrganizedContentItem[]>(currentItems);
  const hasMoreRef = useRef<boolean>(hasMore);
  const deletedItemIdsRef = useRef<Set<string>>(deletedItemIds);
  const filterRef = useRef<string>(filter);
  const optimisticUpdates = useOptimisticUpdates<OrganizedContentItem>();
  // Sequence counter to ensure unique timestamps for optimistic updates within the same millisecond
  const optimisticUpdateSequenceRef = useRef(0);
  
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
    if (!isDashboardPath()) return false;
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

        const REFRESH_TIMEOUT_MS = 18000; // 18s so hanging requests don't leave UI stuck on Loading
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS);

        let response: Response;
        try {
          response = await fetch(url, {
            credentials: 'include',
            cache: 'no-store', // Always bypass cache to ensure fresh data
            signal: controller.signal
          });
        } finally {
          clearTimeout(timeoutId);
        }

        if (!response.ok) {
          throw new Error(`Failed to refresh: ${response.status}`);
        }

        const data = await response.json();
        if (!isMountedRef.current) return false;

        // Normalize dates once at API boundary
        // Server is the source of truth - always use server data for lastVisited
        // This ensures consistent ordering across all devices
        const normalizedItems = (data.items || []).map(normalizeItemDates);

        // Debug logging to track lastVisited values on API refresh
        debug('[OrganizedContentList] API Refresh - Items with lastVisited:', {
          items: normalizedItems.slice(0, 10).map((i: OrganizedContentItem) => ({
            id: i.id,
            type: i.type,
            title: i.title?.substring(0, 30),
            lastVisited: i.lastVisited instanceof Date ? i.lastVisited.toISOString() : (i.lastVisited ?? 'null')
          }))
        });

        // Only preserve threadColors and optimistic lastVisited from current items
        // Use matchesItem for consistent, validated matching
        const currentSnapshot = [...currentItemsRef.current];
        normalizedItems.forEach((freshItem: OrganizedContentItem, index: number) => {
          // Find matching item using the unified matchesItem helper
          // This ensures consistent matching logic and prevents false matches
          const currentItem = currentSnapshot.find(item => 
            matchesItem(item, freshItem.id, freshItem.type)
          );

          if (currentItem) {
            // Validate: ensure types match (safety check)
            if (currentItem.type !== freshItem.type) {
              debug('[OrganizedContentList] refreshContent: Type mismatch in preservation', {
                freshItem: { id: freshItem.id, type: freshItem.type },
                currentItem: { id: currentItem.id, type: currentItem.type }
              });
              return; // Skip this item
            }

            // Preserve threadColors if missing (UI enrichment, doesn't affect order)
            if (!normalizedItems[index].threadColors && currentItem.threadColors) {
              normalizedItems[index] = {
                ...normalizedItems[index],
                threadColors: currentItem.threadColors
              };
            }

            // Preserve optimistic lastVisited if very recent
            // With 3-second server throttle and no hover prefetch, only keep if < 5 seconds old
            // This allows instant feedback while ensuring server confirmation happens quickly
            const idsMatch = currentItem.id === freshItem.id ||
                             (freshItem.type === 'thread' && currentItem.threadId === freshItem.threadId) ||
                             (freshItem.type === 'note' && currentItem.noteId === freshItem.noteId);

            if (idsMatch && currentItem.lastVisited) {
              const existingTime = normalizeDate(currentItem.lastVisited)?.getTime();
              const serverTime = normalizeDate(freshItem.lastVisited)?.getTime();
              const now = Date.now();

              // Only preserve if optimistic update is < 5 seconds old AND newer than server
              if (existingTime) {
                const age = now - existingTime;
                const isFresh = age < 5000; // 5 seconds - tight window since no hover prefetch
                const isNewer = !serverTime || existingTime > serverTime;

                if (isFresh && isNewer) {
                  normalizedItems[index] = {
                    ...normalizedItems[index],
                    lastVisited: currentItem.lastVisited,
                    lastUpdated: currentItem.lastUpdated || freshItem.lastUpdated
                  };

                  debug('[OrganizedContentList] refreshContent: Preserved fresh optimistic lastVisited', {
                    itemId: freshItem.id,
                    itemType: freshItem.type,
                    age: Math.round(age / 1000) + 's',
                    preservedTime: currentItem.lastVisited,
                    serverTime: freshItem.lastVisited
                  });
                }
              }
            }
          }
        });

        // Compare before/after to detect lastVisited changes
        const changedItems = normalizedItems.filter((freshItem: OrganizedContentItem) => {
          const currentItem = currentSnapshot.find(ci => matchesItem(ci, freshItem.id, freshItem.type));
          if (!currentItem) return false;
          const freshTime = freshItem.lastVisited instanceof Date ? freshItem.lastVisited.getTime() : freshItem.lastVisited;
          const currentTime = currentItem.lastVisited instanceof Date ? currentItem.lastVisited.getTime() : currentItem.lastVisited;
          return freshTime !== currentTime;
        });
        if (changedItems.length > 0) {
          debug('[OrganizedContentList] DETECTED CHANGES in lastVisited:', {
            changes: changedItems.slice(0, 5).map((item: OrganizedContentItem) => {
              const currentItem = currentSnapshot.find(ci => matchesItem(ci, item.id, item.type));
              return {
                id: item.id,
                type: item.type,
                title: item.title?.substring(0, 30),
                before: currentItem?.lastVisited instanceof Date ? currentItem.lastVisited.toISOString() : (currentItem?.lastVisited ?? 'null'),
                after: item.lastVisited instanceof Date ? item.lastVisited.toISOString() : (item.lastVisited ?? 'null')
              };
            })
          });
        }

        // Merge with optimistic items (unfiltered for master list)
        // Build confirmedIds set with all possible ID formats from server response
        const confirmedIds = new Set<string>();
        normalizedItems.forEach((item: OrganizedContentItem) => {
          const normalizedId = normalizeId(item.id);
          confirmedIds.add(normalizedId);
          if (item.threadId) {
            confirmedIds.add(normalizeId(item.threadId));
            // Also add the original format for matching
            confirmedIds.add(item.threadId);
          }
          if (item.noteId) {
            confirmedIds.add(normalizeId(item.noteId));
            // Also add the original format for matching
            confirmedIds.add(item.noteId);
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
                             normalizedItems.some((serverItem: OrganizedContentItem) => {
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
          return !normalizedItems.some((normalizedItem: OrganizedContentItem) => {
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
        
        // Filter out deleted items before sorting
        const filteredDeleted = finalDeduplicated.filter(item => {
          return !deletedItemIdsRef.current.has(normalizeId(item.id)) &&
                 !deletedItemIdsRef.current.has(normalizeId(item.threadId || '')) &&
                 !deletedItemIdsRef.current.has(normalizeId(item.noteId || ''));
        });
        
        // Filter out deleted scripture notes from scriptureReferences arrays
        const filteredScriptureRefs = filteredDeleted.map(item => {
          if (item.scriptureReferences && item.scriptureReferences.length > 0) {
            const filteredRefs = item.scriptureReferences.filter((ref: { reference: string; noteId: string }) => {
              return !deletedItemIdsRef.current.has(normalizeId(ref.noteId));
            });
            return {
              ...item,
              scriptureReferences: filteredRefs
            };
          }
          return item;
        });
        
        // Sort the final filtered list
        const sorted = sortItems(filteredScriptureRefs);

        // Check if we're looking for a specific item (using filtering logic for check only)
        if (options?.expectedItemId && options?.expectedItemType) {
          const itemExists = sorted.some(item =>
            matchesItem(item, options.expectedItemId!, options.expectedItemType!) &&
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
        if (isMountedRef.current && isDashboardPath() &&
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
      // Find all matching items to ensure only one matches
      const matchingIndices = prev
        .map((item, index) => matchesItem(item, itemId, itemType) ? index : -1)
        .filter(index => index !== -1);

      // Validation: Only update if exactly one item matches
      if (matchingIndices.length === 0) {
        debug('[OrganizedContentList] optimisticUpdateLastVisited: No item found', { itemId, itemType });
        return prev;
      }

      if (matchingIndices.length > 1) {
        debug('[OrganizedContentList] optimisticUpdateLastVisited: Multiple items matched!', { 
          itemId, 
          itemType, 
          matchingIndices,
          matchingItems: matchingIndices.map(i => ({ id: prev[i].id, type: prev[i].type, threadId: prev[i].threadId, noteId: prev[i].noteId }))
        });
        // Still update the first match, but log the issue
      }

      const itemIndex = matchingIndices[0];
      const matchedItem = prev[itemIndex];

      // Additional validation: ensure the matched item's type exactly matches
      if (matchedItem.type !== itemType) {
        debug('[OrganizedContentList] optimisticUpdateLastVisited: Type mismatch', { 
          itemId, 
          itemType, 
          matchedType: matchedItem.type 
        });
        return prev;
      }

      debug('[OrganizedContentList] optimisticUpdateLastVisited: Updating item', { 
        itemId, 
        itemType, 
        matchedId: matchedItem.id,
        matchedThreadId: matchedItem.threadId,
        matchedNoteId: matchedItem.noteId
      });

      const updated = [...prev];
      // Ensure unique timestamp by adding microsecond precision
      // This prevents items from getting identical timestamps when updated in rapid succession
      // Use sequence counter to ensure uniqueness within the same millisecond
      const baseTime = Date.now();
      const sequence = optimisticUpdateSequenceRef.current++;
      // Add 1 microsecond per sequence (0.001ms) to ensure uniqueness
      // Cap sequence at 999 to prevent overflow into next millisecond
      const sequenceOffset = (sequence % 1000) * 0.001;
      const uniqueTime = new Date(baseTime + sequenceOffset);
      
      updated[itemIndex] = {
        ...updated[itemIndex],
        lastVisited: uniqueTime,
        lastUpdated: uniqueTime.toISOString()
      };

      return sortItems(updated);
    });
  }, []);

  // Extract item ID from pathname
  const extractItemIdFromPath = useCallback((pathname: string): { id: string; type: 'thread' | 'note' } | null => {
    const cleanPath = pathname.split('?')[0].split('#')[0];

    // Handle new URL format: /thread/abc123, /note/def456
    const match = cleanPath.match(/^\/(thread|note)\/(.+)$/);
    if (match) {
      const dbId = match[1] + '_' + match[2];
      return { id: dbId, type: match[1] as 'thread' | 'note' };
    }

    return null;
  }, []);

  // Handle filter changes. When parent (e.g. DashboardPage React Query) provides
  // initialItems for this filter, use them and do not clear or refetch. When
  // initialItems are empty, show loading and rely on parent to pass data when
  // its fetch completes (no duplicate refreshContent()).
  const prevFilterRef2 = useRef<string>(filter);
  useEffect(() => {
    if (!isMountedRef.current) return;
    const filterChanged = prevFilterRef2.current !== filter;
    prevFilterRef2.current = filter;
    // Sync filterRef so any later refreshContent uses the correct filter.
    filterRef.current = filter;
    // On first mount with fresh SSR data, skip — the initialItems handler covers it
    const hasFreshSSRData = (initialItems || []).length > 0 && !isDataFromStaleCache;
    if (!filterChanged && hasFreshSSRData) {
      setIsLoadingFilter(false);
      return;
    }
    const hasCachedItems = (initialItems || []).length > 0;
    if (hasCachedItems) {
      // Parent already has data for this filter (e.g. React Query cache). Don't
      // clear, don't show loading, don't refetch — initialItems sync effect will
      // apply the data if needed.
      setIsLoadingFilter(false);
      return;
    }
    // No cache: show loading and clear list. Parent will fetch and pass
    // initialItems; initialItems sync effect will populate and clear loading.
    refreshStateRef.current.isRefreshing = false;
    refreshStateRef.current.lastRefreshKey = '';
    refreshStateRef.current.shouldBypassDebounce = true;
    setIsLoadingFilter(true);
    setCurrentItems([]);
    currentItemsRef.current = [];
    setHasMore(false);
    hasMoreRef.current = false;
  }, [filter, initialItems]);

  // Removed mount refresh to prevent race conditions with initialItems updates
  // initialItems from SSR are fresh, and the initialItems change handler (below)
  // already handles updates correctly. Mount refresh was causing double refreshes
  // and reordering issues when combined with stale cached pages.

  // Track previous initialItems to detect actual changes from server
  const prevPropsInitialItemsRef = useRef<string>('');

  // Handle initialItems changes (server-side props update).
  // Include scripture filter so switching to Scripture tab applies parent's scripture items.
  useEffect(() => {
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
      
      // Filter out deleted items
      const filteredDeleted = rawItems.filter(item => {
        return !deletedItemIdsRef.current.has(normalizeId(item.id)) &&
               !deletedItemIdsRef.current.has(normalizeId(item.threadId || '')) &&
               !deletedItemIdsRef.current.has(normalizeId(item.noteId || ''));
      });
      
      // Filter out deleted scripture notes from scriptureReferences arrays
      const filteredScriptureRefs = filteredDeleted.map(item => {
        if (item.scriptureReferences && item.scriptureReferences.length > 0) {
          const filteredRefs = item.scriptureReferences.filter(ref => {
            return !deletedItemIdsRef.current.has(normalizeId(ref.noteId));
          });
          return {
            ...item,
            scriptureReferences: filteredRefs
          };
        }
        return item;
      });
      
      const sorted = sortItems(filteredScriptureRefs);

      const nextHasMore = initialHasMoreFromParent !== undefined ? initialHasMoreFromParent : sorted.length >= 20;
      setHasMore(nextHasMore);
      hasMoreRef.current = nextHasMore;
      setCurrentItems(sorted);
      currentItemsRef.current = sorted;
      setIsLoadingFilter(false); // Parent (e.g. React Query) supplied data; clear loading
    }
  }, [initialItems, filter, initialHasMoreFromParent]); // Removed deletedItemIds from dependencies to prevent list reset on deletion

  // Listen for deletion events (client-only)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleNoteDeleted = (event: CustomEvent) => {
      const { noteId } = event.detail;
      if (noteId) {
        const normId = normalizeId(noteId);
        optimisticUpdates.removeOptimistic(noteId);
        // Note: no need for note- prefix since we're using note_ format
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

        // Immediately filter deleted scripture note from all items' scriptureReferences arrays
        // This ensures CardNote components update instantly without waiting for refresh
        setCurrentItems(prev => {
          const filtered = prev.map(item => {
            if (item.scriptureReferences && item.scriptureReferences.length > 0) {
              const filteredRefs = item.scriptureReferences.filter(ref => {
                return !deletedItemIdsRef.current.has(normalizeId(ref.noteId));
              });
              return {
                ...item,
                scriptureReferences: filteredRefs
              };
            }
            return item;
          });
          // Update ref to keep it in sync
          currentItemsRef.current = filtered;
          return filtered;
        });

        // If a scripture note is deleted and we're on the 'all' filter, refresh content
        // to update scripture references in CardNote components
        const currentFilter = filterRef.current;
        if (currentFilter === 'all' && isDashboardPath()) {
          // Check if the deleted note is a scripture note by looking it up in currentItems
          const deletedNote = currentItemsRef.current.find(
            item => item.type === 'note' && normalizeId(item.noteId || item.id) === normId
          );
          
          if (deletedNote && deletedNote.noteType === 'scripture') {
            // Refresh content to get updated scripture references for all notes
            // This ensures CardNote components show the correct "scripture notes included" count
            refreshContent().catch(err => {
              console.error('[OrganizedContentList] Failed to refresh content after scripture note deletion:', err);
            });
          }
        }
      }
    };

    const handleThreadDeleted = (event: CustomEvent) => {
      const { threadId } = event.detail;
      if (threadId) {
        const normId = normalizeId(threadId);
        optimisticUpdates.removeOptimistic(threadId);
        // Note: no need for thread- prefix since we're using thread_ format
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
  }, [optimisticUpdates, refreshContent]);

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

      if (isDashboardPath()) {
        if (currentFilter === 'scripture') {
          refreshContent();
        } else {
          if (note && (currentFilter === 'all' || currentFilter === 'notes')) {
            const noteItem: OrganizedContentItem = {
              id: note.id, // Use note.id directly (already in note_ format)
              type: 'note',
              title: note.title || 'Untitled Note',
              noteType: note.noteType || 'default',
              content: note.content,
              noteId: note.id,
              threadColors: note.threadColors,
              resourceTitle: note.resourceTitle,
              resourceDescription: note.resourceDescription,
              resourceImage: note.resourceImage,
              contentEncrypted: (note as any).contentEncrypted === true
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

      if (isDashboardPath()) {
        if (currentFilter === 'all' || currentFilter === 'threads') {
          const threadItem: OrganizedContentItem = {
            id: thread.id, // Use thread.id directly (already in thread_ format)
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
      if (isDashboardPath()) {
        if (filterRef.current === 'scripture') {
          refreshContent();
        } else {
          refreshContent();
        }
      }
    };

    const handleScriptureNotesUpdated = () => {
      if (isDashboardPath()) {
        refreshContent();
      }
    };

    const handleThreadUpdated = () => {
      if (isDashboardPath()) {
        refreshContent();
      }
    };

    const handleSpaceDeleted = () => {
      if (isDashboardPath()) {
        refreshContent();
      }
    };

    window.addEventListener('noteCreated', handleNoteCreated as EventListener);
    window.addEventListener('threadCreated', handleThreadCreated as EventListener);
    window.addEventListener('noteUpdated', handleNoteUpdated as EventListener);
    window.addEventListener('scriptureNotesUpdated', handleScriptureNotesUpdated as EventListener);
    window.addEventListener('threadUpdated', handleThreadUpdated as EventListener);
    window.addEventListener('spaceDeleted', handleSpaceDeleted as EventListener);

    return () => {
      window.removeEventListener('noteCreated', handleNoteCreated as EventListener);
      window.removeEventListener('threadCreated', handleThreadCreated as EventListener);
      window.removeEventListener('noteUpdated', handleNoteUpdated as EventListener);
      window.removeEventListener('scriptureNotesUpdated', handleScriptureNotesUpdated as EventListener);
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

    const handlePageLoad = () => {
      refreshStateRef.current.isNavigating = false;
      refreshStateRef.current.isNavigating = false;

      const isDashboard = isDashboardPath();
      const navigatedToDashboard = isDashboard && previousPathnameRef.current !== '/';
      const previousWasThreadOrNote = previousPathnameRef.current.startsWith('/thread/') || 
                                      previousPathnameRef.current.startsWith('/note/');

      if (isDashboard && isMountedRef.current) {
        if (navigatedToDashboard || previousWasThreadOrNote) {
          // RE-ENABLED: Optimistic updates for immediate feedback
          // Now safe because server throttle is only 10 seconds
          // This gives instant visual feedback while server confirms
          if (previousWasThreadOrNote) {
            const extracted = extractItemIdFromPath(previousPathnameRef.current);
            if (extracted) {
              debug('[OrganizedContentList] handlePageLoad: Optimistically updating item', {
                previousPath: previousPathnameRef.current,
                extractedId: extracted.id,
                extractedType: extracted.type
              });
              optimisticUpdateLastVisited(extracted.id, extracted.type);
            }
          }

          // Check if we already refreshed very recently (< 500ms)
          // This prevents double-refresh in PWA when both checkAndRefreshOnMount and handlePageLoad fire
          const now = Date.now();
          const timeSinceLastRefresh = now - refreshStateRef.current.lastRefreshTime;
          const recentlyRefreshed = refreshStateRef.current.lastRefreshTime > 0 && timeSinceLastRefresh < 500;

          if (recentlyRefreshed) {
            // Skip this refresh - we just did one
            debug('[OrganizedContentList] handlePageLoad: Skipping duplicate refresh', {
              timeSinceLastRefresh: Math.round(timeSinceLastRefresh) + 'ms'
            });
          } else {
            refreshStateRef.current.shouldBypassDebounce = true;
            refreshStateRef.current.lastRefreshTime = 0;

            if (refreshStateRef.current.pendingTimeout) {
              clearTimeout(refreshStateRef.current.pendingTimeout);
            }
            refreshStateRef.current.pendingTimeout = setTimeout(() => {
              refreshStateRef.current.pendingTimeout = null;
              if (isMountedRef.current && isDashboardPath() &&
                  !refreshStateRef.current.isNavigating && !refreshStateRef.current.isRefreshing) {
                refreshContent();
              }
            }, 150);
          }
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
            if (isMountedRef.current && isDashboardPath() && !refreshStateRef.current.isNavigating) {
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
      const isDashboard = isDashboardPath();
      if (!isDashboard) return;

      const inPWA = isPWA();
      const dataIsStale = isStaleData(initialItems, (item) => item.lastUpdated || item.lastVisited);
      const cameFromNotePage = referrerMatchesPattern('/note/');
      const previousWasNote = previousPathnameRef.current.startsWith('/note/');

      // Check if SSR data is from a stale cached page (older than 30 seconds)
      const ssrAge = dataGeneratedAt ? Date.now() - dataGeneratedAt : 0;
      const isFromStaleCache = ssrAge > 30000; // 30 seconds - trigger refresh sooner than the 60s render skip

      // Do NOT refresh when the only reason would be empty initialItems (SPA first load).
      // Parent (e.g. DashboardPage with React Query) supplies data via initialItems; we show loading via parentIsLoading.
      const shouldRefresh =
        inPWA || dataIsStale || isFromStaleCache || cameFromNotePage || previousWasNote;

      if (shouldRefresh) {
        // Set loading state if data is from stale cache
        if (isFromStaleCache) {
          debug('[OrganizedContentList] checkAndRefreshOnMount: SSR data from stale cache (age: ' + Math.round(ssrAge / 1000) + 's), refreshing');
          setIsWaitingForFreshData(true);
        }
        if (isMountedRef.current && isDashboardPath() &&
            !refreshStateRef.current.isNavigating && !refreshStateRef.current.isRefreshing) {
          refreshContent()
            .then((ok) => {
              setRefreshError(ok ? null : 'Couldn\'t load content');
            })
            .catch(() => {
              setRefreshError('Couldn\'t load content');
            })
            .finally(() => {
              setIsWaitingForFreshData(false);
            });
        }
      }
    };

    checkAndRefreshOnMount();

    document.addEventListener('app:route-change', handlePageLoad);

    return () => {
      document.removeEventListener('app:route-change', handlePageLoad);
      if (refreshStateRef.current.pendingTimeout) {
        clearTimeout(refreshStateRef.current.pendingTimeout);
        refreshStateRef.current.pendingTimeout = null;
      }
    };
  }, [refreshContent, optimisticUpdateLastVisited, extractItemIdFromPath, initialItems, dataGeneratedAt]);

  // Handle visibility changes for PWA
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const MIN_BACKGROUND_TIME = 5000;
    const MIN_REFRESH_INTERVAL = 2000;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        lastBackgroundTimeRef.current = Date.now();
      } else {
        const isDashboard = isDashboardPath();
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
          if (isMountedRef.current && isDashboardPath() &&
              !refreshStateRef.current.isNavigating && refreshStateRef.current.isRefreshing) {
            refreshContent()
              .then((ok) => {
                setRefreshError(ok ? null : 'Couldn\'t load content');
                refreshStateRef.current.isRefreshing = false;
              })
              .catch(() => {
                setRefreshError('Couldn\'t load content');
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

  // Set up Intersection Observer for prefetching thread content as they come into view
  // NOTE: This uses /api/threads/[id]/prefetch endpoint which does NOT update lastVisited
  // Only actual navigation to the thread page updates lastVisited
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
            // Prefetch thread content for faster loading (does not trigger lastVisited update)
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
      credentials: 'include',
      cache: 'no-store' // Always bypass cache to ensure fresh data and consistent ordering
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

    // Pre-compute deleted IDs set once for O(1) lookups
    const deletedIdsSet = deletedItemIdsRef.current;

    // Combine all filtering operations in a single pass for better performance
    // Process deduplication, deleted items, and scripture references together
    const processedItems = newItems
      .map((item: OrganizedContentItem) => {
        // Normalize dates first
        const normalizedItem = normalizeItemDates(item);
        
        // Check deduplication
        const uniqueId = normalizedItem.type === 'thread'
          ? normalizeId(normalizedItem.threadId || normalizedItem.id)
          : normalizeId(normalizedItem.noteId || normalizedItem.id);
        
        if (existingIds.has(uniqueId)) {
          return null; // Skip duplicate
        }
        
        // Check if item or any of its IDs are deleted
        if (deletedIdsSet.has(normalizeId(normalizedItem.id)) ||
            deletedIdsSet.has(normalizeId(normalizedItem.threadId || '')) ||
            deletedIdsSet.has(normalizeId(normalizedItem.noteId || ''))) {
          return null; // Skip deleted item
        }
        
        // Process scripture references inline if present
        if (normalizedItem.scriptureReferences && normalizedItem.scriptureReferences.length > 0) {
          const filteredRefs = normalizedItem.scriptureReferences.filter(ref => 
            !deletedIdsSet.has(normalizeId(ref.noteId))
          );
          return {
            ...normalizedItem,
            scriptureReferences: filteredRefs
          };
        }
        
        return normalizedItem;
      })
      .filter((item: OrganizedContentItem | null): item is OrganizedContentItem => item !== null);

    // Update the master list with only truly new items
    // Re-sort the combined list to ensure correct lastVisited ordering
    if (processedItems.length > 0) {
      setCurrentItems(prev => {
        // Also filter deleted scripture refs from existing items before combining
        const deletedIdsSet = deletedItemIdsRef.current;
        const filteredPrev = prev.map(item => {
          if (item.scriptureReferences && item.scriptureReferences.length > 0) {
            const filteredRefs = item.scriptureReferences.filter(ref => 
              !deletedIdsSet.has(normalizeId(ref.noteId))
            );
            return {
              ...item,
              scriptureReferences: filteredRefs
            };
          }
          return item;
        });
        const combined = [...filteredPrev, ...processedItems];
        return sortItems(combined);
      });
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
    const href =
      item.type === 'thread'
        ? idToUrl(item.threadId || item.id)
        : idToUrl(item.noteId || item.id, item.threadId || undefined);

    const isScriptureNote = item.type === 'note' && item.noteType === 'scripture';

    return (
      <div
        className={`content-item ${item.type}-item mb-3 card-enter`}
        style={{ animationDelay: `${index * 50}ms` }}
        data-thread-id={item.type === 'thread' ? item.threadId : undefined}
      >
        {item.type === 'note' && isScriptureNote ? (
          <div onPointerEnter={onNotePrefetch && item.noteId ? () => onNotePrefetch(item.noteId!) : undefined}>
            <CondensedNoteItem
              title={item.title}
              noteType={(item.noteType as 'default' | 'scripture' | 'resource' | undefined) || 'default'}
              href={href}
              threadColors={item.threadColors || undefined}
              noteId={item.noteId}
              scriptureTranslation={item.version}
              onClick={onNavigate ? (e) => { e.preventDefault(); onNavigate(href); } : undefined}
            />
          </div>
        ) : item.type === 'note' ? (
          <div
            role="link"
            tabIndex={0}
            className="block transition-transform duration-200 hover:scale-[1.002] active:scale-[0.99]"
            style={{ cursor: 'pointer' }}
            data-href={href}
            aria-label="Open note"
            onPointerEnter={onNotePrefetch && item.noteId ? () => onNotePrefetch(item.noteId!) : undefined}
            onClick={() => {
              if (onNavigate) onNavigate(href);
              else window.location.href = href;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (onNavigate) onNavigate(href);
                else window.location.href = href;
              }
            }}
          >
            <CardNote
              title={item.noteType === 'resource' && item.resourceTitle ? item.resourceTitle : item.title}
              content={item.noteType === 'resource' && item.resourceDescription ? item.resourceDescription : (item.content || '')}
              noteType={(item.noteType as 'default' | 'scripture' | 'resource' | undefined) || 'default'}
              resourceTitle={item.noteType === 'resource' ? (item.resourceTitle || null) : undefined}
              resourceDescription={item.noteType === 'resource' ? (item.resourceDescription || null) : undefined}
              resourceImage={item.noteType === 'resource' ? (item.resourceImage || null) : undefined}
              threadColors={item.threadColors ?? undefined}
              noteId={item.noteId}
              showScriptureRefsCollapsible={filter === 'all'}
              scriptureReferences={item.scriptureReferences}
              threadContextForScriptureLinks={item.threadId}
              isPendingSync={item.syncStatus === 'pending'}
              contentEncrypted={item.contentEncrypted === true}
            />
          </div>
        ) : (
          <a
            href={href}
            className="block transition-transform duration-200 hover:scale-[1.002] active:scale-[0.99]"
            onClick={onNavigate ? (e) => { e.preventDefault(); onNavigate(href); } : undefined}
            onPointerEnter={
              onThreadIntent
                ? () => {
                    const tid = item.threadId || item.id;
                    if (tid) onThreadIntent(tid);
                  }
                : undefined
            }
            onFocus={
              onThreadIntent
                ? () => {
                    const tid = item.threadId || item.id;
                    if (tid) onThreadIntent(tid);
                  }
                : undefined
            }
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
                createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : (item.createdAt ?? undefined),
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

  type VirtualEntry =
    | { type: 'section'; sectionKey: SectionKey; label: string }
    | { type: 'item'; item: OrganizedContentItem };

  const virtualList: VirtualEntry[] = (() => {
    const bySection = new Map<SectionKey, OrganizedContentItem[]>();
    for (const key of SECTION_ORDER) bySection.set(key, []);
    for (const item of displayItems) {
      const key = getSectionKeyForItem({
        lastVisited: item.lastVisited,
        createdAt: item.createdAt,
        threadId: item.threadId
      });
      bySection.get(key)!.push(item);
    }
    const out: VirtualEntry[] = [];
    for (const sectionKey of SECTION_ORDER) {
      const items = bySection.get(sectionKey)!;
      if (items.length === 0) continue;
      const label = SECTION_LABELS[sectionKey];
      if (label) out.push({ type: 'section', sectionKey, label });
      for (const item of items) out.push({ type: 'item', item });
    }
    return out;
  })();

  const itemOnlyIndexMap = new Map<number, number>();
  let itemCounter = 0;
  for (let i = 0; i < virtualList.length; i++) {
    if (virtualList[i].type === 'item') {
      itemOnlyIndexMap.set(i, itemCounter);
      itemCounter++;
    }
  }

  // Placeholder used before hydration so server and client render identical HTML (avoids hydration mismatch from client-only state like isWaitingForFreshData, deletedItemIds, stale cache).
  const placeholderStyle = {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minHeight: '200px',
    width: '100%',
    paddingTop: '48px',
    paddingBottom: '48px'
  };

  if (!isHydrated) {
    return (
      <div className="flex flex-col">
        <div style={placeholderStyle}>
          <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, color: '#78766f', fontSize: '14px' }}>
            Loading...
          </div>
        </div>
      </div>
    );
  }

  const isLoadingEmpty = (isWaitingForFreshData || isLoadingFilter || parentIsLoading) && displayItems.length === 0;

  return (
    <div className="flex flex-col" style={{ paddingBottom: '12px' }}>
      {isLoadingEmpty ? (
        <div style={{ minHeight: '48px' }} aria-hidden="true" />
      ) : displayItems.length > 0 ? (
        <InfiniteScrollList<VirtualEntry>
          initialItems={virtualList}
          items={virtualList}
          loadMore={loadMore}
          renderItem={(entry, index) =>
            entry.type === 'section' ? (
              <div className="organized-content__section-header">{entry.label}</div>
            ) : (
              renderItem(entry.item, itemOnlyIndexMap.get(index) ?? index)
            )
          }
          itemKey={(entry) => (entry.type === 'section' ? `section-${entry.sectionKey}` : entry.item.id)}
          limit={20}
          className="flex flex-col"
          initialHasMore={hasMore}
        />
      ) : refreshError ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '200px', width: '100%', textAlign: 'center', paddingTop: '48px', paddingBottom: '48px' }}>
          <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, color: '#78766f', fontSize: '14px', marginBottom: '12px' }}>
            {refreshError}
          </div>
          <button
            type="button"
            onClick={() => {
              setRefreshError(null);
              refreshContent()
                .then((ok) => setRefreshError(ok ? null : 'Couldn\'t load content'))
                .catch(() => setRefreshError('Couldn\'t load content'));
            }}
            style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', padding: '8px 16px', cursor: 'pointer' }}
          >
            Retry
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px', width: '100%', textAlign: 'center', paddingTop: '64px', paddingBottom: '64px' }}>
          <div className="empty-state-message">
            <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, color: '#4a473d', fontSize: '18px', lineHeight: '1.2' }}>
              <p>
                {filter === 'threads' ? 'No threads yet' :
                 filter === 'notes' ? 'No notes yet' :
                 filter === 'scripture' ? 'No scripture notes yet' :
                 filter === 'resources' ? 'No resources yet' :
                 'So when\'s move-in day?'}
              </p>
            </div>
            <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 400, color: '#78766f', fontSize: '14px', lineHeight: '1.3', maxWidth: '250px' }}>
              <p>
                {filter === 'threads' ? 'Add a thread to get started' :
                 filter === 'notes' ? 'Add a note to get started' :
                 filter === 'scripture' ? 'Add a scripture note to get started' :
                 filter === 'resources' ? 'Add a resource to get started' :
                 'Add to your Harvous and this area will start to feel lived in'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
