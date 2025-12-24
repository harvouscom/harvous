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
    
    // Only trigger if we have hasMore, not currently loading, and items are below expected count
    // This ensures we load more items immediately when switching to filtered views
    const shouldTriggerLoad = hasMore && !isLoading && !loadingRef.current && items.length < expectedCount;
    
    if (shouldTriggerLoad) {
      // Small delay to avoid race conditions with other effects
      const timer = setTimeout(() => {
        if (hasMore && !isLoading && !loadingRef.current) {
          handleLoadMore();
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [hasMore, isLoading, items.length, limit, minimumExpectedCount, handleLoadMore]);

  // Intersection Observer for auto-loading
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading && !loadingRef.current) {
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
  }, [hasMore, isLoading, handleLoadMore, threshold]);

  return (
    <div className={className}>
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

