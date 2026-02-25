/**
 * Thread Cache Loader
 * Displays cached thread content instantly while fresh data loads in background
 * Implements stale-while-revalidate pattern for optimal perceived performance
 */

import React, { useState, useEffect } from 'react';
import { getCachedThreadContent, setCachedThreadContent, clearThreadCache } from '@/utils/thread-cache';

interface ThreadCacheLoaderProps {
  threadId: string;
  userId: string;
  children: (data: {
    isLoading: boolean;
    isCached: boolean;
    thread: any;
    notes: any[];
    noteTypeCounts: {
      all: number;
      default: number;
      scripture: number;
      resource: number;
    };
  }) => React.ReactNode;
}

export default function ThreadCacheLoader({
  threadId,
  userId,
  children
}: ThreadCacheLoaderProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isCached, setIsCached] = useState(false);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadThreadContent() {
      try {
        // 1. Check cache first for instant display
        const cached = await getCachedThreadContent(threadId, userId);

        if (cached && isMounted) {
          setData(cached);
          setIsCached(true);
          setIsLoading(false);
        }

        // 2. Fetch fresh data in background (stale-while-revalidate)
        const response = await fetch(`/api/threads/${threadId}/prefetch`, {
          credentials: 'include'
        });

        if (!response.ok) {
          // If fetch fails but we have cache, keep using cache
          if (cached) return;
          throw new Error('Failed to fetch thread data');
        }

        const freshData = await response.json();

        if (!isMounted) return;

        // 3. Update cache with fresh data
        await setCachedThreadContent(threadId, userId, {
          thread: freshData.thread,
          notes: freshData.notes || [],
          noteTypeCounts: freshData.noteTypeCounts || { all: 0, default: 0, scripture: 0, resource: 0 }
        });

        // 4. Update UI with fresh data
        setData({
          thread: freshData.thread,
          notes: freshData.notes || [],
          noteTypeCounts: freshData.noteTypeCounts || { all: 0, default: 0, scripture: 0, resource: 0 }
        });
        setIsCached(false);
        setIsLoading(false);

      } catch (error) {
        console.error('[ThreadCacheLoader] Error loading thread content:', error);

        // If we have cached data, keep using it despite error
        if (data) return;

        setIsLoading(false);
      }
    }

    loadThreadContent();

    return () => {
      isMounted = false;
    };
  }, [threadId, userId]);

  // Listen for thread updates and clear cache
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleThreadUpdated = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail?.threadId === threadId) {
        clearThreadCache(threadId, userId);
      }
    };

    const handleNoteCreated = (event: Event) => {
      const customEvent = event as CustomEvent;
      const note = customEvent.detail?.note;
      // Use actualThreadId from event detail (from junction table), fallback to legacy threadId
      const actualThreadId = customEvent.detail?.actualThreadId || customEvent.detail?.threadId || note?.threadId;

      // Clear cache if note was added to this thread
      if (actualThreadId === threadId || note?.threadId === threadId) {
        clearThreadCache(threadId, userId);
      }
    };

    const handleNoteUpdated = handleNoteCreated;
    const handleNoteDeleted = handleNoteCreated;

    window.addEventListener('threadUpdated', handleThreadUpdated);
    window.addEventListener('noteCreated', handleNoteCreated);
    window.addEventListener('noteUpdated', handleNoteUpdated);
    window.addEventListener('noteDeleted', handleNoteDeleted);

    return () => {
      window.removeEventListener('threadUpdated', handleThreadUpdated);
      window.removeEventListener('noteCreated', handleNoteCreated);
      window.removeEventListener('noteUpdated', handleNoteUpdated);
      window.removeEventListener('noteDeleted', handleNoteDeleted);
    };
  }, [threadId, userId]);

  if (!data) {
    return null;
  }

  return <>{children({ isLoading, isCached, ...data })}</>;
}
