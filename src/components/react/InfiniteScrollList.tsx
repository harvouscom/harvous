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

  // Helper function to check if element is visible
  const isElementVisible = useCallback((element: HTMLElement | null): boolean => {
    if (!element) return false;
    
    // Check if element has display: none or visibility: hidden
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') {
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
    }
  }, [initialItems, limit, isControlled, initialHasMore]);

  const handleLoadMore = useCallback(async () => {
    if (loadingRef.current || isLoading || !hasMore) return;

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
      setHasMore(result.hasMore);
    } catch (err: any) {
      console.error('Error loading more items:', err);
      setError(err.message || 'Failed to load more items');
    } finally {
      setIsLoading(false);
      loadingRef.current = false;
    }
  }, [items, limit, loadMore, hasMore, isLoading, isControlled, onItemsChange]);

  // Trigger immediate load if hasMore is true but we have fewer items than expected
  // This handles cases where filtering reduces visible items below the total count
  useEffect(() => {
    // Determine the threshold: use minimumExpectedCount if provided, otherwise use limit
    const expectedCount = minimumExpectedCount !== undefined ? minimumExpectedCount : limit;
    
    // Check if component is visible before triggering auto-load
    const isVisible = isElementVisible(containerRef.current);
    
    // Trigger if:
    // 1. Items are below expected count AND component is visible
    // We should always try to load more if we're below the expected count, regardless of hasMore state
    // because hasMore might be false due to filtering, but we still need more items
    const needsMoreItems = items.length < expectedCount;
    const shouldTriggerLoad = needsMoreItems && !isLoading && !loadingRef.current && isVisible;
    
    if (shouldTriggerLoad) {
      // Small delay to avoid race conditions with other effects
      const timer = setTimeout(() => {
        // Re-check visibility and conditions before loading
        const stillVisible = isElementVisible(containerRef.current);
        const stillNeedsMore = items.length < expectedCount;
        if (stillNeedsMore && !isLoading && !loadingRef.current && stillVisible) {
          handleLoadMore();
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [hasMore, isLoading, items.length, limit, minimumExpectedCount, handleLoadMore, isElementVisible]);

  // Intersection Observer for auto-loading
  useEffect(() => {
    // Only set up observer if component is visible
    if (!isElementVisible(containerRef.current)) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        // Double-check visibility before loading
        if (entries[0].isIntersecting && hasMore && !isLoading && !loadingRef.current && isElementVisible(containerRef.current)) {
          handleLoadMore();
        }
      },
      { rootMargin: `${threshold}px` }
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
  }, [hasMore, isLoading, handleLoadMore, threshold, isElementVisible]);

  // Listen for tab visibility changes to trigger auto-load when tab becomes visible
  useEffect(() => {
    let wasVisible = isElementVisible(containerRef.current);
    
    const checkVisibilityAndLoad = () => {
      const isVisible = isElementVisible(containerRef.current);
      const becameVisible = !wasVisible && isVisible;
      wasVisible = isVisible;
      
      // If component just became visible, check if we need to load more
      if (becameVisible || isVisible) {
        if (isLoading || loadingRef.current) return;
        
        const expectedCount = minimumExpectedCount !== undefined ? minimumExpectedCount : limit;
        
        // Check if we need more items - we're below expected count
        const needsMoreItems = items.length < expectedCount;
        
        if (needsMoreItems && isVisible) {
          // Small delay to ensure DOM is ready
          setTimeout(() => {
            const stillVisible = isElementVisible(containerRef.current);
            const stillNeedsMore = items.length < expectedCount;
            if (stillNeedsMore && !isLoading && !loadingRef.current && stillVisible) {
              handleLoadMore();
            }
          }, 150);
        }
      }
    };

    // Check immediately on mount
    checkVisibilityAndLoad();

    // Listen for tab change events (from tab-manager.js) - event bubbles to document
    const handleTabChange = (event: Event) => {
      // Small delay to let DOM update
      setTimeout(checkVisibilityAndLoad, 50);
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
          setTimeout(checkVisibilityAndLoad, 50);
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
            {isLoading ? 'Loading...' : 'Load more'}
          </div>
        </>
      )}
    </div>
  );
}

