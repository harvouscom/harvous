/**
 * Prefetch utilities for faster navigation
 * Prefetches dashboard data when on thread/note/space pages
 */

import { fetchNavigationData, setCachedNavigationData } from './navigation-cache';

/**
 * Prefetch dashboard navigation data
 * Called when on thread/note/space pages to prepare for dashboard navigation
 */
export function prefetchDashboardData(): void {
  if (typeof window === 'undefined') return;
  
  // Use requestIdleCallback if available, otherwise use setTimeout
  const schedulePrefetch = (callback: () => void) => {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(callback, { timeout: 2000 });
    } else {
      setTimeout(callback, 1000);
    }
  };
  
  schedulePrefetch(async () => {
    try {
      const data = await fetchNavigationData();
      setCachedNavigationData(data);
      console.log('[Prefetch] Dashboard data prefetched and cached');
    } catch (error) {
      console.warn('[Prefetch] Failed to prefetch dashboard data:', error);
    }
  });
}

/**
 * Prefetch data for a specific page path
 */
export function prefetchPageData(path: string): void {
  if (typeof window === 'undefined') return;
  
  // Only prefetch if it's a dashboard path
  if (path === '/' || path === '/dashboard') {
    prefetchDashboardData();
    return;
  }
  
  // For other paths, we could prefetch their data here
  // For now, we only prefetch dashboard data
}

/**
 * Initialize prefetching on page load
 * Prefetches dashboard data if we're on a thread/note/space page
 */
export function initPrefetching(currentPath: string): void {
  if (typeof window === 'undefined') return;
  
  // If we're on a thread, note, or space page, prefetch dashboard
  const isThreadPage = currentPath.startsWith('/thread_');
  const isNotePage = currentPath.startsWith('/note_');
  const isSpacePage = currentPath.startsWith('/space_');
  
  if (isThreadPage || isNotePage || isSpacePage) {
    prefetchDashboardData();
  }
}

