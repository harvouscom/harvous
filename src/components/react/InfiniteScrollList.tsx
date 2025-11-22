import React, { useState, useEffect, useRef, useCallback } from 'react';
import ButtonSmall from './ButtonSmall';

interface InfiniteScrollListProps<T> {
  initialItems: T[];
  loadMore: (offset: number, limit: number) => Promise<{ items: T[]; hasMore: boolean }>;
  renderItem: (item: T, index: number) => React.ReactNode;
  itemKey?: (item: T, index: number) => string;
  limit?: number;
  threshold?: number;
  className?: string;
}

export default function InfiniteScrollList<T>({
  initialItems,
  loadMore,
  renderItem,
  itemKey = (item, index) => (item as any).id || `item-${index}`,
  limit = 20,
  threshold = 200,
  className = ''
}: InfiniteScrollListProps<T>) {
  const [items, setItems] = useState<T[]>(initialItems);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialItems.length >= limit);
  const [error, setError] = useState<string | null>(null);
  const observerTarget = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  // Reset items when initialItems change (e.g., on page navigation)
  // Use a ref to track the previous initialItems to avoid unnecessary updates
  const prevInitialItemsRef = useRef<string>('');
  
  useEffect(() => {
    // Create a stable key from initialItems to detect actual changes
    const itemsKey = JSON.stringify(initialItems.map((item: any) => item.id || item));
    
    // Only update if items actually changed (not just reference)
    if (itemsKey !== prevInitialItemsRef.current) {
      setItems(initialItems);
      setHasMore(initialItems.length >= limit);
      setError(null);
      prevInitialItemsRef.current = itemsKey;
    }
  }, [initialItems, limit]);

  const handleLoadMore = useCallback(async () => {
    if (loadingRef.current || isLoading || !hasMore) return;

    loadingRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const result = await loadMore(items.length, limit);
      setItems(prev => [...prev, ...result.items]);
      setHasMore(result.hasMore);
    } catch (err: any) {
      console.error('Error loading more items:', err);
      setError(err.message || 'Failed to load more items');
    } finally {
      setIsLoading(false);
      loadingRef.current = false;
    }
  }, [items.length, limit, loadMore, hasMore, isLoading]);

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
          <div className="flex justify-end gap-2 mt-4 mb-3 shrink-0">
            <ButtonSmall
              state="Secondary"
              onClick={handleLoadMore}
              disabled={isLoading}
            >
              {isLoading ? 'Loading...' : 'Load More Items'}
            </ButtonSmall>
          </div>
        </>
      )}
    </div>
  );
}

