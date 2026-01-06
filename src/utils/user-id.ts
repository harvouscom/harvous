import { useState, useEffect } from 'react';
import { offlineDB, retryIndexedDBOperation } from './offline-db';

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
 * Try to extract userId from IndexedDB as a fallback
 * This checks userMetadata first (most reliable), then falls back to notes, spaces, or threads
 * Returns null if not found or if IndexedDB is not available
 */
async function tryGetUserIdFromIndexedDB(): Promise<{ userId: string | null; isEmpty: boolean }> {
  console.log('[tryGetUserIdFromIndexedDB] 🔍 Starting IndexedDB userId lookup...');
  
  try {
    // Check if IndexedDB is available
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      console.log('[tryGetUserIdFromIndexedDB] ❌ IndexedDB not available in this environment');
      return { userId: null, isEmpty: true };
    }

    // Check if IndexedDB has any data at all
    let hasAnyData = false;
    const tableCounts: Record<string, number> = {};

    // Check userMetadata count
    try {
      const userMetaCount = await retryIndexedDBOperation(async () => {
        return await offlineDB.userMetadata.count();
      });
      tableCounts.userMetadata = userMetaCount;
      if (userMetaCount > 0) hasAnyData = true;
    } catch (error: any) {
      console.log('[tryGetUserIdFromIndexedDB] Could not count userMetadata:', error?.message || error);
    }

    // Check notes count
    try {
      const notesCount = await retryIndexedDBOperation(async () => {
        return await offlineDB.notes.count();
      });
      tableCounts.notes = notesCount;
      if (notesCount > 0) hasAnyData = true;
    } catch (error: any) {
      console.log('[tryGetUserIdFromIndexedDB] Could not count notes:', error?.message || error);
    }

    // Check spaces count
    try {
      const spacesCount = await retryIndexedDBOperation(async () => {
        return await offlineDB.spaces.count();
      });
      tableCounts.spaces = spacesCount;
      if (spacesCount > 0) hasAnyData = true;
    } catch (error: any) {
      console.log('[tryGetUserIdFromIndexedDB] Could not count spaces:', error?.message || error);
    }

    // Check threads count
    try {
      const threadsCount = await retryIndexedDBOperation(async () => {
        return await offlineDB.threads.count();
      });
      tableCounts.threads = threadsCount;
      if (threadsCount > 0) hasAnyData = true;
    } catch (error: any) {
      console.log('[tryGetUserIdFromIndexedDB] Could not count threads:', error?.message || error);
    }

    console.log('[tryGetUserIdFromIndexedDB] IndexedDB table counts:', tableCounts);
    console.log('[tryGetUserIdFromIndexedDB] IndexedDB has data:', hasAnyData);

    // If IndexedDB is completely empty, return early
    if (!hasAnyData) {
      console.log('[tryGetUserIdFromIndexedDB] ❌ IndexedDB is empty - user needs to sign in online first to bootstrap data');
      return { userId: null, isEmpty: true };
    }

    // Try userMetadata first (most reliable - one record per user)
    try {
      const userMeta = await retryIndexedDBOperation(async () => {
        return await offlineDB.userMetadata.toCollection().first();
      });
      if (userMeta?.userId) {
        console.log('[tryGetUserIdFromIndexedDB] ✅ Found userId from userMetadata:', userMeta.userId);
        return { userId: userMeta.userId, isEmpty: false };
      } else {
        console.log('[tryGetUserIdFromIndexedDB] userMetadata exists but no userId field');
      }
    } catch (error: any) {
      // userMetadata query failed, try other tables
      console.log('[tryGetUserIdFromIndexedDB] userMetadata query failed, trying other tables:', {
        error: error?.message || error,
        name: error?.name
      });
    }

    // Fallback to notes table
    try {
      const note = await retryIndexedDBOperation(async () => {
        return await offlineDB.notes.toCollection().first();
      });
      if (note?.userId) {
        console.log('[tryGetUserIdFromIndexedDB] ✅ Found userId from notes:', note.userId);
        return { userId: note.userId, isEmpty: false };
      } else {
        console.log('[tryGetUserIdFromIndexedDB] notes exist but no userId field');
      }
    } catch (error: any) {
      console.log('[tryGetUserIdFromIndexedDB] notes query failed, trying other tables:', {
        error: error?.message || error,
        name: error?.name
      });
    }

    // Fallback to spaces table
    try {
      const space = await retryIndexedDBOperation(async () => {
        return await offlineDB.spaces.toCollection().first();
      });
      if (space?.userId) {
        console.log('[tryGetUserIdFromIndexedDB] ✅ Found userId from spaces:', space.userId);
        return { userId: space.userId, isEmpty: false };
      } else {
        console.log('[tryGetUserIdFromIndexedDB] spaces exist but no userId field');
      }
    } catch (error: any) {
      console.log('[tryGetUserIdFromIndexedDB] spaces query failed, trying threads:', {
        error: error?.message || error,
        name: error?.name
      });
    }

    // Fallback to threads table
    try {
      const thread = await retryIndexedDBOperation(async () => {
        return await offlineDB.threads.toCollection().first();
      });
      if (thread?.userId) {
        console.log('[tryGetUserIdFromIndexedDB] ✅ Found userId from threads:', thread.userId);
        return { userId: thread.userId, isEmpty: false };
      } else {
        console.log('[tryGetUserIdFromIndexedDB] threads exist but no userId field');
      }
    } catch (error: any) {
      console.log('[tryGetUserIdFromIndexedDB] threads query failed:', {
        error: error?.message || error,
        name: error?.name
      });
    }

    console.log('[tryGetUserIdFromIndexedDB] ❌ No userId found in any IndexedDB table (IndexedDB has data but no userId)');
    return { userId: null, isEmpty: false };
  } catch (error: any) {
    // IndexedDB not available or error accessing - that's fine, this is just a fallback
    console.warn('[tryGetUserIdFromIndexedDB] IndexedDB check failed:', {
      error: error?.message || error,
      name: error?.name,
      stack: error?.stack
    });
    return { userId: null, isEmpty: true };
  }
}

