/**
 * Profile Cache Utility
 * 
 * Manages profile data caching in sessionStorage to avoid unnecessary API calls.
 * Cache persists until a change occurs (updated on successful saves) or logout.
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
        userColor: updates.userColor || 'paper',
        email: updates.email || '',
        emailVerified: updates.emailVerified || false,
        churchName: updates.churchName ?? null,
        churchCity: updates.churchCity ?? null,
        churchState: updates.churchState ?? null,
      };
      setCachedProfileData(newData);
    }
  } catch (error) {
    console.error('Error updating profile cache:', error);
  }
}

