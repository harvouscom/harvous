import React, { useRef, useCallback } from 'react';

interface OptimisticItem<T> {
  timestamp: number;
  item: T;
}

/**
 * Hook for managing optimistic updates in content lists
 * Tracks items that were added optimistically but haven't been confirmed by API yet
 */
export function useOptimisticUpdates<T extends { id: string }>() {
  const optimisticItemsRef = useRef<Map<string, OptimisticItem<T>>>(new Map());
  const pendingUpdateRef = useRef<{ itemId: string; itemType?: string } | null>(null);

  /**
   * Add an item optimistically
   */
  const addOptimistic = useCallback((itemId: string, item: T) => {
    optimisticItemsRef.current.set(itemId, {
      timestamp: Date.now(),
      item
    });
  }, []);

  /**
   * Remove an item from optimistic tracking
   */
  const removeOptimistic = useCallback((itemId: string) => {
    optimisticItemsRef.current.delete(itemId);
  }, []);

  /**
   * Get optimistic items that should be merged with API data
   * Only includes items that:
   * 1. Haven't been confirmed by API yet (not in confirmedIds)
   * 2. Were added recently (within the specified time window)
   * 3. Pass the optional filter function
   */
  const getOptimisticItemsToMerge = useCallback((
    confirmedIds: Set<string>,
    maxAgeMs: number = 5000,
    filter?: (item: T) => boolean
  ): T[] => {
    const now = Date.now();
    const cutoffTime = now - maxAgeMs;
    const itemsToMerge: T[] = [];

    optimisticItemsRef.current.forEach(({ timestamp, item }, itemId) => {
      const isRecent = timestamp > cutoffTime;
      const isNotConfirmed = !confirmedIds.has(itemId);
      const passesFilter = filter ? filter(item) : true;

      if (isRecent && isNotConfirmed && passesFilter) {
        itemsToMerge.push(item);
      } else if (confirmedIds.has(itemId)) {
        // Item confirmed by API, remove from optimistic tracking
        optimisticItemsRef.current.delete(itemId);
      }
    });

    return itemsToMerge;
  }, []);

  /**
   * Clear all optimistic items
   */
  const clearAll = useCallback(() => {
    optimisticItemsRef.current.clear();
  }, []);

  /**
   * Get all optimistic items
   */
  const getAll = useCallback((): T[] => {
    return Array.from(optimisticItemsRef.current.values()).map(({ item }) => item);
  }, []);

  /**
   * Check if an item is tracked optimistically
   */
  const hasOptimistic = useCallback((itemId: string): boolean => {
    return optimisticItemsRef.current.has(itemId);
  }, []);

  /**
   * Set pending update (for when list is empty)
   */
  const setPendingUpdate = useCallback((itemId: string, itemType?: string) => {
    pendingUpdateRef.current = { itemId, itemType };
  }, []);

  /**
   * Get and clear pending update
   */
  const getPendingUpdate = useCallback((): { itemId: string; itemType?: string } | null => {
    const pending = pendingUpdateRef.current;
    pendingUpdateRef.current = null;
    return pending;
  }, []);

  return {
    addOptimistic,
    removeOptimistic,
    getOptimisticItemsToMerge,
    clearAll,
    getAll,
    hasOptimistic,
    setPendingUpdate,
    getPendingUpdate,
    // Expose ref for direct access if needed
    optimisticItemsRef
  };
}

