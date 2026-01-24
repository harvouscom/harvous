import React, { useState, useEffect, useRef, useCallback } from 'react';
import CardThread from './CardThread';
import CardNote from './CardNote';
import CondensedNoteItem from './CondensedNoteItem';
import { debug } from '@/utils/logger';
import { normalizeDate, sortByLastVisited } from '@/utils/sorting';
import { isPWA, isStaleData } from '@/utils/content-list-helpers';
import { useOptimisticUpdates } from '@/hooks/useOptimisticUpdates';
import { safeParseReferrer, referrerMatchesPattern } from '@/utils/safe-url';
import { setSelectedSpaceId } from './navigation/selectedSpace';
import { authenticatedFetch } from '@/utils/fetch-helpers';

interface SpaceItem {
  id: string;
  itemType: 'thread' | 'note';
  title: string;
  subtitle?: string;
  noteCount?: number;
  accentColor?: string;
  lastUpdated?: string;
  isPublic?: boolean;
  noteType?: 'default' | 'scripture' | 'resource';
  content?: string;
  resourceTitle?: string | null;
  resourceDescription?: string | null;
  resourceImage?: string | null;
  threadColors?: Array<{ color: string; frequency: number }>;
  createdAt?: Date | string;
  lastVisited?: Date | string;
}

interface SpaceContentListProps {
  initialItems: SpaceItem[];
  spaceId: string;
  filter?: 'all' | 'threads' | 'notes';
}

// Helper function to strip HTML tags
function stripHtml(html: string): string {
  if (!html) return '';
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return text;
}