/**
 * Try to extract userId from Clerk's session storage as a last resort
 * This is a fallback when localStorage doesn't have the userId
 * Returns null if not found or if Clerk is not available
 */
function tryGetUserIdFromClerkSession(): string | null {
  try {
    if (typeof window === 'undefined') return null;
    
    // Check if Clerk session exists (indicates user might be authenticated)
    const hasClerkSession = document.cookie.includes('__clerk');
    if (!hasClerkSession) return null;
    
    // Try to access Clerk's cached user data from localStorage
    // Clerk stores session data in localStorage with keys like '__clerk_client_*'
    // We can't directly access Clerk's internal storage, but we can check if session exists
    // The actual userId extraction would require Clerk's SDK which we can't use here
    
    // Check if there's any Clerk-related data that might contain userId
    // This is a best-effort attempt - the primary mechanism should be our own localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('__clerk')) {
        try {
          const value = localStorage.getItem(key);
          if (value) {
            // Try to parse and extract userId if it's JSON
            try {
              const parsed = JSON.parse(value);
              // Clerk's session data structure varies, but we can try common patterns
              if (parsed?.userId) return parsed.userId;
              if (parsed?.user?.id) return parsed.user.id;
              if (parsed?.id && typeof parsed.id === 'string' && parsed.id.startsWith('user_')) {
                return parsed.id;
              }
            } catch {
              // Not JSON, continue
            }
          }
        } catch {
          // Error reading this key, continue
        }
      }
    }
    
    return null;
  } catch (error) {
    // Clerk check failed - that's fine, this is just a fallback
    return null;
  }
}

