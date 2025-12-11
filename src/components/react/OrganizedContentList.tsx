import React, { useState, useEffect, useRef, useCallback } from 'react';
import InfiniteScrollList from './InfiniteScrollList';
import CardNote from './CardNote';
import CardThread from './CardThread';
import CondensedNoteItem from './CondensedNoteItem';

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
  noteType?: string;
  isPrivate?: boolean;
  resourceTitle?: string | null;
  resourceDescription?: string | null;
  resourceImage?: string | null;
}

interface OrganizedContentListProps {
  initialItems: OrganizedContentItem[];
  filter?: 'all' | 'threads' | 'notes';
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
    const now = Date.now();
    const timeSinceLastRefresh = now - lastRefreshTimeRef.current;
    if (timeSinceLastRefresh < DEBOUNCE_WINDOW_MS) {
      // Too soon since last refresh, skip this one
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
    
    try {
      const url = new URL('/api/content/load-more', window.location.origin);
      url.searchParams.set('offset', '0');
      url.searchParams.set('limit', '20');
      url.searchParams.set('filter', filter);

      const response = await fetch(url.toString(), {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to refresh content');
      }

      const data = await response.json();
      // Filter out deleted items from refreshed items
      const filteredItems = data.items.filter((item: OrganizedContentItem) => {
        return !deletedItemIdsRef.current.has(item.id);
      });
      
      // Double-check we're still on dashboard and mounted before updating
      if (isMountedRef.current && window.location.pathname === '/' && !isNavigatingRef.current) {
        setCurrentItems(filteredItems);
      }
    } catch (error) {
      console.error('Error refreshing content:', error);
      // Don't update state on error - keep existing items
    } finally {
      if (isMountedRef.current) {
        isRefreshingRef.current = false;
      }
    }
  }, [filter]);

  // Keep ref in sync with state
  useEffect(() => {
    deletedItemIdsRef.current = deletedItemIds;
  }, [deletedItemIds]);

  // Update currentItems when initialItems change (e.g., after navigation)
  useEffect(() => {
    if (!initialItems || !Array.isArray(initialItems)) {
      setCurrentItems([]);
      return;
    }
    const filtered = initialItems.filter(item => item && item.id && !deletedItemIds.has(item.id));
    setCurrentItems(filtered);
  }, [initialItems, deletedItemIds]);

  // Listen for deletion events to track deleted items
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const handleNoteDeleted = (event: CustomEvent) => {
      const { noteId } = event.detail;
      if (noteId) {
        setDeletedItemIds(prev => {
          const newSet = new Set([...prev, noteId]);
          deletedItemIdsRef.current = newSet;
          return newSet;
        });
      }
    };

    const handleThreadDeleted = (event: CustomEvent) => {
      const { threadId } = event.detail;
      if (threadId) {
        setDeletedItemIds(prev => {
          const newSet = new Set([...prev, threadId]);
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

    const handleThreadCreated = () => {
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
    
    const handleBeforeNavigation = () => {
      isNavigatingRef.current = true;
      // Clear any pending refresh timeouts
      if (pendingRefreshTimeoutRef.current) {
        clearTimeout(pendingRefreshTimeoutRef.current);
        pendingRefreshTimeoutRef.current = null;
      }
    };
    
    const handlePageLoad = () => {
      // Reset navigation flag after page loads
      isNavigatingRef.current = false;
      
      // Only refresh if we're on the dashboard page
      if (window.location.pathname === '/' && isMountedRef.current) {
        // Small delay to ensure page is fully loaded and database is ready
        // Clear any pending timeout first
        if (pendingRefreshTimeoutRef.current) {
          clearTimeout(pendingRefreshTimeoutRef.current);
        }
        pendingRefreshTimeoutRef.current = setTimeout(() => {
          pendingRefreshTimeoutRef.current = null;
          if (isMountedRef.current && window.location.pathname === '/' && !isNavigatingRef.current) {
            refreshContent();
          }
        }, 200);
      }
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
            noteType={item.noteType || 'default'}
            href={href}
          />
        ) : item.type === 'note' ? (
          <a 
            href={href}
            className="block transition-transform duration-200 hover:scale-[1.002] active:scale-[0.99]"
          >
            <CardNote 
              title={item.noteType === 'resource' && item.resourceTitle ? item.resourceTitle : item.title}
              content={item.noteType === 'resource' && item.resourceDescription ? item.resourceDescription : (item.content || '')}
              noteType={item.noteType || 'default'}
              resourceTitle={item.noteType === 'resource' ? (item.resourceTitle || null) : undefined}
              resourceDescription={item.noteType === 'resource' ? (item.resourceDescription || null) : undefined}
              resourceImage={item.noteType === 'resource' ? (item.resourceImage || null) : undefined}
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

