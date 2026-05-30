import type { QueryClient } from '@tanstack/react-query';
import { clearCachedProfileData } from '@/utils/profile-cache';
import {
  HARVOUS_FEATURED_DISMISSED_CACHE_KEY,
  HARVOUS_NAV_CACHE_KEY,
  HARVOUS_PROFILE_CACHE_KEY,
  HARVOUS_SPACE_NOTES_CACHE_PREFIX,
  HARVOUS_USER_COLOR_KEY,
  HARVOUS_XP_CACHE_KEY,
} from '@/utils/user-cache-keys';

/**
 * Clears sessionStorage/localStorage used to bootstrap profile, nav, XP, and color.
 * Also clears legacy profile cache keys. Call before Clerk signOut and from signed-out cleanup.
 */
export function clearUserClientStorageCaches() {
  if (typeof window === 'undefined') return;
  clearCachedProfileData();
  try {
    sessionStorage.removeItem('userProfileData');
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.removeItem(HARVOUS_PROFILE_CACHE_KEY);
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.removeItem(HARVOUS_NAV_CACHE_KEY);
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.removeItem(HARVOUS_XP_CACHE_KEY);
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.removeItem(HARVOUS_FEATURED_DISMISSED_CACHE_KEY);
  } catch {
    /* ignore */
  }
  // Per-space sidebar notes snapshots (keyed by space id) — remove all by prefix.
  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(HARVOUS_SPACE_NOTES_CACHE_PREFIX)) keys.push(key);
    }
    keys.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(HARVOUS_USER_COLOR_KEY);
  } catch {
    /* ignore */
  }
}

/** Removes React Query entries that are scoped to the signed-in user (call when session ends). */
export function removeUserScopedReactQueryCaches(queryClient: QueryClient) {
  queryClient.removeQueries({ queryKey: ['profile'] });
  queryClient.removeQueries({ queryKey: ['navigation'] });
  queryClient.removeQueries({ queryKey: ['xp'] });
  queryClient.removeQueries({ queryKey: ['dashboard'] });
  queryClient.removeQueries({ queryKey: ['limits'] });
  queryClient.removeQueries({ queryKey: ['harvous-admin-check'] });
  queryClient.removeQueries({ queryKey: ['votd-preview'] });
  queryClient.removeQueries({ queryKey: ['featured-items'] });
  queryClient.removeQueries({ queryKey: ['featured', 'dismissed'] });
}

export function clearUserClientCaches(queryClient: QueryClient) {
  clearUserClientStorageCaches();
  removeUserScopedReactQueryCaches(queryClient);
}
