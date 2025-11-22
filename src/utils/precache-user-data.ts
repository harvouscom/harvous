/**
 * Pre-caching utility for offline reading
 * Pre-caches user's recent notes, threads, and spaces for offline access
 */

/**
 * Check if Clerk authentication is ready
 * Returns true if auth cookies/tokens are present
 */
function isAuthReady(): boolean {
  if (typeof window === 'undefined') return false;
  
  // Check for Clerk session cookie or token
  const cookies = document.cookie.split(';');
  const hasClerkCookie = cookies.some(cookie => 
    cookie.trim().startsWith('__clerk') || 
    cookie.trim().startsWith('__session')
  );
  
  // Also check if we're on a protected route (not sign-in/sign-up)
  const isProtectedRoute = !window.location.pathname.includes('/sign-in') && 
                          !window.location.pathname.includes('/sign-up');
  
  return hasClerkCookie || isProtectedRoute;
}

/**
 * Cache a single URL in the service worker cache
 */
async function cacheUrl(url: string, cacheName: string = 'harvous-cache-v5'): Promise<boolean> {
  try {
    if (!('caches' in window)) return false;
    
    const cache = await caches.open(cacheName);
    const response = await fetch(url, {
      credentials: 'include', // Include auth cookies
      headers: {
        'Accept': 'text/html,application/json',
      }
    });
    
    if (response.ok) {
      await cache.put(url, response.clone());
      return true;
    }
    return false;
  } catch (error) {
    console.warn(`Failed to cache ${url}:`, error);
    return false;
  }
}

/**
 * Cache multiple URLs in parallel with rate limiting
 */
async function cacheUrls(urls: string[], cacheName: string = 'harvous-cache-v5', batchSize: number = 5): Promise<number> {
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
  const urls = noteIds.map(id => `/${id}`);
  return cacheUrls(urls);
}

/**
 * Pre-cache individual thread pages
 */
async function precacheThreadPages(threadIds: string[]): Promise<number> {
  const urls = threadIds.map(id => `/${id}`);
  return cacheUrls(urls);
}

/**
 * Pre-cache individual space pages
 */
async function precacheSpacePages(spaceIds: string[]): Promise<number> {
  const urls = spaceIds.map(id => `/${id}`);
  return cacheUrls(urls);
}

/**
 * Main pre-caching function
 * Fetches and caches user's recent content for offline access
 */
export async function precacheRecentContent(): Promise<void> {
  // Check if auth is ready
  if (!isAuthReady()) {
    console.log('Pre-caching: Auth not ready, skipping');
    return;
  }

  // Check if service worker and caches are available
  if (!('serviceWorker' in navigator) || !('caches' in window)) {
    console.log('Pre-caching: Service Worker or Cache API not available');
    return;
  }

  try {
    console.log('Pre-caching: Starting to pre-cache user content...');

    // Fetch recent notes (50 items)
    const notesResponse = await fetch('/api/notes/recent?limit=50', {
      credentials: 'include',
      headers: {
        'Accept': 'application/json',
      }
    });

    if (!notesResponse.ok) {
      console.warn('Pre-caching: Failed to fetch recent notes');
      return;
    }

    const notes = await notesResponse.json();
    const noteIds = notes.map((note: any) => note.id);
    console.log(`Pre-caching: Found ${noteIds.length} recent notes`);

    // Fetch navigation data (threads and spaces)
    const navResponse = await fetch('/api/navigation/data', {
      credentials: 'include',
      headers: {
        'Accept': 'application/json',
      }
    });

    let threadIds: string[] = [];
    let spaceIds: string[] = [];

    if (navResponse.ok) {
      const navData = await navResponse.json();
      threadIds = (navData.threads || []).map((thread: any) => thread.id);
      spaceIds = (navData.spaces || []).map((space: any) => space.id);
      console.log(`Pre-caching: Found ${threadIds.length} threads and ${spaceIds.length} spaces`);
    } else {
      console.warn('Pre-caching: Failed to fetch navigation data');
    }

    // Cache API responses first (for offline API access)
    const apiUrls = [
      '/api/notes/recent?limit=50',
      '/api/navigation/data'
    ];
    
    await cacheUrls(apiUrls);
    console.log('Pre-caching: Cached API responses');

    // Cache individual pages (limit to 50 total to avoid overwhelming)
    const totalItems = noteIds.length + threadIds.length + spaceIds.length;
    const maxItems = 50;
    
    // Prioritize notes, then threads, then spaces
    const notesToCache = noteIds.slice(0, Math.min(noteIds.length, maxItems));
    const remainingSlots = maxItems - notesToCache.length;
    const threadsToCache = threadIds.slice(0, Math.min(threadIds.length, Math.floor(remainingSlots * 0.6)));
    const spacesToCache = spaceIds.slice(0, Math.min(spaceIds.length, remainingSlots - threadsToCache.length));

    const notePagesCached = await precacheNotePages(notesToCache);
    const threadPagesCached = await precacheThreadPages(threadsToCache);
    const spacePagesCached = await precacheSpacePages(spacesToCache);

    console.log(`Pre-caching: Complete - Cached ${notePagesCached} note pages, ${threadPagesCached} thread pages, ${spacePagesCached} space pages`);
  } catch (error) {
    console.error('Pre-caching: Error during pre-caching', error);
  }
}

// Export individual functions for testing or custom usage
export {
  precacheNotePages,
  precacheThreadPages,
  precacheSpacePages,
  cacheUrl,
  cacheUrls,
  isAuthReady
};

