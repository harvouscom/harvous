/**
 * Client-side navigation cache management
 * Caches navigation data after page load and uses it for faster View Transitions
 */

import { setCachedNavigationData, getCachedNavigationData, fetchNavigationData, clearNavigationCache } from '@/utils/navigation-cache';

/**
 * Initialize navigation cache on page load
 * Caches the navigation data that was server-rendered
 */
export function initNavigationCache(threads: any[], spaces: any[], inboxCount: number): void {
  if (typeof window === 'undefined') return;
  
  // Cache the navigation data from server
  setCachedNavigationData({ threads, spaces, inboxCount });
  
  // Refresh cache in background if it's getting stale
  const cached = getCachedNavigationData();
  if (cached) {
    const age = Date.now() - cached.timestamp;
    // If cache is more than 20 seconds old, refresh in background
    if (age > 20 * 1000) {
      refreshNavigationCache();
    }
  }
}

/**
 * Refresh navigation cache from API
 */
export async function refreshNavigationCache(): Promise<void> {
  try {
    const data = await fetchNavigationData();
    setCachedNavigationData(data);
  } catch (error) {
    console.warn('Failed to refresh navigation cache:', error);
  }
}

/**
 * Clear cache (call this when threads/spaces are created/deleted)
 */
export function invalidateNavigationCache(): void {
  clearNavigationCache();
}

// Listen for thread/space creation/deletion events and invalidate cache
if (typeof window !== 'undefined') {
  // Listen for thread creation/deletion
  window.addEventListener('threadCreated', () => {
    invalidateNavigationCache();
    // Refresh cache in background
    refreshNavigationCache();
  });
  
  window.addEventListener('threadDeleted', () => {
    invalidateNavigationCache();
    // Refresh cache in background
    refreshNavigationCache();
  });
  
  // Listen for space creation/deletion
  window.addEventListener('spaceCreated', () => {
    invalidateNavigationCache();
    // Refresh cache in background
    refreshNavigationCache();
  });
  
  window.addEventListener('spaceDeleted', () => {
    invalidateNavigationCache();
    // Refresh cache in background
    refreshNavigationCache();
  });
}

// Expose to window for global access
if (typeof window !== 'undefined') {
  (window as any).navigationCache = {
    refresh: refreshNavigationCache,
    invalidate: invalidateNavigationCache
  };
}

