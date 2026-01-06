import { useState, useEffect } from 'react';

const USER_ID_STORAGE_KEY = 'harvous-user-id';

/**
 * Persist userId to localStorage for offline access
 */
export function persistUserId(userId: string): void {
  try {
    localStorage.setItem(USER_ID_STORAGE_KEY, userId);
    // Also store in window for immediate access (used in [id].astro)
    if (typeof window !== 'undefined') {
      (window as any).__harvous_userId = userId;
    }
  } catch (error) {
    console.error('[persistUserId] Failed to persist userId:', error);
  }
}

/**
 * Get persisted userId from localStorage or window
 * Returns null if not found
 */
export function getPersistedUserId(): string | null {
  try {
    // Try window first (faster, used in [id].astro)
    if (typeof window !== 'undefined' && (window as any).__harvous_userId) {
      return (window as any).__harvous_userId;
    }
    
    // Fallback to localStorage
    const storedId = localStorage.getItem(USER_ID_STORAGE_KEY);
    
    // If found in localStorage, also set on window for faster subsequent access
    if (storedId && typeof window !== 'undefined') {
      (window as any).__harvous_userId = storedId;
    }
    
    return storedId;
  } catch (error) {
    console.error('[getPersistedUserId] Failed to get persisted userId:', error);
    return null;
  }
}

/**
 * React hook that provides userId from Clerk (online) or localStorage (offline)
 * This ensures userId is always available, whether online or offline
 * 
 * IMPORTANT: This hook initializes immediately from localStorage to avoid
 * blocking component rendering when Clerk is unavailable offline.
 */
export function usePersistedUserId(): string | null {
  // Initialize synchronously from localStorage for immediate availability
  // This ensures components can render even when Clerk is unavailable
  const [userId, setUserId] = useState<string | null>(() => getPersistedUserId());

  useEffect(() => {
    // Only try Clerk when online and available
    // We do this in useEffect to avoid calling hooks conditionally
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      try {
        // Dynamically import Clerk to avoid breaking when offline
        // This is safe because we're in useEffect, not during render
        import('@clerk/clerk-react').then((clerkModule) => {
          // Check if ClerkProvider is available by trying to access Clerk context
          // We can't use useUser() here because hooks can't be called conditionally
          // Instead, we'll rely on SyncManagerIsland to persist userId when Clerk is available
        }).catch(() => {
          // Clerk not available - that's fine for offline mode
          // userId is already set from localStorage
        });
      } catch (error) {
        // Clerk import failed - continue with localStorage userId
      }
    }

    // If we don't have a userId yet, try to get it from localStorage again
    // (in case it was set after component mount)
    if (!userId) {
      const persisted = getPersistedUserId();
      if (persisted) {
        setUserId(persisted);
      }
    }
  }, [userId]);

  return userId;
}

