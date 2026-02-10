/**
 * Pre-caching utility for offline reading
 * Pre-caches user's recent notes, threads, and spaces for offline access
 *
 * Features:
 * - Delayed start to ensure server is ready
 * - Retry logic with exponential backoff
 * - Non-blocking and fail-graceful
 */

import { idToUrl } from './url-helpers';

import { safeFetch, isAuthReady } from './safe-fetch';
import { getPersistedUserId } from './user-id';
import { updateCacheTimestamp } from './sync-manager';

/** Delay in ms before starting pre-cache (allows server to be ready) */
const PRECACHE_START_DELAY = 3000;

/**
 * Cache a single URL in the service worker cache with retry logic
 */
async function cacheUrl(url: string, cacheName: string = 'harvous-cache-v6'): Promise<boolean> {
  try {
    if (!('caches' in window)) return false;
    
    const cache = await caches.open(cacheName);
    
    // Use safeFetch with retry logic
    // IMPORTANT: Set isPrefetch: true to prevent lastVisited updates
    const response = await safeFetch(url, {
      retries: 2,
      retryDelay: 500,
      timeout: 8000,
      checkAuth: true,
      isPrefetch: true  // Signal this is a background prefetch request
    });
    
    if (response && response.ok) {
      await cache.put(url, response.clone());
      return true;
    }
    return false;
  } catch (error) {
    // Fail silently - pre-caching is non-critical
    return false;
  }
}

/**
 * Cache multiple URLs in parallel with rate limiting
 */
async function cacheUrls(urls: string[], cacheName: string = 'harvous-cache-v6', batchSize: number = 5): Promise<number> {
  let cached = 0;
  
  // Process in batches to avoid overwhelming the network
  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(url => cacheUrl(url, cacheName))
    );
    
    cached += results.filter(r => r.status === 'fulfilled' && r.value === true).length;
    
    // Small delay between batches to avoid blocking
    if (i + batchSize < urls.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return cached;
}

/**
 * Pre-cache individual note pages
 */
async function precacheNotePages(noteIds: string[]): Promise<number> {
  const urls = noteIds.map(id => idToUrl(id));
  return cacheUrls(urls);
}

/**
 * Pre-cache individual thread pages
 */
async function precacheThreadPages(threadIds: string[]): Promise<number> {
  const urls = threadIds.map(id => idToUrl(id));
  return cacheUrls(urls);
}

/**
 * Pre-cache individual space pages
 */
async function precacheSpacePages(spaceIds: string[]): Promise<number> {
  const urls = spaceIds.map(id => idToUrl(id));
  return cacheUrls(urls);
}

/**
 * Main pre-caching function
 * Fetches and caches user's recent content for offline access
 * 
 * This function is designed to be non-blocking and fail-graceful.
 * It will not throw errors or block page load.
 */
export async function precacheRecentContent(): Promise<void> {
  // Wait for server to be ready before starting
  await new Promise(resolve => setTimeout(resolve, PRECACHE_START_DELAY));
  
  // Check if auth is ready
  if (!isAuthReady()) {
    // Auth not ready, skip silently
    return;
  }

  // Check if service worker and caches are available
  if (!('serviceWorker' in navigator) || !('caches' in window)) {
    return;
  }

  try {
    // Fetch navigation data with retry logic (contains threads and spaces)
    const navResponse = await safeFetch('/api/navigation/data', {
      retries: 2,
      retryDelay: 1000,
      timeout: 10000
    });

    let threadIds: string[] = [];
    let spaceIds: string[] = [];
    let noteIds: string[] = [];

    if (navResponse && navResponse.ok) {
      const navData: { 
        threads?: Array<{ id: string }>; 
        spaces?: Array<{ id: string }>;
        notes?: Array<{ id: string }>;
      } = await navResponse.json();
      threadIds = (navData.threads || []).map((thread) => thread.id);
      spaceIds = (navData.spaces || []).map((space) => space.id);
    }

    // Fetch all notes - use a large limit or fetch from spaces/items endpoint
    // Try to get notes from spaces/items which returns all notes
    const notesResponse = await safeFetch('/api/spaces/items', {
      retries: 2,
      retryDelay: 1000,
      timeout: 15000
    });

    if (notesResponse && notesResponse.ok) {
      const notesData: { notes?: Array<{ id: string }> } = await notesResponse.json();
      noteIds = (notesData.notes || []).map((note) => note.id);
    } else {
      // Fallback: try recent notes with very large limit
      const recentNotesResponse = await safeFetch('/api/notes/recent?limit=10000', {
        retries: 2,
        retryDelay: 1000,
        timeout: 15000
      });
      if (recentNotesResponse && recentNotesResponse.ok) {
        const recentNotes: Array<{ id: string }> = await recentNotesResponse.json();
        noteIds = recentNotes.map((note) => note.id);
      }
    }

    // Cache API responses first (for offline API access)
    const apiUrls = [
      '/api/navigation/data',
      '/api/spaces/items'
    ];
    
    // Only add notes/recent if we used it as fallback
    if (noteIds.length > 0 && (!notesResponse || !notesResponse.ok)) {
      apiUrls.push('/api/notes/recent?limit=10000');
    }
    
    await cacheUrls(apiUrls);

    // Cache all individual pages without limits
    // Use batch processing to avoid overwhelming the network
    // Process in background - don't await to avoid blocking
    Promise.allSettled([
      precacheNotePages(noteIds),
      precacheThreadPages(threadIds),
      precacheSpacePages(spaceIds)
    ]).then(() => {
      // Update cache timestamp after caching completes
      const userId = getPersistedUserId();
      if (userId) {
        updateCacheTimestamp(userId).catch(() => {
          // Silently fail - cache timestamp update is non-critical
        });
      }
    }).catch((error) => {
      // Log quota errors for debugging, but don't throw
      if (error?.name === 'QuotaExceededError' || error?.message?.includes('quota')) {
        console.warn('[precacheRecentContent] Cache quota exceeded, some content may not be cached');
      }
      // Silently ignore other errors - pre-caching is non-critical
    });
    
  } catch (error) {
    // Pre-caching failed - this is non-critical, fail silently
    // Don't log to avoid console spam unless it's a quota error
    if (error && typeof error === 'object' && 'name' in error && error.name === 'QuotaExceededError') {
      console.warn('[precacheRecentContent] Cache quota exceeded');
    }
  }
}

// Export individual functions for testing or custom usage
export {
  precacheNotePages,
  precacheThreadPages,
  precacheSpacePages,
  cacheUrl,
  cacheUrls
};

// Re-export isAuthReady from safe-fetch for backwards compatibility
export { isAuthReady };