/**
 * Get persisted userId from localStorage or window (synchronous)
 * Returns null if not found
 * 
 * Fallback order:
 * 1. window.__harvous_userId (fastest)
 * 2. localStorage['harvous-user-id'] (primary storage)
 * 3. Clerk session storage (last resort, if available)
 * 
 * Note: This does NOT check IndexedDB (async operation). Use getPersistedUserIdWithIndexedDB()
 * for a complete check that includes IndexedDB.
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
      return storedId;
    }
    
    // Last resort: try to extract from Clerk's session storage
    // This is only used when our primary storage mechanisms fail
    const clerkUserId = tryGetUserIdFromClerkSession();
    if (clerkUserId && typeof window !== 'undefined') {
      // If we found it from Clerk, persist it to our storage for future use
      try {
        persistUserId(clerkUserId);
        return clerkUserId;
      } catch (error) {
        // Failed to persist, but return the userId anyway
        console.warn('[getPersistedUserId] Found userId from Clerk but failed to persist:', error);
        return clerkUserId;
      }
    }
    
    return null;
  } catch (error) {
    console.error('[getPersistedUserId] Failed to get persisted userId:', error);
    return null;
  }
}

/**
 * Result of userId lookup with IndexedDB fallback
 */
export interface UserIdLookupResult {
  userId: string | null;
  indexedDBIsEmpty: boolean;
}

/**
 * Get persisted userId with IndexedDB fallback (async)
 * This is the complete check that includes all fallback mechanisms
 * 
 * Fallback order:
 * 1. window.__harvous_userId (fastest)
 * 2. localStorage['harvous-user-id'] (primary storage)
 * 3. Clerk session storage
 * 4. IndexedDB (userMetadata, notes, spaces, threads)
 * 
 * If found in IndexedDB, it will be persisted to localStorage for future use.
 */
export async function getPersistedUserIdWithIndexedDB(): Promise<UserIdLookupResult> {
  try {
    // First try synchronous methods
    const syncUserId = getPersistedUserId();
    if (syncUserId) {
      console.log('[getPersistedUserIdWithIndexedDB] Found userId from sync sources:', syncUserId);
      return { userId: syncUserId, indexedDBIsEmpty: false }; // Can't determine if IndexedDB is empty without checking
    }
    
    console.log('[getPersistedUserIdWithIndexedDB] No userId in sync sources, checking IndexedDB...');
    
    // Last resort: try IndexedDB (async)
    const indexedDBResult = await tryGetUserIdFromIndexedDB();
    if (indexedDBResult.userId && typeof window !== 'undefined') {
      // If we found it from IndexedDB, persist it to localStorage for future use
      try {
        persistUserId(indexedDBResult.userId);
        console.log('[getPersistedUserIdWithIndexedDB] ✅ Found userId from IndexedDB and persisted to localStorage:', indexedDBResult.userId);
        return { userId: indexedDBResult.userId, indexedDBIsEmpty: false };
      } catch (error: any) {
        // Failed to persist, but return the userId anyway
        console.warn('[getPersistedUserIdWithIndexedDB] Found userId from IndexedDB but failed to persist:', {
          error: error?.message || error,
          userId: indexedDBResult.userId
        });
        return { userId: indexedDBResult.userId, indexedDBIsEmpty: false };
      }
    }
    
    // Return null with information about whether IndexedDB is empty
    if (indexedDBResult.isEmpty) {
      console.log('[getPersistedUserIdWithIndexedDB] ❌ No userId found - IndexedDB is empty (user needs to sign in online first)');
    } else {
      console.log('[getPersistedUserIdWithIndexedDB] ❌ No userId found - IndexedDB has data but no userId field');
    }
    return { userId: null, indexedDBIsEmpty: indexedDBResult.isEmpty };
  } catch (error: any) {
    console.error('[getPersistedUserIdWithIndexedDB] Failed to get persisted userId:', {
      error: error?.message || error,
      name: error?.name,
      stack: error?.stack
    });
    return { userId: null, indexedDBIsEmpty: true }; // Assume empty on error
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

