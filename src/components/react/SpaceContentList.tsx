import React, { useState, useEffect, useRef, useCallback } from 'react';
import CardThread from './CardThread';
import CardNote from './CardNote';
import CondensedNoteItem from './CondensedNoteItem';
import { debug } from '@/utils/logger';

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

// Helper function to detect stale data (all items have same lastVisited or all null)
function isStaleData(items: SpaceItem[]): boolean {
  if (!items || items.length === 0) return false;
  
  const lastVisitedValues = items
    .map(item => item.lastVisited)
    .filter(val => val != null)
    .map(val => {
      const normalized = normalizeDate(val);
      return normalized ? normalized.getTime() : null;
    })
    .filter(val => val != null) as number[];
  
  // If all items have null lastVisited, consider it stale
  if (lastVisitedValues.length === 0) return true;
  
  // If all non-null lastVisited values are the same, consider it stale
  const uniqueValues = new Set(lastVisitedValues);
  if (uniqueValues.size === 1) return true;
  
  return false;
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

// Helper function to sort items by lastVisited (newest first), fallback to createdAt
function sortItemsByLastVisited(items: SpaceItem[]): SpaceItem[] {
  return [...items].sort((a, b) => {
    // Sort by lastVisited (newest first), fallback to createdAt if lastVisited is null
    const aTime = a.lastVisited || a.createdAt;
    const bTime = b.lastVisited || b.createdAt;
    
    // Handle Date objects, strings, and null/undefined
    const getDateValue = (time: Date | string | undefined | null): number => {
      if (!time) return 0;
      if (time instanceof Date) return time.getTime();
      if (typeof time === 'string') {
        const parsed = new Date(time);
        return isNaN(parsed.getTime()) ? 0 : parsed.getTime();
      }
      return 0;
    };
    
    const aDateValue = getDateValue(aTime);
    const bDateValue = getDateValue(bTime);
    
    return bDateValue - aDateValue; // Descending order (newest first)
  });
}

export default function SpaceContentList({
  initialItems,
  spaceId,
  filter = 'all'
}: SpaceContentListProps) {
  // Sort initial items by lastVisited on mount
  const [items, setItems] = useState<SpaceItem[]>(() => sortItemsByLastVisited(initialItems || []));
  const [deletedItemIds, setDeletedItemIds] = useState<Set<string>>(new Set());
  const deletedItemIdsRef = useRef<Set<string>>(new Set());
  const isMountedRef = useRef(true);
  const itemsRef = useRef<SpaceItem[]>(sortItemsByLastVisited(initialItems || []));
  const previousPathnameRef = useRef<string>(typeof window !== 'undefined' ? window.location.pathname : '');
  const isNavigatingRef = useRef(false);
  // Track optimistically added items that haven't been confirmed by API yet
  const optimisticItemsRef = useRef<Map<string, { timestamp: number; item: SpaceItem }>>(new Map());

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
  const optimisticUpdateLastVisited = useCallback((itemId: string, itemType: 'thread' | 'note') => {
    setItems(prev => {
      const itemIndex = prev.findIndex(item => item.id === itemId && item.itemType === itemType);
      if (itemIndex === -1) {
        // Item not found in current list (might be filtered out)
        return prev;
      }

      // Update the item's lastVisited to now
      const updatedItems = [...prev];
      updatedItems[itemIndex] = {
        ...updatedItems[itemIndex],
        lastVisited: new Date()
      };

      // Re-sort by lastVisited
      return sortItemsByLastVisited(updatedItems);
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
  const refreshSpaceContent = useCallback(async (expectedItemId?: string, expectedItemType?: 'thread' | 'note'): Promise<boolean> => {
    if (!isMountedRef.current) return false;

    const verifyAndRefresh = async (maxAttempts = 3): Promise<boolean> => {
      const delays = [100, 200, 400]; // Exponential backoff in ms
      
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const response = await fetch(`/api/spaces/${spaceId}/items`, {
            credentials: 'include',
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
          const confirmedItemIds = new Set(filtered.map(item => item.id));
          const optimisticItemsToKeep: SpaceItem[] = [];
          const now = Date.now();
          const fiveSecondsAgo = now - 5000;

          // Keep optimistic items that:
          // 1. Haven't been confirmed by API yet
          // 2. Were added recently (within last 5 seconds)
          // 3. Match the current filter
          optimisticItemsRef.current.forEach(({ timestamp, item }, itemId) => {
            if (!confirmedItemIds.has(itemId) && timestamp > fiveSecondsAgo) {
              // Check if item matches current filter
              const matchesFilter = filter === 'all' || 
                                   (filter === 'threads' && item.itemType === 'thread') ||
                                   (filter === 'notes' && item.itemType === 'note');
              
              if (matchesFilter && !deletedItemIdsRef.current.has(itemId)) {
                optimisticItemsToKeep.push(item);
              }
            } else if (confirmedItemIds.has(itemId)) {
              // Item confirmed by API, remove from optimistic tracking
              optimisticItemsRef.current.delete(itemId);
            }
          });

          // Combine API items with optimistic items
          const combinedItems = [...filtered, ...optimisticItemsToKeep];

          // Apply filter
          let filteredItems = filter === 'all' 
            ? combinedItems 
            : filter === 'threads'
            ? combinedItems.filter(item => item.itemType === 'thread')
            : combinedItems.filter(item => item.itemType === 'note');

          // Ensure items are sorted by lastVisited after filtering
          filteredItems = sortItemsByLastVisited(filteredItems);

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
              optimisticItemsRef.current.delete(expectedItemId);
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
          optimisticItemsRef.current.set(noteId, {
            timestamp: Date.now(),
            item: newItem
          });

          setItems(prev => {
            // Check if already exists
            if (prev.some(item => item.id === newItem.id)) {
              return prev;
            }
            // Add new item and re-sort by lastVisited
            return sortItemsByLastVisited([newItem, ...prev]);
          });
        }

        // Verify with API after short delay (with retries to preserve optimistic item)
        setTimeout(() => {
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
              // Only remove if it's been more than 2 seconds since creation (database likely doesn't have it)
              const optimisticItem = optimisticItemsRef.current.get(noteId);
              if (optimisticItem) {
                const timeSinceCreation = Date.now() - optimisticItem.timestamp;
                if (timeSinceCreation > 2000) {
                  // Remove optimistic item after 2 seconds if still not confirmed
                  optimisticItemsRef.current.delete(noteId);
                  setItems(prev => prev.filter(item => item.id !== noteId));
                }
              }
            }
          });
        }, 200);
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
          optimisticItemsRef.current.set(actualThreadId, {
            timestamp: Date.now(),
            item: newItem
          });

          setItems(prev => {
            // Check if already exists
            if (prev.some(item => item.id === newItem.id)) {
              return prev;
            }
            // Add new item and re-sort by lastVisited
            return sortItemsByLastVisited([newItem, ...prev]);
          });
        }

        // Verify with API after short delay (with retries to preserve optimistic item)
        setTimeout(() => {
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
              // Only remove if it's been more than 2 seconds since creation (database likely doesn't have it)
              const optimisticItem = optimisticItemsRef.current.get(actualThreadId);
              if (optimisticItem) {
                const timeSinceCreation = Date.now() - optimisticItem.timestamp;
                if (timeSinceCreation > 2000) {
                  // Remove optimistic item after 2 seconds if still not confirmed
                  optimisticItemsRef.current.delete(actualThreadId);
                  setItems(prev => prev.filter(item => item.id !== actualThreadId));
                }
              }
            }
          });
        }, 200);
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
          setTimeout(() => {
            refreshSpaceContent();
          }, 200);
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
          setTimeout(() => {
            refreshSpaceContent();
          }, 200);
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
        const cameFromThreadOrNote = referrer && (
          referrer.includes('/thread_') || 
          referrer.includes('/note_') ||
          new URL(referrer).pathname.startsWith('/thread_') ||
          new URL(referrer).pathname.startsWith('/note_')
        );

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

          // Background API refresh with minimal delay (optimistic update already handled visual feedback)
          setTimeout(() => {
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
          }, 100); // Reduced delay since optimistic update provides instant feedback
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
      const dataIsStale = isStaleData(initialItems);

      const referrer = document.referrer;
      const cameFromThreadOrNote = referrer && (
        referrer.includes('/thread_') || 
        referrer.includes('/note_') ||
        new URL(referrer).pathname.startsWith('/thread_') ||
        new URL(referrer).pathname.startsWith('/note_')
      );

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
        
        // If PWA or stale data, refresh immediately (no optimistic update needed)
        // Otherwise, use optimistic update for navigation scenarios
        if (inPWA || dataIsStale) {
          // Immediate refresh for PWA/stale data scenarios
          setTimeout(() => {
            if (isMountedRef.current && window.location.pathname === `/${spaceId}` && !isNavigatingRef.current) {
              refreshSpaceContent().then((success) => {
                debug('[SpaceContentList] Mount refresh completed (PWA/stale)', { success });
              });
            }
          }, 50); // Minimal delay for PWA/stale data
        } else {
          // Background API refresh with minimal delay for navigation scenarios
          setTimeout(() => {
            if (isMountedRef.current && window.location.pathname === `/${spaceId}` && !isNavigatingRef.current) {
              refreshSpaceContent().then((success) => {
                debug('[SpaceContentList] Mount refresh completed', { success });
              });
            }
          }, 100); // Reduced delay since optimistic update provides instant feedback
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
              href={`/${item.id}`}
              className="block transition-transform duration-200 hover:scale-[1.002] active:scale-[0.99]"
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
              href={`/${item.id}`}
              threadColors={item.threadColors}
              noteId={item.id}
            />
          ) : (
            <a 
              href={`/${item.id}`}
              className="block transition-transform duration-200 hover:scale-[1.002] active:scale-[0.99]"
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

