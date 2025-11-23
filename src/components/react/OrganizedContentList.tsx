import React, { useState, useEffect, useRef, useCallback } from 'react';
import InfiniteScrollList from './InfiniteScrollList';
import CardNote from './CardNote';
import CardThread from './CardThread';

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

  // Refresh content by fetching fresh data from API
  const refreshContent = useCallback(async () => {
    // Guard against SSR and ensure browser APIs are available
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (isRefreshingRef.current || !isMountedRef.current) return;
    
    isRefreshingRef.current = true;
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
      
      if (isMountedRef.current) {
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

    const handleSpaceDeleted = (event: CustomEvent) => {
      const { spaceId } = event.detail;
      if (spaceId) {
        // When a space is deleted, we need to remove all threads/notes that belong to it
        // This is handled by filtering in the loadMore function
        setDeletedItemIds(prev => {
          const newSet = new Set([...prev, spaceId]);
          deletedItemIdsRef.current = newSet;
          return newSet;
        });
      }
    };

    window.addEventListener('noteDeleted', handleNoteDeleted as EventListener);
    window.addEventListener('threadDeleted', handleThreadDeleted as EventListener);
    window.addEventListener('spaceDeleted', handleSpaceDeleted as EventListener);

    return () => {
      window.removeEventListener('noteDeleted', handleNoteDeleted as EventListener);
      window.removeEventListener('threadDeleted', handleThreadDeleted as EventListener);
      window.removeEventListener('spaceDeleted', handleSpaceDeleted as EventListener);
    };
  }, []);

  // Listen for content creation events to refresh the list
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const handleNoteCreated = () => {
      // Small delay to ensure database is updated
      setTimeout(() => {
        if (isMountedRef.current) {
          refreshContent();
        }
      }, 300);
    };

    const handleThreadCreated = () => {
      // Small delay to ensure database is updated
      setTimeout(() => {
        if (isMountedRef.current) {
          refreshContent();
        }
      }, 300);
    };

    window.addEventListener('noteCreated', handleNoteCreated as EventListener);
    window.addEventListener('threadCreated', handleThreadCreated as EventListener);

    return () => {
      window.removeEventListener('noteCreated', handleNoteCreated as EventListener);
      window.removeEventListener('threadCreated', handleThreadCreated as EventListener);
    };
  }, [refreshContent]);

  // Listen for page load to refresh when navigating to dashboard via View Transitions
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    
    let isInitialMount = true;
    
    const handlePageLoad = () => {
      // Skip refresh on initial mount - server data is fresh
      if (isInitialMount) {
        isInitialMount = false;
        return;
      }
      
      if (!isMountedRef.current) return;
      
      // Check if we're on the dashboard/for you page
      const dashboardContent = document.getElementById('dashboard-content');
      const isDashboard = dashboardContent !== null || window.location.pathname === '/';
      
      if (isDashboard) {
        // Small delay to ensure page is fully loaded and database is ready
        setTimeout(() => {
          if (isMountedRef.current) {
            refreshContent();
          }
        }, 200);
      }
    };

    // Listen for View Transitions page load (not initial mount - server data is fresh on initial load)
    document.addEventListener('astro:page-load', handlePageLoad);

    return () => {
      document.removeEventListener('astro:page-load', handlePageLoad);
    };
  }, [refreshContent]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
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

    return (
      <div 
        className={`content-item ${item.type}-item mb-3 card-enter`}
        style={{ animationDelay: `${index * 50}ms` }}
      >
        <a 
          href={href}
          className="block transition-transform duration-200 hover:scale-[1.002]"
        >
          {item.type === 'note' ? (
            <CardNote 
              title={item.title}
              content={item.content || ''}
              noteType={item.noteType || 'default'}
            />
          ) : (
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
          )}
        </a>
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

