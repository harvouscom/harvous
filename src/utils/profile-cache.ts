import { HARVOUS_PROFILE_CACHE_KEY } from '@/utils/user-cache-keys';

/**
 * Client-Side Profile Cache (profile-cache.ts)
 * 
 * PURPOSE: Caches profile data in browser sessionStorage to avoid 
 * redundant API calls during a single browser session.
 * 
 * SCOPE: Client-side only - runs in the browser
 * STORAGE: sessionStorage (cleared on tab/browser close or logout)
 * TTL: Session-based - persists until logout or manual clear
 * 
 * USE CASES:
 * - Caching profile data after initial fetch to avoid API calls
 * - Optimistic updates when user saves profile changes
 * - Fast access to profile data in React components
 * 
 * DIFFERENCE FROM user-cache.ts:
 * - profile-cache.ts = CLIENT-SIDE sessionStorage cache (browser)
 * - user-cache.ts = SERVER-SIDE database cache (UserMetadata table)
 * 
 * The two work together: server fetches from user-cache, client caches
 * the result in profile-cache to avoid redundant API calls during session.
 */

export interface CachedProfileData {
  firstName: string;
  lastName: string;
  userColor: string;
  email: string;
  emailVerified: boolean;
  churchName: string | null;
  churchCity: string | null;
  churchState: string | null;
  /** True if user has set account-level lock PIN (from get-profile). */
  hasLockPinSet?: boolean;
  /** User's preferred Bible translation (e.g., 'ESV', 'NIV', 'KJV'). Defaults to 'NET'. */
  defaultTranslation?: string;
}

const CACHE_KEY = 'profileData';

/**
 * Get cached profile data from sessionStorage
 * @returns Cached profile data or null if not cached
 */
export function getCachedProfileData(): CachedProfileData | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (!cached) {
      return null;
    }

    const data = JSON.parse(cached) as CachedProfileData;
    return data;
  } catch (error) {
    console.error('Error reading profile cache:', error);
    return null;
  }
}

/**
 * Cache profile data in sessionStorage
 * @param data Profile data to cache (replaces existing cache)
 */
export function setCachedProfileData(data: CachedProfileData): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Error writing profile cache:', error);
  }
}

/**
 * Clear cached profile data (used on logout)
 */
export function clearCachedProfileData(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch (error) {
    console.error('Error clearing profile cache:', error);
  }
}

/**
 * Update specific fields in the cache without replacing the entire cache
 * Useful for partial updates (e.g., only church data or only email)
 * 
 * IMPORTANT: For church fields, only updates if explicitly provided in updates.
 * If church fields are not in updates, preserves existing values.
 * This prevents accidentally overwriting church data with null.
 */
function readClerkUserIdForDefaultTranslation(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const w = (window as unknown as { __harvous_userId?: string }).__harvous_userId;
    if (typeof w === 'string' && w.length > 0) return w;
    const a = localStorage.getItem('harvous-user-id');
    if (a) return a;
    const b = localStorage.getItem('harvous_userId');
    if (b) return b;
  } catch {
    /* ignore */
  }
  return undefined;
}

/**
 * Resolves the user's default Bible translation from any warm client cache (sessionStorage).
 * Falls back to NET when caches are cold (e.g. first paint after hard refresh).
 */
export function getEffectiveDefaultTranslation(): string {
  const fromProfileData = getCachedProfileData()?.defaultTranslation;
  if (fromProfileData) return fromProfileData;

  if (typeof window === 'undefined') return 'NET';
  try {
    const userId = readClerkUserIdForDefaultTranslation();
    if (!userId) return 'NET';
    const raw = sessionStorage.getItem(HARVOUS_PROFILE_CACHE_KEY);
    if (!raw) return 'NET';
    const p = JSON.parse(raw) as { id?: string; defaultTranslation?: string };
    if (p.id === userId && p.defaultTranslation) return p.defaultTranslation;
  } catch {
    /* ignore */
  }
  return 'NET';
}

export function updateCachedProfileData(updates: Partial<CachedProfileData>): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const existing = getCachedProfileData();
    if (existing) {
      // Merge updates, but preserve existing church data if not explicitly updated
      const updated: CachedProfileData = {
        ...existing,
        ...updates,
        // Only update church fields if they're explicitly provided in updates
        // This prevents overwriting existing church data with null when updating other fields
        churchName: updates.hasOwnProperty('churchName') ? (updates.churchName ?? null) : existing.churchName,
        churchCity: updates.hasOwnProperty('churchCity') ? (updates.churchCity ?? null) : existing.churchCity,
        churchState: updates.hasOwnProperty('churchState') ? (updates.churchState ?? null) : existing.churchState,
      };
      setCachedProfileData(updated);
    } else {
      // If no cache exists, create new cache with the updates
      // Fill in defaults for required fields
      const newData: CachedProfileData = {
        firstName: updates.firstName || '',
        lastName: updates.lastName || '',
        userColor: updates.userColor || 'blue',
        email: updates.email || '',
        emailVerified: updates.emailVerified || false,
        churchName: updates.churchName ?? null,
        churchCity: updates.churchCity ?? null,
        churchState: updates.churchState ?? null,
        defaultTranslation: updates.defaultTranslation ?? 'NET',
        hasLockPinSet: updates.hasLockPinSet,
      };
      setCachedProfileData(newData);
    }
  } catch (error) {
    console.error('Error updating profile cache:', error);
  }
}

