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
}

interface OrganizedContentListProps {
  initialItems: OrganizedContentItem[];
  filter?: 'all' | 'threads' | 'notes' | 'scripture' | 'resources';
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
  const DEBOUNCE_WINDOW_MS = 2000; // 2 seconds minimum between refreshes

  // Refresh content by fetching fresh data from API
  const refreshContent = useCallback(async () => {
    // Guard against SSR and ensure browser APIs are available
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    
    // Check if we're on the dashboard/for you page
    const isDashboard = window.location.pathname === '/';
    if (!isDashboard) {
      return; // Don't refresh if not on dashboard
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
    // Allow immediate refresh if lastRefreshTime is 0 (forced refresh)
    const now = Date.now();
    const timeSinceLastRefresh = now - lastRefreshTimeRef.current;
    if (lastRefreshTimeRef.current > 0 && timeSinceLastRefresh < DEBOUNCE_WINDOW_MS) {
      // Too soon since last refresh, skip this one (unless forced)
      return;
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
        const url = new URL('/api/content/load-more', window.location.origin);
        url.searchParams.set('offset', '0');
        url.searchParams.set('limit', '100'); // Match server-side limit
        url.searchParams.set('filter', filter);

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
          filter,
          threadItemsCount: threadItems.length
        });
        // Filter out deleted items from refreshed items
        const filteredItems = data.items.filter((item: OrganizedContentItem) => {
          return !deletedItemIdsRef.current.has(item.id);
        });
        
        // Double-check we're still on dashboard and mounted before updating
        if (isMountedRef.current && window.location.pathname === '/' && !isNavigatingRef.current) {
          setCurrentItems(filteredItems);
          debug('[OrganizedContentList] Updated currentItems', { itemCount: filteredItems.length });
        }
      } catch (error) {
        console.error(`[OrganizedContentList] Error refreshing content (attempt ${retryCount + 1}/${maxRetries + 1}):`, error);
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

  // Keep ref in sync with state
  useEffect(() => {
    deletedItemIdsRef.current = deletedItemIds;
  }, [deletedItemIds]);

  // Update currentItems when initialItems change (e.g., after navigation)
  useEffect(() => {
    if (!initialItems || !Array.isArray(initialItems)) {
      setCurrentItems([]);
      prevInitialItemsKeyRef.current = '';
      return;
    }
    
    // Create a lightweight key from initialItems to detect actual changes
    // This helps detect changes during View Transitions even if the array reference is the same
    const itemsKey = initialItems
      .map((item: OrganizedContentItem) => item?.id ?? '')
      .join(',') + `|${initialItems.length}`;
    
    // Only update if items actually changed (not just reference)
    if (itemsKey === prevInitialItemsKeyRef.current) {
      debug('[OrganizedContentList] initialItems unchanged, skipping update', {
        itemCount: initialItems.length,
        filter
      });
      return;
    }
    
    prevInitialItemsKeyRef.current = itemsKey;
    
    // Filter out deleted items first
    let filtered = initialItems.filter(item => item && item.id && !deletedItemIds.has(item.id));
    
    // Apply additional filtering based on filter type
    if (filter === 'threads') {
      // Ensure only threads are shown (initialItems should already be filtered, but double-check)
      filtered = filtered.filter(item => item.type === 'thread');
    } else if (filter === 'notes') {
      // Ensure only default note type notes are shown (exclude scripture and resource notes)
      filtered = filtered.filter(item => item.type === 'note' && (item.noteType === 'default' || !item.noteType));
    } else if (filter === 'scripture') {
      filtered = filtered.filter(item => item.type === 'note' && item.noteType === 'scripture');
    } else if (filter === 'resources') {
      filtered = filtered.filter(item => item.type === 'note' && item.noteType === 'resource');
    }
    // For 'all' filter, no additional filtering needed
    
    debug('[OrganizedContentList] Updating currentItems from initialItems', {
      initialItemsCount: initialItems.length,
      filteredCount: filtered.length,
      filter,
      itemsKey
    });
    
    setCurrentItems(filtered);
  }, [initialItems, deletedItemIds, filter]);

  // Listen for deletion events to track deleted items
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const handleNoteDeleted = (event: CustomEvent) => {
      const { noteId } = event.detail;
      if (noteId) {
        setDeletedItemIds(prev => {
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
        setDeletedItemIds(prev => {
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

  // Listen for content creation events to refresh the list
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Only set up listeners if we're on the dashboard page
    const checkAndRefresh = () => {
      // Check if still on dashboard page
      if (window.location.pathname === '/' && !isNavigatingRef.current && isMountedRef.current) {
        refreshContent();
      }
    };
    
    const handleNoteCreated = () => {
      // Small delay to ensure database is updated
      // Clear any pending timeout first
      if (pendingRefreshTimeoutRef.current) {
        clearTimeout(pendingRefreshTimeoutRef.current);
      }
      pendingRefreshTimeoutRef.current = setTimeout(() => {
        pendingRefreshTimeoutRef.current = null;
        checkAndRefresh();
      }, 300);
    };

    const handleThreadCreated = (event: Event) => {
      const customEvent = event as CustomEvent;
      const thread = customEvent.detail?.thread;
      debug('[OrganizedContentList] threadCreated event received', { threadId: thread?.id, filter });
      
      if (!thread || !thread.id) {
        console.warn('[OrganizedContentList] threadCreated event missing thread data');
        return;
      }
      
      // Immediately add the thread to the list if it matches the current filter
      // This provides instant feedback while the API refresh happens
      if (filter === 'all' || filter === 'threads') {
        const threadItem: OrganizedContentItem = {
          id: `thread-${thread.id}`,
          type: 'thread',
          title: thread.title || 'Untitled Thread',
          subtitle: '0 notes',
          threadId: thread.id,
          spaceId: thread.spaceId || null,
          count: 0,
          lastUpdated: thread.updatedAt || thread.createdAt || new Date().toISOString(),
          updatedAt: thread.updatedAt || thread.createdAt || new Date().toISOString(),
          accentColor: thread.color ? getThreadColorCSS(thread.color) : undefined,
          isPrivate: !thread.isPublic,
        };
        
        setCurrentItems(prev => {
          // Check if thread already exists to avoid duplicates
          const exists = prev.some(item => item.threadId === thread.id);
          if (exists) {
            debug('[OrganizedContentList] Thread already in list, skipping add');
            return prev;
          }
          debug('[OrganizedContentList] Adding thread to list immediately', { title: threadItem.title });
          // Add to beginning of list (newest first)
          return [threadItem, ...prev];
        });
      }
      
      // Longer delay to ensure database is updated and committed (increased to 1500ms for new threads)
      // Clear any pending timeout first
      if (pendingRefreshTimeoutRef.current) {
        clearTimeout(pendingRefreshTimeoutRef.current);
      }
      pendingRefreshTimeoutRef.current = setTimeout(() => {
        pendingRefreshTimeoutRef.current = null;
        debug('[OrganizedContentList] Refreshing content after threadCreated', { filter });
        // Force refresh by resetting lastRefreshTime to allow immediate refresh
        lastRefreshTimeRef.current = 0;
        checkAndRefresh();
      }, 1500);
    };

    const handleSpaceDeleted = () => {
      // When a space is deleted, threads and notes are preserved (spaceId set to null)
      // Refresh content to show the updated threads/notes
      // Small delay to ensure database is updated
      // Clear any pending timeout first
      if (pendingRefreshTimeoutRef.current) {
        clearTimeout(pendingRefreshTimeoutRef.current);
      }
      pendingRefreshTimeoutRef.current = setTimeout(() => {
        pendingRefreshTimeoutRef.current = null;
        checkAndRefresh();
      }, 300);
    };

    window.addEventListener('noteCreated', handleNoteCreated as EventListener);
    window.addEventListener('threadCreated', handleThreadCreated as EventListener);
    window.addEventListener('spaceDeleted', handleSpaceDeleted as EventListener);

    return () => {
      window.removeEventListener('noteCreated', handleNoteCreated as EventListener);
      window.removeEventListener('threadCreated', handleThreadCreated as EventListener);
      window.removeEventListener('spaceDeleted', handleSpaceDeleted as EventListener);
      // Clear pending timeout on cleanup
      if (pendingRefreshTimeoutRef.current) {
        clearTimeout(pendingRefreshTimeoutRef.current);
        pendingRefreshTimeoutRef.current = null;
      }
    };
  }, [refreshContent]);

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
      
      // Only refresh if we're on the dashboard page
      if (isDashboard && isMountedRef.current) {
        // If we navigated TO the dashboard (not just refreshed on it), prioritize server-rendered data
        // but also refresh to ensure we have the latest data
        if (navigatedToDashboard) {
          debug('[OrganizedContentList] Navigated to dashboard, will refresh after initialItems update', {
            previousPath: previousPathnameRef.current
          });
          // Reset refresh time to allow immediate refresh after initialItems are processed
          lastRefreshTimeRef.current = 0;
        }
        
        // Small delay to ensure page is fully loaded, initialItems are processed, and database is ready
        // Clear any pending timeout first
        if (pendingRefreshTimeoutRef.current) {
          clearTimeout(pendingRefreshTimeoutRef.current);
        }
        pendingRefreshTimeoutRef.current = setTimeout(() => {
          pendingRefreshTimeoutRef.current = null;
          if (isMountedRef.current && window.location.pathname === '/' && !isNavigatingRef.current) {
            // Force refresh by resetting lastRefreshTime if we navigated to dashboard
            if (navigatedToDashboard) {
              lastRefreshTimeRef.current = 0;
            }
            refreshContent();
          }
        }, 300); // Slightly longer delay to ensure initialItems are processed first
      }
      
      // Update previous pathname for next navigation
      previousPathnameRef.current = window.location.pathname;
    };

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
  }, [refreshContent]);

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
  const filteredInitialItems = (currentItems || []).filter(item => {
    // Use item.id as the primary identifier (it's always present)
    return item && item.id && !deletedItemIds.has(item.id);
  });

  const loadMore = useCallback(async (offset: number, limit: number) => {
    // Guard against SSR
    if (typeof window === 'undefined') {
      return { items: [], hasMore: false };
    }
    
    const url = new URL('/api/content/load-more', window.location.origin);
    url.searchParams.set('offset', offset.toString());
    url.searchParams.set('limit', limit.toString());
    url.searchParams.set('filter', filter);

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
    <InfiniteScrollList
      initialItems={filteredInitialItems}
      loadMore={loadMore}
      renderItem={renderItem}
      itemKey={(item) => item.id}
      limit={20}
      className="flex flex-col"
    />
  );
}

