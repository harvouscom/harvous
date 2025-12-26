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
  const [isLoadingScripture, setIsLoadingScripture] = useState(false);
  const [hasMoreScripture, setHasMoreScripture] = useState<boolean | undefined>(undefined);
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
          // Mark that we're refreshing to prevent InfiniteScrollList from auto-loading
          isRefreshingItemsRef.current = true;
          lastRefreshItemsKeyRef.current = refreshedItemsKey;
          
          setCurrentItems(filteredItems);
          debug('[OrganizedContentList] Updated currentItems', { itemCount: filteredItems.length });
          
          // Clear the refreshing flag after a short delay to allow InfiniteScrollList to process the update
          setTimeout(() => {
            isRefreshingItemsRef.current = false;
          }, 100);
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
        // Filter currentItems to only show scripture notes while loading
        // This prevents showing items from previous filter (e.g., threads or regular notes)
        setCurrentItems((prev: OrganizedContentItem[]) => {
          const scriptureOnly = prev.filter((item: OrganizedContentItem) => 
            item.type === 'note' && item.noteType === 'scripture'
          );
          // If we have scripture notes from initialItems, show those; otherwise show empty array
          return scriptureOnly.length > 0 ? scriptureOnly : [];
        });
        
        setIsLoadingScripture(true);
        
        const fetchScriptureNotes = async () => {
          try {
            // Mark that we're fetching scripture notes to prevent refreshContent from interfering
            isRefreshingItemsRef.current = true;
            
            const url = new URL('/api/content/load-more', window.location.origin);
            url.searchParams.set('offset', '0');
            url.searchParams.set('limit', '200');
            url.searchParams.set('filter', 'scripture');

            const response = await fetch(url.toString(), {
              credentials: 'include'
            });

            if (!response.ok) {
              throw new Error(`Failed to load scripture notes: ${response.status}`);
            }

            const data = await response.json();
            
            const filteredItems = data.items.filter((item: OrganizedContentItem) => {
              return !deletedItemIdsRef.current.has(item.id);
            });
            
            // Store hasMore value from API response for pagination state
            const apiHasMore = data.hasMore ?? false;
            
            // Create a key from the fetched items to track what we just loaded
            const fetchedItemsKey = filteredItems.map((item: OrganizedContentItem) => item.id).join(',') + `|${filteredItems.length}`;
            lastRefreshItemsKeyRef.current = fetchedItemsKey;
            
            // Only update if still mounted and still on scripture filter
            // Double-check filter hasn't changed during fetch
            if (isMountedRef.current && filterRef.current === 'scripture' && !isNavigatingRef.current) {
              setCurrentItems(filteredItems);
              setHasMoreScripture(apiHasMore);
              setIsLoadingScripture(false);
              debug('[OrganizedContentList] Scripture notes loaded', { 
                itemCount: filteredItems.length,
                hasMore: apiHasMore
              });
            } else {
              debug('[OrganizedContentList] Skipping scripture notes update - filter changed or navigating', {
                currentFilter: filterRef.current,
                isNavigating: isNavigatingRef.current
              });
            }
          } catch (error) {
            console.error('[OrganizedContentList] Error loading scripture notes:', error);
            if (isMountedRef.current) {
              setIsLoadingScripture(false);
            }
          } finally {
            // Clear the refreshing flag after a short delay to allow InfiniteScrollList to process the update
            setTimeout(() => {
              isRefreshingItemsRef.current = false;
            }, 100);
          }
        };
        
        fetchScriptureNotes();
      } else {
        // If filter is already 'scripture' and hasn't changed, ensure loading state is false
        setIsLoadingScripture(false);
      }
    } else {
      // Not scripture filter, ensure loading state is false and clear hasMoreScripture
      setIsLoadingScripture(false);
      setHasMoreScripture(undefined);
    }
    prevFilterRef.current = filter;
  }, [filter]);
  
  // Update currentItems when initialItems change (e.g., after navigation)
  useEffect(() => {
    // Skip updating from initialItems if filter is 'scripture' - the filter useEffect handles fetching all scripture notes
    if (filter === 'scripture') {
      return;
    }
    
    if (!initialItems || !Array.isArray(initialItems)) {
      setCurrentItems([]);
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
  }, [initialItems, deletedItemIds, filter]);

  // Listen for deletion events to track deleted items
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const handleNoteDeleted = (event: CustomEvent) => {
      const { noteId } = event.detail;
      if (noteId) {
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

  // Listen for content creation events to refresh the list
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Only set up listeners if we're on the dashboard page
    const checkAndRefresh = () => {
      // Check if still on dashboard page
      if (window.location.pathname === '/' && !isNavigatingRef.current && isMountedRef.current) {
        refreshContentRef.current?.();
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
      const currentFilter = filterRef.current;
      debug('[OrganizedContentList] threadCreated event received', { threadId: thread?.id, filter: currentFilter });
      
      if (!thread || !thread.id) {
        console.warn('[OrganizedContentList] threadCreated event missing thread data');
        return;
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
        
        setCurrentItems((prev: OrganizedContentItem[]) => {
          // Check if thread already exists to avoid duplicates
          const exists = prev.some((item: OrganizedContentItem) => item.threadId === thread.id);
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
        debug('[OrganizedContentList] Refreshing content after threadCreated', { filter: currentFilter });
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
  }, []); // Empty deps - we use ref to access latest refreshContent

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
        // Don't refresh if we're already refreshing or if refresh was called recently
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
            // Double-check we're not already refreshing before calling
            if (!isRefreshingRef.current) {
              // Force refresh by resetting lastRefreshTime if we navigated to dashboard
              if (navigatedToDashboard) {
                lastRefreshTimeRef.current = 0;
              }
              refreshContentRef.current?.();
            }
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
  }, []); // Empty deps - we use ref to access latest refreshContent

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
    
    // If offset is 0 and we just refreshed, skip this load
    // refreshContent already loaded items from offset 0 (but not for scripture filter)
    // For scripture filter, the initial fetch in useEffect handles offset 0
    if (offset === 0 && lastRefreshItemsKeyRef.current !== '' && currentFilter !== 'scripture') {
      debug('[OrganizedContentList] Skipping loadMore offset 0 - already refreshed', { offset, filter: currentFilter });
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
    
    // Update hasMoreScripture state when loadMore is called for scripture filter
    if (currentFilter === 'scripture') {
      setHasMoreScripture(data.hasMore ?? false);
    }
    
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

  // Calculate initialHasMore based on filter
  // For scripture filter, use the hasMoreScripture state from API response
  // For other filters, calculate from initialItems length
  const initialHasMore = filter === 'scripture' 
    ? hasMoreScripture 
    : (filteredInitialItems.length >= 20);

  return (
    <div className="flex flex-col">
      <InfiniteScrollList
        initialItems={filteredInitialItems}
        loadMore={loadMore}
        renderItem={renderItem}
        itemKey={(item) => item.id}
        limit={20}
        initialHasMore={initialHasMore}
        className="flex flex-col"
      />
      {isLoadingScripture && (
        <div className="text-[12px] text-[var(--color-stone-grey)] font-sans text-center py-4">
          Loading scripture notes...
        </div>
      )}
    </div>
  );
}

