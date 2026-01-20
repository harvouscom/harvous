/**
 * Thread content caching layer using IndexedDB
 * Caches full thread content (notes + metadata) for instant load times on revisits
 */

import { offlineDB, ensureDatabaseOpen, type ThreadCacheEntry } from './offline-db';

// Cache duration: 5 minutes for thread content
const THREAD_CACHE_DURATION = 5 * 60 * 1000;

// Table name for thread cache
const THREAD_CACHE_TABLE = 'threadCache';

/**
 * Get cached thread content from IndexedDB
 * Returns null if cache doesn't exist or is expired
 */
export async function getCachedThreadContent(
  threadId: string,
  userId: string
): Promise<ThreadCacheEntry['data'] | null> {
  if (typeof window === 'undefined') return null;

  try {
    await ensureDatabaseOpen();

    const cache = await offlineDB.table<ThreadCacheEntry>(THREAD_CACHE_TABLE)
      .where('[threadId+userId]')
      .equals([threadId, userId])
      .first();

    if (!cache) return null;

    // Check if cache is expired
    const now = Date.now();
    if (cache.expiresAt < now) {
      // Clean up expired cache
      await offlineDB.table(THREAD_CACHE_TABLE)
        .where('[threadId+userId]')
        .equals([threadId, userId])
        .delete();
      return null;
    }

    return cache.data;
  } catch (error) {
    console.error('[getCachedThreadContent] Error reading thread cache:', error);
    return null;
  }
}

/**
 * Set thread content in IndexedDB cache
 */
export async function setCachedThreadContent(
  threadId: string,
  userId: string,
  data: ThreadCacheEntry['data']
): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    await ensureDatabaseOpen();

    const now = Date.now();
    const entry: ThreadCacheEntry = {
      threadId,
      userId,
      data,
      timestamp: now,
      expiresAt: now + THREAD_CACHE_DURATION
    };

    await offlineDB.table<ThreadCacheEntry>(THREAD_CACHE_TABLE).put(entry);
  } catch (error) {
    console.error('[setCachedThreadContent] Error setting thread cache:', error);
  }
}

/**
 * Clear thread cache for a specific thread
 * Useful when thread content is updated
 */
export async function clearThreadCache(threadId: string, userId: string): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    await ensureDatabaseOpen();

    await offlineDB.table(THREAD_CACHE_TABLE)
      .where('[threadId+userId]')
      .equals([threadId, userId])
      .delete();
  } catch (error) {
    console.error('[clearThreadCache] Error clearing thread cache:', error);
  }
}

/**
 * Clear all expired thread caches
 * Should be run periodically to clean up old cache entries
 */
export async function cleanupExpiredThreadCaches(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    await ensureDatabaseOpen();

    const now = Date.now();
    await offlineDB.table<ThreadCacheEntry>(THREAD_CACHE_TABLE)
      .where('expiresAt')
      .below(now)
      .delete();
  } catch (error) {
    console.error('[cleanupExpiredThreadCaches] Error cleaning up expired caches:', error);
  }
}

/**
 * Prefetch and cache thread content in the background
 * Called by Intersection Observer when thread cards come into view
 */
export async function prefetchThreadContent(
  threadId: string,
  userId: string
): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    // Check if already cached
    const cached = await getCachedThreadContent(threadId, userId);
    if (cached) return;

    // Fetch thread data from API
    const response = await fetch(`/api/threads/${threadId}/prefetch`, {
      credentials: 'include',
      // Use low priority for prefetch to not block user navigation
      // @ts-ignore - priority is not yet in TypeScript types
      priority: 'low'
    });

    if (!response.ok) return;

    const data = await response.json();

    // Cache the fetched data
    await setCachedThreadContent(threadId, userId, {
      thread: data.thread,
      notes: data.notes || [],
      noteTypeCounts: data.noteTypeCounts || { all: 0, default: 0, scripture: 0, resource: 0 }
    });
  } catch (error) {
    // Silently fail - prefetch is not critical
    // Debug logging only - not shown in production
  }
}

/**
 * Initialize thread cache cleanup
 * Run once on app startup to clean up old cache entries
 */
export function initThreadCacheCleanup(): void {
  if (typeof window === 'undefined') return;

  // Clean up on startup
  cleanupExpiredThreadCaches();

  // Clean up periodically (every 5 minutes)
  setInterval(() => {
    cleanupExpiredThreadCaches();
  }, 5 * 60 * 1000);
}
