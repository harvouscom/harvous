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
  scriptureReferences?: Array<{ reference: string; noteId: string; threadColors?: Array<{ color: string; frequency: number }> }>;
  lastVisited?: Date | string | null;
  createdAt?: Date | string | null;
}

interface OrganizedContentListProps {
  initialItems: OrganizedContentItem[];
  filter?: 'all' | 'threads' | 'notes' | 'scripture' | 'resources';
}

// Helper to normalize dates once at API boundary
function normalizeItemDates(item: any): OrganizedContentItem {
  return {
    ...item,
    lastVisited: item.lastVisited ? normalizeDate(item.lastVisited) : null,
    lastUpdated: item.lastUpdated ? (normalizeDate(item.lastUpdated)?.toISOString() || item.lastUpdated) : item.lastUpdated,
    createdAt: item.createdAt ? normalizeDate(item.createdAt) : null,
    updatedAt: item.lastUpdated ? normalizeDate(item.lastUpdated) : (item.createdAt ? normalizeDate(item.createdAt) : null)
  };
}

// Helper to sort items by lastVisited (maps lastUpdated to updatedAt for sorting function)
function sortItems(items: OrganizedContentItem[]): OrganizedContentItem[] {
  const itemsWithUpdatedAt = items.map(item => ({
    ...item,
    updatedAt: item.lastUpdated ? normalizeDate(item.lastUpdated) : (item.createdAt ? normalizeDate(item.createdAt) : null)
  }));
  const sorted = sortByLastVisited(itemsWithUpdatedAt);
  return sorted.map(({ updatedAt, ...item }) => item);
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

export default function OrganizedContentList({ 
  initialItems, 
  filter = 'all' 
}: OrganizedContentListProps) {
  const [deletedItemIds, setDeletedItemIds] = useState<Set<string>>(new Set());
  const [hasMore, setHasMore] = useState<boolean>(() => {
    if (filter === 'scripture') return true;
    return (initialItems || []).length >= 20;
  });
  const [currentItems, setCurrentItems] = useState<OrganizedContentItem[]>(() => {
    if (filter === 'scripture') return [];
    return sortItems((initialItems || []).map(normalizeItemDates));
  });

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
          filter: currentFilter
        });

        if (!url) {
          throw new Error('Failed to build refresh URL');
        }

        const response = await fetch(url, {
          credentials: 'include',
          cache: options?.expectedItemId ? 'no-store' : 'default'
        });

        if (!response.ok) {
          throw new Error(`Failed to refresh: ${response.status}`);
        }

        const data = await response.json();
        if (!isMountedRef.current) return false;

        // Normalize dates once at API boundary
        const normalizedItems = (data.items || []).map(normalizeItemDates);

        // Filter out deleted items
        const filtered = normalizedItems.filter(item => !deletedItemIdsRef.current.has(item.id));

        // Preserve optimistic lastVisited updates
        const currentSnapshot = currentItemsRef.current;
        filtered.forEach((freshItem, index) => {
          // Use unified matching helper to find current item
          const currentItem = currentSnapshot.find(item => {
            // Direct ID match (most common case)
            if (item.id === freshItem.id) return true;
            // Use unified matching for UUID-based matching
            if (freshItem.type === 'thread' && freshItem.threadId) {
              return matchesItem(item, freshItem.threadId, 'thread');
            }
            if (freshItem.type === 'note' && freshItem.noteId) {
              return matchesItem(item, freshItem.noteId, 'note');
            }
            return false;
          });

          if (currentItem) {
            const currentLastVisited = normalizeDate(currentItem.lastVisited);
            const freshLastVisited = normalizeDate(freshItem.lastVisited);

            if (currentLastVisited && (!freshLastVisited || currentLastVisited > freshLastVisited)) {
              filtered[index] = {
                ...filtered[index],
                lastVisited: currentLastVisited,
                lastUpdated: currentItem.lastUpdated || filtered[index].lastUpdated || currentLastVisited.toISOString()
              };
            }
          }
        });

        // Merge with optimistic items
        // Build confirmed IDs set using unified matching
        const confirmedIds = new Set<string>();
        filtered.forEach(item => {
          confirmedIds.add(item.id);
          if (item.threadId) confirmedIds.add(item.threadId);
          if (item.noteId) confirmedIds.add(item.noteId);
        });

        const optimisticItemsToKeep: OrganizedContentItem[] = [];
        const fiveSecondsAgo = Date.now() - 5000;

        optimisticUpdates.optimisticItemsRef.current.forEach(({ timestamp, item: optimisticItem }, itemId) => {
          // Check if optimistic item is confirmed using unified matching
          const isConfirmed = confirmedIds.has(itemId) || confirmedIds.has(optimisticItem.id) ||
            (optimisticItem.threadId && confirmedIds.has(optimisticItem.threadId)) ||
            (optimisticItem.noteId && confirmedIds.has(optimisticItem.noteId)) ||
            // Also check if any filtered item matches the optimistic item
            filtered.some(item => matchesItem(item, itemId, optimisticItem.type));

          if (!isConfirmed && timestamp > fiveSecondsAgo) {
            const matchesFilter = currentFilter === 'all' ||
              (currentFilter === 'threads' && optimisticItem.type === 'thread') ||
              (currentFilter === 'notes' && optimisticItem.type === 'note' && (optimisticItem.noteType === 'default' || !optimisticItem.noteType)) ||
              (currentFilter === 'resources' && optimisticItem.type === 'note' && optimisticItem.noteType === 'resource');

            if (matchesFilter && !deletedItemIdsRef.current.has(itemId) && !deletedItemIdsRef.current.has(optimisticItem.id)) {
              optimisticItemsToKeep.push(optimisticItem);
            }
          } else if (isConfirmed) {
            optimisticUpdates.removeOptimistic(itemId);
            if (optimisticItem.threadId) optimisticUpdates.removeOptimistic(optimisticItem.threadId);
            if (optimisticItem.noteId) optimisticUpdates.removeOptimistic(optimisticItem.noteId);
            optimisticUpdates.removeOptimistic(optimisticItem.id);
          }
        });

        // Combine and sort
        const combined = [...filtered, ...optimisticItemsToKeep];
        const sorted = sortItems(combined);

        // Check if we're looking for a specific item
        if (options?.expectedItemId && options?.expectedItemType) {
          const itemExists = sorted.some(item => 
            matchesItem(item, options.expectedItemId, options.expectedItemType)
          );
          if (!itemExists && attempt < maxRetries - 1) {
            await new Promise(resolve => setTimeout(resolve, delays[attempt]));
            continue;
          }
        }

        // Update state
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

  // Handle initialItems changes
  useEffect(() => {
    if (filter === 'scripture') return;
    if (!initialItems || !Array.isArray(initialItems)) {
      setCurrentItems([]);
      currentItemsRef.current = [];
      return;
    }

    const filtered = initialItems
      .map(normalizeItemDates)
      .filter(item => item && item.id && !deletedItemIds.has(item.id));

    let finalFiltered = filtered;
    if (filter === 'threads') {
      finalFiltered = filtered.filter(item => item.type === 'thread');
    } else if (filter === 'notes') {
      finalFiltered = filtered.filter(item => item.type === 'note' && (item.noteType === 'default' || !item.noteType));
    } else if (filter === 'resources') {
      finalFiltered = filtered.filter(item => item.type === 'note' && item.noteType === 'resource');
    }

    const sorted = sortItems(finalFiltered);
    const newHasMore = sorted.length >= 20;
    setHasMore(newHasMore);
    hasMoreRef.current = newHasMore;
    setCurrentItems(sorted);
    currentItemsRef.current = sorted;
  }, [initialItems, deletedItemIds, filter]);

  // Handle deletion events
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleNoteDeleted = (event: CustomEvent) => {
      const { noteId } = event.detail;
      if (noteId) {
        optimisticUpdates.removeOptimistic(noteId);
        optimisticUpdates.removeOptimistic(`note-${noteId}`);
        setDeletedItemIds(prev => {
          const newSet = new Set([...prev, noteId, `note-${noteId}`]);
          deletedItemIdsRef.current = newSet;
          return newSet;
        });
      }
    };

    const handleThreadDeleted = (event: CustomEvent) => {
      const { threadId } = event.detail;
      if (threadId) {
        optimisticUpdates.removeOptimistic(threadId);
        optimisticUpdates.removeOptimistic(`thread-${threadId}`);
        setDeletedItemIds(prev => {
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
  }, [optimisticUpdates]);

  // Check sessionStorage for recently created items
  useEffect(() => {
    if (typeof window === 'undefined' || window.location.pathname !== '/') return;

    try {
      const recentNotesStr = sessionStorage.getItem('recentlyCreatedNotes');
      if (recentNotesStr) {
        const recentNotes = JSON.parse(recentNotesStr);
        const fiveSecondsAgo = Date.now() - 5000;
        const relevantNote = recentNotes.find((n: any) => n.timestamp > fiveSecondsAgo);

        if (relevantNote?.noteId) {
          refreshContent({ expectedItemId: relevantNote.noteId, expectedItemType: 'note' }).then(success => {
            if (success) {
              const filtered = recentNotes.filter((n: any) => n.noteId !== relevantNote.noteId);
              sessionStorage.setItem('recentlyCreatedNotes', JSON.stringify(filtered));
            }
          });
        }
      }

      const recentThreadsStr = sessionStorage.getItem('recentlyCreatedThreads');
      if (recentThreadsStr) {
        const recentThreads = JSON.parse(recentThreadsStr);
        const fiveSecondsAgo = Date.now() - 5000;
        const relevantThread = recentThreads.find((t: any) => t.timestamp > fiveSecondsAgo);

        if (relevantThread?.threadId) {
          refreshContent({ expectedItemId: relevantThread.threadId, expectedItemType: 'thread' }).then(success => {
            if (success) {
              const filtered = recentThreads.filter((t: any) => t.threadId !== relevantThread.threadId);
              sessionStorage.setItem('recentlyCreatedThreads', JSON.stringify(filtered));
            }
          });
        }
      }
    } catch (error) {
      console.error('[OrganizedContentList] Error checking sessionStorage:', error);
    }
  }, [refreshContent]);

  // Handle content creation/update events
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleNoteCreated = async (event?: Event) => {
      const customEvent = event as CustomEvent;
      const note = customEvent?.detail?.note;
      const noteId = customEvent?.detail?.noteId || note?.id;
      const currentFilter = filterRef.current;

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
            setCurrentItems(prev => {
              if (prev.some(item => item.noteId === note.id)) return prev;
              return sortItems([noteItem, ...prev]);
            });
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
          setCurrentItems(prev => {
            if (prev.some(item => item.threadId === thread.id)) return prev;
            return sortItems([threadItem, ...prev]);
          });
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
        const delay = (inPWA || dataIsStale) ? 300 : 200;
        setTimeout(() => {
          if (isMountedRef.current && window.location.pathname === '/' && 
              !refreshStateRef.current.isNavigating && !refreshStateRef.current.isRefreshing) {
            refreshContent();
          }
        }, delay);
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

    const MIN_BACKGROUND_TIME = 30000;
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

          const delay = inPWA ? 300 : 0;
          setTimeout(() => {
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
          }, delay);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshContent]);

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
  const loadMore = useCallback(async (offset: number, limit: number) => {
    if (typeof window === 'undefined') {
      return { items: [], hasMore: false };
    }

    const currentFilter = filterRef.current;
    const now = Date.now();
    const timeSinceRefresh = now - refreshStateRef.current.lastRefreshTimestamp;
    const inCooldown = timeSinceRefresh < 500;

    if (refreshStateRef.current.isRefreshing || inCooldown) {
      // If we're currently refreshing or in cooldown, return empty but set hasMore to false 
      // temporarily to prevent InfiniteScrollList from immediately re-triggering.
      // The hasMore state will be correctly restored once the refresh completes.
      return { items: [], hasMore: false };
    }

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
    const normalizedItems = (data.items || []).map(normalizeItemDates);
    const filteredItems = normalizedItems.filter(item => !deletedItemIdsRef.current.has(item.id));

    setHasMore(data.hasMore);
    hasMoreRef.current = data.hasMore;

    return {
      items: filteredItems,
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

  const filteredInitialItems = (currentItems || []).filter((item: OrganizedContentItem) => {
    return item && item.id && !deletedItemIds.has(item.id);
  });

  return (
    <div className="flex flex-col">
      {filteredInitialItems.length > 0 ? (
        <InfiniteScrollList
          initialItems={filteredInitialItems}
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