export default function SpaceContentList({
  initialItems,
  spaceId,
  filter = 'all'
}: SpaceContentListProps) {
  const noteHref = (noteId: string) => `/${noteId}?space=${encodeURIComponent(spaceId)}`;
  const threadHref = (threadId: string) => `/${threadId}?space=${encodeURIComponent(spaceId)}`;
  const handleSelectSpace = () => setSelectedSpaceId(spaceId);
  // Sort initial items by lastVisited on mount
  // Use inline sorting logic in initializers (can't use useCallback here)
  const [items, setItems] = useState<SpaceItem[]>(() => {
    // Use shared sorting function that matches API logic
    const itemsWithUpdatedAt = (initialItems || []).map(item => ({
      ...item,
      updatedAt: item.lastUpdated
    }));
    const sorted = sortByLastVisited(itemsWithUpdatedAt);
    return sorted.map(({ updatedAt, ...item }) => item);
  });
  const [deletedItemIds, setDeletedItemIds] = useState<Set<string>>(new Set());
  const deletedItemIdsRef = useRef<Set<string>>(new Set());
  const isMountedRef = useRef(true);
  // Compute initial sorted items for ref (useRef doesn't support lazy initializers)
  const initialSortedItems = (() => {
    const itemsWithUpdatedAt = (initialItems || []).map(item => ({
      ...item,
      updatedAt: item.lastUpdated
    }));
    const sorted = sortByLastVisited(itemsWithUpdatedAt);
    return sorted.map(({ updatedAt, ...item }) => item);
  })();
  const itemsRef = useRef<SpaceItem[]>(initialSortedItems);
  const previousPathnameRef = useRef<string>(typeof window !== 'undefined' ? window.location.pathname : '');
  const isNavigatingRef = useRef(false);
  const hasRefreshedOnMountRef = useRef(false); // Track if mount refresh happened
  // Track optimistically added items that haven't been confirmed by API yet
  const optimisticUpdates = useOptimisticUpdates<SpaceItem>();
  // Track visibility changes for PWA foreground refresh
  const lastBackgroundTimeRef = useRef<number>(0);
  const lastVisibilityRefreshRef = useRef<number>(0);
  const isRefreshingRef = useRef(false);
  // Track pending optimistic updates (when list is empty)
  const pendingOptimisticUpdateRef = useRef<{ itemId: string; itemType: 'thread' | 'note' } | null>(null);

  // Use shared sorting function that matches API logic (lastVisited → updatedAt → createdAt → id)
  // Note: SpaceItem uses lastUpdated (string) instead of updatedAt, so we need to map it
  const sortItemsByLastVisited = useCallback((items: SpaceItem[]): SpaceItem[] => {
    // Map lastUpdated to updatedAt for the shared sorting function
    const itemsWithUpdatedAt = items.map(item => ({
      ...item,
      updatedAt: item.lastUpdated
    }));
    
    const sorted = sortByLastVisited(itemsWithUpdatedAt);
    
    // Map back to remove updatedAt (keep lastUpdated)
    return sorted.map(({ updatedAt, ...item }) => item);
  }, []);

  // Sort initial items on mount
  useEffect(() => {
    if (initialItems && initialItems.length > 0) {
      const sorted = sortItemsByLastVisited(initialItems);
      setItems(sorted);
      itemsRef.current = sorted;
    }
  }, [sortItemsByLastVisited]); // Include sortItemsByLastVisited in deps

  // Keep refs in sync with state
  useEffect(() => {
    itemsRef.current = items;
    deletedItemIdsRef.current = deletedItemIds;
  }, [items, deletedItemIds]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Optimistic update: immediately update lastVisited and re-sort items
  // Queues update in ref if list is empty, processed by useEffect when items load
  const optimisticUpdateLastVisited = useCallback((itemId: string, itemType: 'thread' | 'note') => {
    // Check if component is still mounted before proceeding
    if (!isMountedRef.current) {
      debug('[SpaceContentList] Component unmounted, skipping optimistic update', { itemId, itemType });
      return;
    }

    setItems(prev => {
      // Normalize itemId: remove thread_ or note_ prefix if present
      const normalizedItemId = itemId.startsWith('thread_') 
        ? itemId.substring(7) 
        : itemId.startsWith('note_') 
        ? itemId.substring(5) 
        : itemId;
      
      // Find the item by ID - STRICT TYPE CHECKING: only match items of the correct type
      let itemIndex = -1;
      
      if (itemType === 'thread') {
        // Only match threads - check type first, then ID
        itemIndex = prev.findIndex(item => {
          if (item.itemType !== 'thread') return false;
          // Try exact ID match first (most reliable)
          if (item.id === normalizedItemId) return true;
          // Try with prefix match
          if (item.id === itemId) return true;
          return false;
        });
      } else {
        // Only match notes - check type first, then ID
        itemIndex = prev.findIndex(item => {
          if (item.itemType !== 'note') return false;
          // Try exact ID match first (most reliable)
          if (item.id === normalizedItemId) return true;
          // Try with prefix match
          if (item.id === itemId) return true;
          return false;
        });
      }

      if (itemIndex === -1) {
        debug('[SpaceContentList] Item not found for optimistic update', { 
          itemId, 
          normalizedItemId,
          itemType,
          listLength: prev.length,
          availableIds: prev.slice(0, 5).map(i => ({ id: i.id, type: i.itemType }))
        });
        
        // If list is empty, queue the update for when items load
        if (prev.length === 0) {
          pendingOptimisticUpdateRef.current = { itemId, itemType };
          debug('[SpaceContentList] List empty, queued optimistic update', { itemId, itemType });
        }
        // If list has items but item not found, API refresh will handle it
        return prev;
      }

      // Validate that we found the correct item type
      const foundItem = prev[itemIndex];
      if (foundItem.itemType !== itemType) {
        debug('[SpaceContentList] Type mismatch in optimistic update', {
          itemId,
          itemType,
          foundType: foundItem.itemType,
          foundItem: { id: foundItem.id, type: foundItem.itemType }
        });
        return prev; // Don't update if type doesn't match
      }

      debug('[SpaceContentList] Found item for optimistic update', { 
        itemId, 
        normalizedItemId,
        itemType, 
        itemIndex, 
        currentItem: { 
          id: foundItem.id, 
          type: foundItem.itemType 
        }
      });

      // Update both lastVisited and lastUpdated
      const updatedItems = [...prev];
      const now = new Date();
      updatedItems[itemIndex] = {
        ...updatedItems[itemIndex],
        lastVisited: now,
        lastUpdated: now.toISOString()
      };

      // Re-sort using the callback (safe since we're in setState)
      const sorted = sortItemsByLastVisited(updatedItems);
      const newPosition = sorted.findIndex(i => i.id === updatedItems[itemIndex].id);
      debug('[SpaceContentList] Items re-sorted', { 
        itemId,
        normalizedItemId,
        oldPosition: itemIndex, 
        newPosition,
        isFirst: newPosition === 0
      });
      
      return sorted;
    });
  }, [sortItemsByLastVisited]);


  // Extract item ID from pathname (thread_xxx or note_xxx)
  // Extract item ID from pathname (thread_xxx or note_xxx)
  // Handles edge cases like query params and hash
  const extractItemIdFromPath = useCallback((pathname: string): { id: string; type: 'thread' | 'note' } | null => {
    // Remove query params and hash for clean pathname
    const cleanPath = pathname.split('?')[0].split('#')[0];
    
    // Remove leading slash
    const pathWithoutSlash = cleanPath.startsWith('/') ? cleanPath.substring(1) : cleanPath;
    
    // Check for thread_ prefix first (more specific)
    if (pathWithoutSlash.startsWith('thread_')) {
      const id = pathWithoutSlash; // Keep the full ID including prefix
      // Validate it's a valid thread ID format
      if (id.length > 7) { // thread_ is 7 chars, so valid ID should be longer
        return { id, type: 'thread' as const };
      }
    } 
    // Check for note_ prefix
    else if (pathWithoutSlash.startsWith('note_')) {
      const id = pathWithoutSlash; // Keep the full ID including prefix
      // Validate it's a valid note ID format
      if (id.length > 5) { // note_ is 5 chars, so valid ID should be longer
        return { id, type: 'note' as const };
      }
    }
    
    // If no match, return null
    return null;
  }, []);

  // Verification-based refresh function
  const refreshSpaceContent = useCallback(async (expectedItemId?: string, expectedItemType?: 'thread' | 'note'): Promise<boolean> => {
    if (!isMountedRef.current) return false;

    const verifyAndRefresh = async (maxAttempts = 3): Promise<boolean> => {
      const delays = [100, 200, 400]; // Exponential backoff in ms
      
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const response = await authenticatedFetch(`/api/spaces/${spaceId}/items`, {
            
            cache: 'no-store'
          });

          if (!response.ok) {
            console.error('[SpaceContentList] Failed to refresh content:', response.status);
            if (attempt < maxAttempts - 1) {
              await new Promise(resolve => setTimeout(resolve, delays[attempt]));
            }
            continue;
          }

          const data = await response.json();
          const { threads = [], notes = [] } = data;

          if (!isMountedRef.current) return false;

          // Combine threads and notes into sorted items with normalized dates
          const allItems: SpaceItem[] = [
            ...threads.map((thread: any) => ({
              id: thread.id,
              itemType: 'thread' as const,
              title: thread.title,
              subtitle: thread.subtitle || `${thread.noteCount || 0} notes`,
              noteCount: thread.noteCount,
              accentColor: thread.accentColor,
              lastUpdated: thread.lastUpdated,
              isPublic: thread.isPublic,
              createdAt: normalizeDate(thread.createdAt) || thread.createdAt,
              lastVisited: normalizeDate(thread.lastVisited) || thread.lastVisited
            })),
            ...notes.map((note: any) => ({
              id: note.id,
              itemType: 'note' as const,
              title: note.title || 'Untitled Note',
              noteType: note.noteType || 'default',
              content: note.content,
              resourceTitle: note.resourceTitle,
              resourceDescription: note.resourceDescription,
              resourceImage: note.resourceImage,
              threadColors: note.threadColors,
              createdAt: normalizeDate(note.createdAt) || note.createdAt,
              lastVisited: normalizeDate(note.lastVisited) || note.lastVisited
            }))
          ];
          
          // Sort items by lastVisited (newest first), fallback to createdAt
          const sortedAllItems = sortItemsByLastVisited(allItems);

          // Filter out deleted items
          const filtered = sortedAllItems.filter(item => !deletedItemIdsRef.current.has(item.id));

          // Merge with optimistic items that haven't been confirmed yet
          // Create a set of all confirmed item IDs
          const confirmedItemIds = new Set(filtered.map(item => item.id));
          const confirmedItemsMap = new Map<string, SpaceItem>(); // Track confirmed items for date comparison
          filtered.forEach(item => {
            confirmedItemsMap.set(item.id, item);
          });

          // Get optimistic items to merge (simplified - hook handles basic filtering)
          const optimisticItemsToKeep = optimisticUpdates.getOptimisticItemsToMerge(
            confirmedItemIds,
            5000, // 5 seconds
            (item) => {
              // Check if item matches current filter
              const matchesFilter = filter === 'all' || 
                                   (filter === 'threads' && item.itemType === 'thread') ||
                                   (filter === 'notes' && item.itemType === 'note');
              return matchesFilter && !deletedItemIdsRef.current.has(item.id);
            }
          );

          // Preserve optimistic lastVisited updates if they're newer than API data
          // This requires checking the hook's internal ref for timestamps
          // For now, we'll handle this in a simpler way by checking confirmed items
          optimisticUpdates.optimisticItemsRef.current.forEach(({ timestamp, item: optimisticItem }, itemId) => {
            if (confirmedItemIds.has(itemId) || confirmedItemIds.has(optimisticItem.id)) {
              // Item confirmed by API - check if optimistic update has newer lastVisited
              const confirmedItem = confirmedItemsMap.get(itemId) || confirmedItemsMap.get(optimisticItem.id);
              
              if (confirmedItem) {
                // Compare lastVisited dates - preserve optimistic if newer
                const optimisticLastVisited = optimisticItem.lastVisited instanceof Date 
                  ? optimisticItem.lastVisited 
                  : optimisticItem.lastVisited 
                    ? normalizeDate(optimisticItem.lastVisited) 
                    : null;
                const apiLastVisited = confirmedItem.lastVisited instanceof Date 
                  ? confirmedItem.lastVisited 
                  : confirmedItem.lastVisited 
                    ? normalizeDate(confirmedItem.lastVisited) 
                    : null;
                
                // If optimistic update is newer, update the confirmed item with optimistic date
                if (optimisticLastVisited && (!apiLastVisited || optimisticLastVisited > apiLastVisited)) {
                  const itemIndex = filtered.findIndex(i => i.id === confirmedItem.id || i.id === optimisticItem.id);
                  if (itemIndex !== -1) {
                    filtered[itemIndex] = {
                      ...filtered[itemIndex],
                      lastVisited: optimisticLastVisited,
                      lastUpdated: optimisticItem.lastUpdated || filtered[itemIndex].lastUpdated
                    };
                  }
                }
              }
              
              // Item confirmed by API, remove from optimistic tracking
              optimisticUpdates.removeOptimistic(itemId);
              optimisticUpdates.removeOptimistic(optimisticItem.id);
            }
          });

          // Combine API items with optimistic items
          // Ensure all dates are normalized before combining
          const combinedItemsRaw = [...filtered, ...optimisticItemsToKeep].map(item => ({
            ...item,
            lastVisited: item.lastVisited instanceof Date 
              ? item.lastVisited 
              : item.lastVisited 
                ? (normalizeDate(item.lastVisited) || item.lastVisited)
                : item.lastVisited,
            lastUpdated: item.lastUpdated ? (typeof item.lastUpdated === 'string' ? item.lastUpdated : normalizeDate(item.lastUpdated)?.toISOString() || item.lastUpdated) : item.lastUpdated,
            createdAt: item.createdAt instanceof Date 
              ? item.createdAt 
              : item.createdAt 
                ? (normalizeDate(item.createdAt) || item.createdAt)
                : item.createdAt
          }));
          const combinedItems = combinedItemsRaw;

          // Apply filter
          let filteredItemsRaw = filter === 'all' 
            ? combinedItems 
            : filter === 'threads'
            ? combinedItems.filter(item => item.itemType === 'thread')
            : combinedItems.filter(item => item.itemType === 'note');

          // Ensure items are sorted by lastVisited after filtering
          // Ensure all dates are normalized before sorting
          const filteredItems = sortItemsByLastVisited(filteredItemsRaw.map(item => ({
            ...item,
            lastVisited: item.lastVisited instanceof Date 
              ? item.lastVisited 
              : item.lastVisited 
                ? (normalizeDate(item.lastVisited) || item.lastVisited)
                : item.lastVisited
          })));

          // If we're looking for a specific item, check if it exists (in API or optimistic)
          if (expectedItemId) {
            const itemExists = filteredItems.some(item => 
              item.id === expectedItemId && 
              (!expectedItemType || item.itemType === expectedItemType)
            );
            if (!itemExists && attempt < maxAttempts - 1) {
              // Item not found yet, wait and retry
              await new Promise(resolve => setTimeout(resolve, delays[attempt]));
              continue;
            }
            
            // If item exists after all attempts (or found), remove from optimistic tracking
            if (itemExists && confirmedItemIds.has(expectedItemId)) {
              optimisticUpdates.removeOptimistic(expectedItemId);
            }
          }

          setItems(filteredItems);
          return true; // Success
        } catch (error) {
          console.error('[SpaceContentList] Error refreshing content:', error);
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
  }, [spaceId, filter]);

  // Check sessionStorage on mount for recently created items
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      // Check for recently created notes
      const recentNotesStr = sessionStorage.getItem('recentlyCreatedNotes');
      if (recentNotesStr) {
        const recentNotes = JSON.parse(recentNotesStr);
        const fiveSecondsAgo = Date.now() - 5000;

        // Check if any note was created in this space within last 5 seconds
        const relevantNote = recentNotes.find((n: any) => 
          n.spaceId === spaceId && n.timestamp > fiveSecondsAgo
        );

        if (relevantNote) {
          refreshSpaceContent(relevantNote.noteId, 'note').then((success) => {
            if (success) {
              const noteExists = itemsRef.current.some(item => 
                item.id === relevantNote.noteId && item.itemType === 'note'
              );
              if (noteExists) {
                // Note confirmed in list, safe to remove from sessionStorage
                const filtered = recentNotes.filter((n: any) => 
                  !(n.spaceId === spaceId && n.noteId === relevantNote.noteId)
                );
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

        // Check if any thread was created in this space within last 5 seconds
        const relevantThread = recentThreads.find((t: any) => 
          t.spaceId === spaceId && t.timestamp > fiveSecondsAgo
        );

        if (relevantThread) {
          refreshSpaceContent(relevantThread.threadId, 'thread').then((success) => {
            if (success) {
              const threadExists = itemsRef.current.some(item => 
                item.id === relevantThread.threadId && item.itemType === 'thread'
              );
              if (threadExists) {
                // Thread confirmed in list, safe to remove from sessionStorage
                const filtered = recentThreads.filter((t: any) => 
                  !(t.spaceId === spaceId && t.threadId === relevantThread.threadId)
                );
                sessionStorage.setItem('recentlyCreatedThreads', JSON.stringify(filtered));
              }
            }
          });
        }
      }
    } catch (error) {
      console.error('[SpaceContentList] Error checking sessionStorage:', error);
    }
  }, [spaceId, refreshSpaceContent]);

  // Listen for note created events
  useEffect(() => {
    const handleNoteCreated = async (event: CustomEvent) => {
      const { note, spaceId: eventSpaceId, noteId } = event.detail;
      const noteSpaceId = eventSpaceId || note?.spaceId;

      // Check if note was created in current space
      if (noteSpaceId === spaceId && noteId) {
        // Optimistic update - add note to list immediately
        if (note && (filter === 'all' || filter === 'notes')) {
          const newItem: SpaceItem = {
            id: note.id,
            itemType: 'note',
            title: note.title || 'Untitled Note',
            noteType: note.noteType || 'default',
            content: note.content,
            resourceTitle: note.resourceTitle,
            resourceDescription: note.resourceDescription,
            resourceImage: note.resourceImage,
            threadColors: note.threadColors,
            createdAt: note.createdAt || new Date(),
            lastVisited: note.lastVisited
          };

          // Track as optimistic item
          optimisticUpdates.addOptimistic(noteId, newItem);

          setItems(prev => {
            // Check if already exists
            if (prev.some(item => item.id === newItem.id)) {
              return prev;
            }
            // Add new item and re-sort by lastVisited
            return sortItemsByLastVisited([newItem, ...prev]);
          });
        }

        // Verify with API (retry logic handles transient failures)
        refreshSpaceContent(noteId, 'note').then((success) => {
          if (success) {
            // Remove from sessionStorage after successful verification
            try {
              const recentNotesStr = sessionStorage.getItem('recentlyCreatedNotes');
              if (recentNotesStr) {
                const recentNotes = JSON.parse(recentNotesStr);
                const filtered = recentNotes.filter((n: any) => 
                  !(n.spaceId === spaceId && n.noteId === noteId)
                );
                sessionStorage.setItem('recentlyCreatedNotes', JSON.stringify(filtered));
              }
            } catch (error) {
              console.error('[SpaceContentList] Error cleaning up sessionStorage after noteCreated:', error);
            }
          } else {
            // Verification failed after all attempts - check if we should remove optimistic item
            if (optimisticUpdates.hasOptimistic(noteId)) {
              // Remove optimistic item if verification failed
              optimisticUpdates.removeOptimistic(noteId);
              setItems(prev => prev.filter(item => item.id !== noteId));
            }
          }
        });
      }
    };

    const handleThreadCreated = async (event: CustomEvent) => {
      const { thread, spaceId: eventSpaceId, threadId } = event.detail;
      const threadSpaceId = eventSpaceId || thread?.spaceId;
      const actualThreadId = threadId || thread?.id;

      // Check if thread was created in current space
      if (threadSpaceId === spaceId && actualThreadId) {
        // Optimistic update - add thread to list immediately
        if (thread && (filter === 'all' || filter === 'threads')) {
          const newItem: SpaceItem = {
            id: thread.id,
            itemType: 'thread',
            title: thread.title || 'Untitled Thread',
            subtitle: '0 notes',
            noteCount: 0,
            accentColor: thread.accentColor,
            lastUpdated: thread.updatedAt || thread.createdAt,
            isPublic: thread.isPublic,
            createdAt: thread.createdAt || new Date(),
            lastVisited: thread.lastVisited
          };

          // Track as optimistic item
          optimisticUpdates.addOptimistic(actualThreadId, newItem);

          setItems(prev => {
            // Check if already exists
            if (prev.some(item => item.id === newItem.id)) {
              return prev;
            }
            // Add new item and re-sort by lastVisited
            return sortItemsByLastVisited([newItem, ...prev]);
          });
        }

        // Verify with API (retry logic handles transient failures)
        refreshSpaceContent(actualThreadId, 'thread').then((success) => {
          if (success) {
            // Remove from sessionStorage after successful verification
            try {
              const recentThreadsStr = sessionStorage.getItem('recentlyCreatedThreads');
              if (recentThreadsStr) {
                const recentThreads = JSON.parse(recentThreadsStr);
                const filtered = recentThreads.filter((t: any) => 
                  !(t.spaceId === spaceId && t.threadId === actualThreadId)
                );
                sessionStorage.setItem('recentlyCreatedThreads', JSON.stringify(filtered));
              }
            } catch (error) {
              console.error('[SpaceContentList] Error cleaning up sessionStorage after threadCreated:', error);
            }
          } else {
            // Verification failed after all attempts - check if we should remove optimistic item
            if (optimisticUpdates.hasOptimistic(actualThreadId)) {
              // Remove optimistic item if verification failed
              optimisticUpdates.removeOptimistic(actualThreadId);
              setItems(prev => prev.filter(item => item.id !== actualThreadId));
            }
          }
        });
      }
    };

    const handleNoteAddedToThread = async (event: CustomEvent) => {
      // Note added to thread might affect space if thread is in space
      // Refresh to get updated thread counts
      const { threadId } = event.detail;
      if (threadId) {
        // Check if this thread is in our space
        const threadInSpace = itemsRef.current.some(item => 
          item.itemType === 'thread' && item.id === threadId
        );
        if (threadInSpace) {
          // Verify with API (retry logic handles transient failures)
          refreshSpaceContent();
        }
      }
    };

    const handleNoteRemovedFromThread = async (event: CustomEvent) => {
      // Note removed from thread might affect space if thread is in space
      const { threadId } = event.detail;
      if (threadId) {
        const threadInSpace = itemsRef.current.some(item => 
          item.itemType === 'thread' && item.id === threadId
        );
        if (threadInSpace) {
          // Verify with API (retry logic handles transient failures)
          refreshSpaceContent();
        }
      }
    };

    window.addEventListener('noteCreated', handleNoteCreated as EventListener);
    window.addEventListener('threadCreated', handleThreadCreated as EventListener);
    window.addEventListener('noteAddedToThread', handleNoteAddedToThread as EventListener);
    window.addEventListener('noteRemovedFromThread', handleNoteRemovedFromThread as EventListener);

    return () => {
      window.removeEventListener('noteCreated', handleNoteCreated as EventListener);
      window.removeEventListener('threadCreated', handleThreadCreated as EventListener);
      window.removeEventListener('noteAddedToThread', handleNoteAddedToThread as EventListener);
      window.removeEventListener('noteRemovedFromThread', handleNoteRemovedFromThread as EventListener);
    };
  }, [spaceId, filter, refreshSpaceContent]);

  // Listen for navigation events to refresh when returning to space
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
    };

    const handlePageLoad = () => {
      // Reset navigation flag after page loads
      isNavigatingRef.current = false;

      const currentPath = window.location.pathname;
      const isSpacePage = currentPath === `/${spaceId}`;
      const navigatedToSpace = isSpacePage && previousPathnameRef.current !== `/${spaceId}`;

      // Only refresh if we're on the space page
      if (isSpacePage && isMountedRef.current) {
        // Check if we came from a thread or note page
        const referrer = document.referrer;
        const cameFromThreadOrNote = referrerMatchesPattern('/thread_') || referrerMatchesPattern('/note_');

        // Also check if previous pathname was a thread/note (for View Transitions scenarios)
        const previousWasThreadOrNote = previousPathnameRef.current.startsWith('/thread_') || 
                                        previousPathnameRef.current.startsWith('/note_');

        // Always refresh when navigating TO the space (to get fresh data with updated lastVisited)
        // Also refresh when coming from thread/note (to update lastVisited sorting)
        // This matches the dashboard behavior
        if (navigatedToSpace || cameFromThreadOrNote || previousWasThreadOrNote) {
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
            const referrerUrl = safeParseReferrer(referrer);
            if (referrerUrl) {
              const extracted = extractItemIdFromPath(referrerUrl.pathname);
              if (extracted) {
                visitedItemId = extracted.id;
                visitedItemType = extracted.type;
              }
            }
          }

          // Perform optimistic update immediately if we found the item
          if (visitedItemId && visitedItemType) {
            debug('[SpaceContentList] Performing optimistic update', { visitedItemId, visitedItemType });
            optimisticUpdateLastVisited(visitedItemId, visitedItemType);
          }

          debug('[SpaceContentList] Will refresh on page load', {
            navigatedToSpace,
            cameFromThreadOrNote,
            previousWasThreadOrNote,
            previousPath: previousPathnameRef.current,
            currentPath: currentPath,
            spaceId,
            optimisticUpdate: visitedItemId ? { id: visitedItemId, type: visitedItemType } : null
          });

          // Background API refresh (optimistic update already handled visual feedback, retry logic handles transient failures)
          if (isMountedRef.current && window.location.pathname === `/${spaceId}` && !isNavigatingRef.current) {
            debug('[SpaceContentList] Refreshing space content for verification');
            refreshSpaceContent().then((success) => {
              debug('[SpaceContentList] Refresh completed', { success, itemCount: itemsRef.current.length });
              // Sorting is already applied in refreshSpaceContent
            });
          } else {
            debug('[SpaceContentList] Skipped refresh - conditions not met', {
              isMounted: isMountedRef.current,
              currentPath: window.location.pathname,
              expectedPath: `/${spaceId}`,
              isNavigating: isNavigatingRef.current
            });
          }
        } else {
          debug('[SpaceContentList] Skipping refresh - no navigation detected', {
            navigatedToSpace,
            cameFromThreadOrNote,
            previousWasThreadOrNote,
            previousPath: previousPathnameRef.current,
            currentPath: currentPath
          });
        }
      }

      // Update previous pathname for next navigation
      previousPathnameRef.current = window.location.pathname;
    };

    // Check on mount if we're coming from a thread/note page (for full page reloads or when View Transitions don't fire)
    // Also check for PWA context and stale data
    const checkAndRefreshOnMount = () => {
      const currentPath = window.location.pathname;
      const isSpacePage = currentPath === `/${spaceId}`;
      
      if (!isSpacePage) return;

      // Check if running in PWA context - always refresh to get fresh data
      const inPWA = isPWA();
      
      // Check if initial data is stale
      const dataIsStale = isStaleData(initialItems, (item) => item.lastVisited);

      const referrer = document.referrer;
      const cameFromThreadOrNote = referrerMatchesPattern('/thread_') || referrerMatchesPattern('/note_');

      const previousWasThreadOrNote = previousPathnameRef.current.startsWith('/thread_') || 
                                      previousPathnameRef.current.startsWith('/note_');

      // Refresh if: PWA context, stale data, or coming from thread/note
      if (inPWA || dataIsStale || cameFromThreadOrNote || previousWasThreadOrNote) {
        // OPTIMISTIC UPDATE: Immediately update lastVisited and re-sort
        let visitedItemId: string | null = null;
        let visitedItemType: 'thread' | 'note' | null = null;

        // Try to extract item ID from previous pathname first
        if (previousWasThreadOrNote) {
          const extracted = extractItemIdFromPath(previousPathnameRef.current);
          if (extracted) {
            visitedItemId = extracted.id;
            visitedItemType = extracted.type;
          }
        }

        // Fallback to referrer
        if (!visitedItemId && cameFromThreadOrNote && referrer) {
          const referrerUrl = safeParseReferrer(referrer);
          if (referrerUrl) {
            const extracted = extractItemIdFromPath(referrerUrl.pathname);
            if (extracted) {
              visitedItemId = extracted.id;
              visitedItemType = extracted.type;
            }
          }
        }

        // Perform optimistic update immediately if we found the item
        if (visitedItemId && visitedItemType) {
          debug('[SpaceContentList] Mount check: performing optimistic update', { visitedItemId, visitedItemType });
          optimisticUpdateLastVisited(visitedItemId, visitedItemType);
        }

        debug('[SpaceContentList] Mount check: will refresh', {
          inPWA,
          dataIsStale,
          cameFromThreadOrNote,
          previousWasThreadOrNote,
          referrer,
          previousPath: previousPathnameRef.current,
          optimisticUpdate: visitedItemId ? { id: visitedItemId, type: visitedItemType } : null
        });
        
        // If PWA or stale data, refresh immediately (retry logic handles transient failures)
        // Otherwise, use optimistic update for navigation scenarios
        if (inPWA || dataIsStale) {
          if (isMountedRef.current && window.location.pathname === `/${spaceId}` && !isNavigatingRef.current) {
            refreshSpaceContent().then((success) => {
              debug('[SpaceContentList] Mount refresh completed (PWA/stale)', { success });
            });
          }
        } else {
          // Background API refresh for navigation scenarios (retry logic handles transient failures)
          if (isMountedRef.current && window.location.pathname === `/${spaceId}` && !isNavigatingRef.current) {
            refreshSpaceContent().then((success) => {
              debug('[SpaceContentList] Mount refresh completed', { success });
            });
          }
        }
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
    };
  }, [spaceId, refreshSpaceContent, optimisticUpdateLastVisited, extractItemIdFromPath]);

  // Listen for visibility changes to refresh when PWA comes to foreground
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const MIN_BACKGROUND_TIME = 30000; // 30 seconds
    const MIN_REFRESH_INTERVAL = 2000; // 2 seconds between refreshes

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // App went to background - record time
        lastBackgroundTimeRef.current = Date.now();
      } else {
        // App came to foreground
        const currentPath = window.location.pathname;
        const isSpacePage = currentPath === `/${spaceId}`;
        
        if (!isSpacePage) return;

        const timeInBackground = lastBackgroundTimeRef.current > 0 
          ? Date.now() - lastBackgroundTimeRef.current 
          : 0;
        const timeSinceLastRefresh = Date.now() - lastVisibilityRefreshRef.current;
        const inPWA = isPWA();

        // Only refresh if:
        // 1. Was in background for > 30 seconds, OR
        // 2. This is PWA (always refresh for PWA on foreground), OR
        // 3. First time coming to foreground (lastBackgroundTimeRef.current was 0)
        // Also ensure we're not already refreshing and component is mounted
        // Don't refresh if mount refresh just happened (avoid race conditions)
        const shouldRefresh = (timeInBackground > MIN_BACKGROUND_TIME || inPWA || lastBackgroundTimeRef.current === 0) &&
                              timeSinceLastRefresh > MIN_REFRESH_INTERVAL &&
                              !isNavigatingRef.current &&
                              !isRefreshingRef.current &&
                              !hasRefreshedOnMountRef.current && // Don't refresh if mount refresh just happened
                              isMountedRef.current;

        if (shouldRefresh) {
          lastVisibilityRefreshRef.current = Date.now();
          isRefreshingRef.current = true;
          
          debug('[SpaceContentList] Visibility change: refreshing content', {
            timeInBackground,
            inPWA,
            timeSinceLastRefresh
          });

          refreshSpaceContent().then((success) => {
            isRefreshingRef.current = false;
            debug('[SpaceContentList] Visibility refresh completed', { success });
          }).catch((error) => {
            isRefreshingRef.current = false;
            console.error('[SpaceContentList] Visibility refresh failed:', error);
          });
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [spaceId, refreshSpaceContent]);

  // Filter items based on current filter
  const filteredItems = filter === 'all' 
    ? items 
    : filter === 'threads'
    ? items.filter(item => item.itemType === 'thread')
    : items.filter(item => item.itemType === 'note');

  if (filteredItems.length === 0) {
    return (
      <div style={{ textAlign: 'center', paddingTop: '64px', paddingBottom: '64px' }}>
        <p style={{ fontWeight: 600, color: 'var(--color-pebble-grey)', fontSize: '18px' }}>
          {filter === 'threads' ? 'No threads found in this space.' : 
           filter === 'notes' ? 'No notes found in this space.' : 
           'No content found in this space.'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {filteredItems.map((item, index) => (
        <div 
          key={item.id} 
          className={`content-item ${item.itemType}-item mb-3 card-enter`}
          style={{ animationDelay: `${index * 50}ms` }}
        >
          {item.itemType === 'thread' ? (
            <a 
              href={threadHref(item.id)}
              className="block transition-transform duration-200 hover:scale-[1.002] active:scale-[0.99]"
              onClick={handleSelectSpace}
            >
              <CardThread 
                thread={{
                  id: item.id,
                  title: item.title,
                  subtitle: item.subtitle || `${item.noteCount || 0} notes`,
                  count: item.noteCount,
                  accentColor: item.accentColor,
                  lastUpdated: item.lastUpdated,
                  isPrivate: !item.isPublic
                }}
              />
            </a>
          ) : item.noteType === 'scripture' ? (
            <CondensedNoteItem 
              title={item.title || "Untitled Note"}
              noteType={item.noteType || 'default'}
              href={noteHref(item.id)}
              onClick={handleSelectSpace}
              threadColors={item.threadColors}
              noteId={item.id}
            />
          ) : (
            <a 
              href={noteHref(item.id)}
              className="block transition-transform duration-200 hover:scale-[1.002] active:scale-[0.99]"
              onClick={handleSelectSpace}
            >
              <CardNote 
                title={item.noteType === 'resource' && item.resourceTitle ? item.resourceTitle : (item.title || "Untitled Note")}
                content={(() => {
                  if (item.noteType === 'resource' && item.resourceDescription) {
                    return item.resourceDescription;
                  }
                  const cleanContent = stripHtml(item.content || '');
                  return cleanContent.substring(0, 150) + (cleanContent.length > 150 ? "..." : "");
                })()}
                noteType={item.noteType || 'default'}
                imageUrl={item.noteType === 'resource' && item.resourceImage ? item.resourceImage : undefined}
                resourceTitle={item.noteType === 'resource' ? (item.resourceTitle || null) : undefined}
                resourceDescription={item.noteType === 'resource' ? (item.resourceDescription || null) : undefined}
                resourceImage={item.noteType === 'resource' ? (item.resourceImage || null) : undefined}
                threadColors={item.threadColors}
                noteId={item.id}
              />
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

