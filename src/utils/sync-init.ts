import React from 'react';
import { useUser } from '@clerk/clerk-react';
import { bootstrapSync, syncNow, needsBootstrap, startBackgroundSync } from './sync-manager';
import { isOfflineModeEnabled } from './offline-mode';

/**
 * Initialize sync on app load
 * Should be called once when the app starts (after user is authenticated)
 * Only initializes if offline mode feature flag is enabled
 * Returns a cleanup function to stop the background sync loop
 */
export async function initializeSync(userId: string): Promise<(() => void) | undefined> {
  // Check if offline mode is enabled via feature flag
  if (!isOfflineModeEnabled()) {
    return;
  }

  try {
    // Check if bootstrap is needed
    const needsBoot = await needsBootstrap(userId);

    if (needsBoot) {
      if (navigator.onLine) {
        const bootstrapResult = await bootstrapSync(userId);

        if (!bootstrapResult.success && bootstrapResult.error !== 'AUTH_NOT_READY') {
          console.error('[initializeSync] Bootstrap failed:', bootstrapResult.error);
        }
      }
    } else {
      // Incremental sync if online
      if (navigator.onLine) {
        await syncNow(userId);
      }
    }

    // Start background sync loop and return cleanup function
    const cleanup = startBackgroundSync(userId, 300000); // Sync every 5 minutes (immediate sync triggers on mutations and tab visibility)
    return cleanup;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Silently ignore AUTH_NOT_READY errors (auth still loading)
    if (errorMessage === 'AUTH_NOT_READY') {
      return;
    }

    console.error('[initializeSync] Error:', errorMessage);
    throw error;
  }
}

/**
 * React hook for sync initialization
 * Call this in a component that mounts once (e.g., layout or root component)
 */
export function useSyncInitialization() {
  const { user, isLoaded } = useUser();

  React.useEffect(() => {
    if (!isLoaded || !user?.id) return;

    let cleanup: (() => void) | undefined;

    initializeSync(user.id)
      .then(cleanupFn => { cleanup = cleanupFn; })
      .catch(() => {});

    return () => { cleanup?.(); };
  }, [user?.id, isLoaded]);
}
