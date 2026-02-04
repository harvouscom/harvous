import React, { useState, useEffect, useRef, useCallback } from 'react';

interface InfiniteScrollListProps<T> {
  initialItems: T[];
  loadMore: (offset: number, limit: number) => Promise<{ items: T[]; hasMore: boolean }>;
  renderItem: (item: T, index: number) => React.ReactNode;
  itemKey?: (item: T, index: number) => string;
  limit?: number;
  threshold?: number;
  className?: string;
  // Optional controlled items - when provided, component uses these instead of internal state
  items?: T[];
  onItemsChange?: (items: T[]) => void;
  initialHasMore?: boolean;
  // Minimum expected count - if items.length < this and hasMore is true, trigger immediate load
  minimumExpectedCount?: number;
}

export default function InfiniteScrollList<T>({
  initialItems,
  loadMore,
  renderItem,
  itemKey = (item, index) => (item as any).id || `item-${index}`,
  limit = 20,
  threshold = 200,
  className = '',
  items: controlledItems,
  onItemsChange,
  initialHasMore,
  minimumExpectedCount
}: InfiniteScrollListProps<T>) {
  // Use controlled items if provided, otherwise use internal state
  const isControlled = controlledItems !== undefined;
  const [internalItems, setInternalItems] = useState<T[]>(initialItems);
  const items = isControlled ? controlledItems : internalItems;
  
  const [isLoading, setIsLoading] = useState(false);
  // Use initialHasMore if provided, otherwise calculate from initialItems length
  const [hasMore, setHasMore] = useState(initialHasMore !== undefined ? initialHasMore : initialItems.length >= limit);
  const [error, setError] = useState<string | null>(null);
  const observerTarget = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const errorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasMoreRef = useRef(hasMore);
  const handleLoadMoreRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const initialLoadAttemptedRef = useRef(false);
  const lastLoadMoreTimeRef = useRef(0);
  const itemsCountRef = useRef(items.length);
  const expectedCountRef = useRef(minimumExpectedCount !== undefined ? minimumExpectedCount : limit);
  const COOLDOWN_MS = 400;

  // Helper function to check if element is visible
  const isElementVisible = useCallback((element: HTMLElement | null): boolean => {
    if (!element || !element.isConnected) return false;
    
    // Check if element has display: none or visibility: hidden
    try {
      const style = window.getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') {
        return false;
      }
    } catch (e) {
      // In some browsers, getComputedStyle can throw if element is not in DOM
      return false;
    }
    
    // Check if element or any parent has the 'hidden' class
    let current: HTMLElement | null = element;
    while (current) {
      if (current.classList.contains('hidden')) {
        return false;
      }
      current = current.parentElement;
    }
    
    // Check if element is in viewport (at least partially visible)
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }, []);

  // Reset items when initialItems change (e.g., on page navigation)
  // Use a ref to track the previous initialItems to avoid unnecessary updates
  const prevInitialItemsRef = useRef<string>('');
  
  useEffect(() => {
    // Create a lightweight key from initialItems IDs to detect actual changes
    // Using string join instead of JSON.stringify for better performance
    const itemsKey = initialItems.map((item: any) => item.id ?? '').join(',');
    
    // Only update if items actually changed (not just reference)
    // Skip if controlled (parent manages state)
    if (!isControlled && itemsKey !== prevInitialItemsRef.current) {
      setInternalItems(initialItems);
      setHasMore(initialHasMore !== undefined ? initialHasMore : initialItems.length >= limit);
      setError(null);
      prevInitialItemsRef.current = itemsKey;
      initialLoadAttemptedRef.current = false;
    }
  }, [initialItems, limit, isControlled, initialHasMore]);
  
  // Update hasMore when initialHasMore changes (even in controlled mode)
  // This ensures hasMore is updated when filter changes or items are filtered
  useEffect(() => {
    if (initialHasMore !== undefined) {
      setHasMore(initialHasMore);
      initialLoadAttemptedRef.current = false;
    }
  }, [initialHasMore]);

  const handleLoadMore = useCallback(async () => {
    if (loadingRef.current || isLoading) return;
    
    // Only load more if hasMore is true (API indicates there are more items)
    // Don't load based on item count alone - respect API's hasMore value
    if (!hasMore) return;

    loadingRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const result = await loadMore(items.length, limit);
      const newItems = [...items, ...result.items];
      
      if (isControlled) {
        // If controlled, notify parent of change
        onItemsChange?.(newItems);
      } else {
        // If uncontrolled, update internal state
        setInternalItems(newItems);
      }
      
      // Use result.hasMore from API - don't override based on item count
      // If API says no more items, respect that even if we have fewer than expected
      // This prevents infinite loading loops when API correctly indicates no more items
      setHasMore(result.hasMore);
    } catch (err: any) {
      console.error('Error loading more items:', err);
      // Sanitize error messages to remove HTML content
      let errorMessage = err.message || 'Failed to load more items';
      // Remove HTML tags and DOCTYPE references
      if (errorMessage.includes('<!DOCTYPE') || errorMessage.includes('<html')) {
        errorMessage = 'Server returned an error page. Please try again.';
      } else if (errorMessage.includes('<')) {
        // Remove any HTML tags from error message
        errorMessage = errorMessage.replace(/<[^>]*>/g, '').trim();
        if (!errorMessage) {
          errorMessage = 'Failed to load more items';
        }
      }
      setError(errorMessage);
      // Clear error after 5 seconds to prevent persistent flickering
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }
      // Auto-clear error message after 5 seconds for better UX
      errorTimeoutRef.current = setTimeout(() => {
        setError(null);
        errorTimeoutRef.current = null;
      }, 5000);
    } finally {
      setIsLoading(false);
      loadingRef.current = false;
    }
  }, [items, limit, loadMore, hasMore, isLoading, isControlled, onItemsChange, minimumExpectedCount]);

  hasMoreRef.current = hasMore;
  handleLoadMoreRef.current = handleLoadMore;
  itemsCountRef.current = items.length;
  expectedCountRef.current = minimumExpectedCount !== undefined ? minimumExpectedCount : limit;

  // Trigger immediate load if hasMore is true but we have fewer items than expected
  // Coordinate with observer via initialLoadAttemptedRef so only one path runs the first load
  useEffect(() => {
    const expectedCount = minimumExpectedCount !== undefined ? minimumExpectedCount : limit;
    const isVisible = isElementVisible(containerRef.current);
    const inCooldown = Date.now() - lastLoadMoreTimeRef.current < COOLDOWN_MS;

    const shouldTriggerLoad =
      hasMore &&
      !isLoading &&
      !loadingRef.current &&
      isVisible &&
      (items.length < expectedCount || items.length === 0) &&
      !initialLoadAttemptedRef.current &&
      !inCooldown;

    if (shouldTriggerLoad) {
      initialLoadAttemptedRef.current = true;
      lastLoadMoreTimeRef.current = Date.now();
      // Use visibility check without arbitrary timeout
      const stillVisible = isElementVisible(containerRef.current);
      if (hasMoreRef.current && !loadingRef.current && stillVisible) {
        handleLoadMoreRef.current();
      }
    }
  }, [hasMore, isLoading, items.length, limit, minimumExpectedCount, handleLoadMore, isElementVisible]);

  // Intersection Observer for auto-loading - stable: do not depend on hasMore/isLoading/handleLoadMore
  // so the observer is not recreated after each load (which would re-fire when sentinel is still in view)
  useEffect(() => {
    if (!isElementVisible(containerRef.current)) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        if (!hasMoreRef.current || loadingRef.current) return;
        const expectedCount = expectedCountRef.current;
        const count = itemsCountRef.current;
        if (initialLoadAttemptedRef.current && count < expectedCount) {
          return;
        }
        initialLoadAttemptedRef.current = true;
        handleLoadMoreRef.current();
      },
      { rootMargin: `${threshold}px 0px ${threshold}px 0px` }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [threshold, isElementVisible]);

  // Listen for tab visibility changes to trigger auto-load when tab becomes visible
  useEffect(() => {
    let wasVisible = isElementVisible(containerRef.current);
    
    const checkVisibilityAndLoad = () => {
      const isVisible = isElementVisible(containerRef.current);
      const becameVisible = !wasVisible && isVisible;
      wasVisible = isVisible;
      
      // If component just became visible and we need more items, trigger load
      if (becameVisible && hasMore && !isLoading && !loadingRef.current) {
        const expectedCount = minimumExpectedCount !== undefined ? minimumExpectedCount : limit;
        const needsMoreItems = items.length < expectedCount;
        
        if (needsMoreItems) {
          // Use requestAnimationFrame to ensure DOM has updated
          requestAnimationFrame(() => {
            if (hasMore && !isLoading && !loadingRef.current && isElementVisible(containerRef.current)) {
              handleLoadMore();
            }
          });
        }
      }
    };

    // Check immediately on mount
    checkVisibilityAndLoad();

    // Listen for tab change events (from tab-manager.js) - event bubbles to document
    const handleTabChange = (event: Event) => {
      // Use requestAnimationFrame to let DOM update
      requestAnimationFrame(checkVisibilityAndLoad);
    };

    // Listen for custom tab change events on document (since they bubble)
    document.addEventListener('tabChange', handleTabChange);
    
    // Also use MutationObserver to detect when hidden class is removed from parent elements
    let mutationObserver: MutationObserver | null = null;
    if (containerRef.current) {
      mutationObserver = new MutationObserver((mutations) => {
        // Check if any mutation affected visibility
        const hadVisibilityChange = mutations.some(mutation => 
          mutation.type === 'attributes' && mutation.attributeName === 'class'
        );
        if (hadVisibilityChange) {
          // Use requestAnimationFrame to let DOM update
          requestAnimationFrame(checkVisibilityAndLoad);
        }
      });
      
      // Find the closest parent with data-tab-content attribute (the tab content container)
      let parent: HTMLElement | null = containerRef.current.parentElement;
      while (parent && !parent.hasAttribute('data-tab-content')) {
        parent = parent.parentElement;
      }
      
      // If we found the tab content container, observe it and its parent for class changes
      if (parent) {
        mutationObserver.observe(parent, { attributes: true, attributeFilter: ['class'] });
        if (parent.parentElement) {
          mutationObserver.observe(parent.parentElement, { attributes: true, attributeFilter: ['class'] });
        }
      }
    }

    return () => {
      document.removeEventListener('tabChange', handleTabChange);
      if (mutationObserver) {
        mutationObserver.disconnect();
      }
    };
  }, [hasMore, isLoading, items.length, limit, minimumExpectedCount, handleLoadMore, isElementVisible]);

  // Cleanup error timeout on unmount
  useEffect(() => {
    return () => {
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
        errorTimeoutRef.current = null;
      }
    };
  }, []);

  return (
    <div ref={containerRef} className={className}>
      {items.map((item, index) => (
        <div key={itemKey(item, index)}>
          {renderItem(item, index)}
        </div>
      ))}
      
      {error && (
        <div className="text-red-500 text-sm text-center py-4">
          {error}
        </div>
      )}

      {hasMore && (
        <>
          <div ref={observerTarget} className="h-4" />
          <div className="text-[12px] text-[var(--color-stone-grey)] font-sans text-center mt-4 mb-3">
            {isLoading ? (
              <span className="load-more-indicator" aria-label="Loading">
                <span className="load-more-indicator__dot" />
                <span className="load-more-indicator__dot" />
                <span className="load-more-indicator__dot" />
              </span>
            ) : (
              'Load more'
            )}
          </div>
        </>
      )}
    </div>
  );
}

