/**
 * Client-side navigation data cache
 * Stores threads, spaces, and inboxCount in localStorage for fast navigation
 */

export interface NavigationCache {
  threads: any[];
  spaces: any[];
  inboxCount: number;
  timestamp: number;
}

const CACHE_KEY = 'harvous_navigation_cache';
const CACHE_DURATION = 30 * 1000; // 30 seconds

/**
 * Get cached navigation data from localStorage
 * Returns null if cache doesn't exist or is stale
 */
export function getCachedNavigationData(): NavigationCache | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    
    const data: NavigationCache = JSON.parse(cached);
    
    // Check if cache is stale
    if (isCacheStale(data.timestamp)) {
      // Remove stale cache
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Error reading navigation cache:', error);
    return null;
  }
}

/**
 * Set navigation data in localStorage cache
 */
export function setCachedNavigationData(data: Omit<NavigationCache, 'timestamp'>): void {
  if (typeof window === 'undefined') return;
  
  try {
    const cache: NavigationCache = {
      ...data,
      timestamp: Date.now()
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.error('Error setting navigation cache:', error);
  }
}

/**
 * Check if cache timestamp is stale
 */
export function isCacheStale(timestamp: number): boolean {
  const now = Date.now();
  return (now - timestamp) > CACHE_DURATION;
}

/**
 * Clear navigation cache (useful when data changes)
 */
export function clearNavigationCache(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(CACHE_KEY);
}

/**
 * Get navigation data from API endpoint
 */
export async function fetchNavigationData(): Promise<Omit<NavigationCache, 'timestamp'>> {
  try {
    const response = await fetch('/api/navigation/data', {
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch navigation data: ${response.statusText}`);
    }
    
    const data = await response.json();
    return {
      threads: data.threads || [],
      spaces: data.spaces || [],
      inboxCount: data.inboxCount || 0
    };
  } catch (error) {
    console.error('Error fetching navigation data:', error);
    throw error;
  }
}

/**
 * Get navigation data with caching strategy:
 * 1. Return cached data immediately if available and fresh
 * 2. Only fetch fresh data if cache is truly stale (not just "getting stale")
 * 3. Return fresh data if no cache exists
 */
export async function getNavigationDataWithCache(): Promise<Omit<NavigationCache, 'timestamp'>> {
  const cached = getCachedNavigationData();
  
  if (cached) {
    // Cache is fresh, use it immediately
    // Only refresh in background if cache is close to expiring (within 5 seconds of expiry)
    const { timestamp, ...data } = cached;
    const age = Date.now() - timestamp;
    const timeUntilStale = CACHE_DURATION - age;
    
    // Only refresh in background if cache is about to expire (within 5 seconds)
    // This prevents unnecessary API calls while still keeping cache fresh
    if (timeUntilStale > 0 && timeUntilStale < 5 * 1000) {
      // Refresh in background without blocking
      fetchNavigationData()
        .then(freshData => setCachedNavigationData(freshData))
        .catch(() => {
          // Silently fail - cache is still valid
        });
    }
    
    return data;
  }
  
  // No cache or stale, fetch fresh data
  const freshData = await fetchNavigationData();
  setCachedNavigationData(freshData);
  return freshData;
}

