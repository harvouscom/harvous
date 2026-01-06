import React from 'react';
import { useUser } from '@clerk/clerk-react';
import { bootstrapSync, syncNow, needsBootstrap, startBackgroundSync } from './sync-manager';
import { isOfflineModeEnabled } from './posthog';

/**
 * Initialize sync on app load
 * Should be called once when the app starts (after user is authenticated)
 * Only initializes if offline mode feature flag is enabled
 */
export async function initializeSync(userId: string): Promise<void> {
  // Check if offline mode is enabled via feature flag
  if (!isOfflineModeEnabled()) {
    console.log('[initializeSync] ⏸️ Offline mode disabled via feature flag, skipping initialization');
    return;
  }

  console.log('[initializeSync] 🔄 Starting sync initialization for userId:', userId, {
    isOnline: navigator.onLine,
    timestamp: new Date().toISOString()
  });

  try {
    // Check if bootstrap is needed
    console.log('[initializeSync] 🔍 Checking if bootstrap is needed...');
    const needsBoot = await needsBootstrap(userId);
    console.log('[initializeSync] Bootstrap needed:', needsBoot);

    if (needsBoot) {
      if (navigator.onLine) {
        console.log('[initializeSync] ✅ Online - starting bootstrap sync...');
        const bootstrapResult = await bootstrapSync(userId);
        console.log('[initializeSync] Bootstrap result:', {
          success: bootstrapResult.success,
          error: bootstrapResult.error,
          pulledCount: bootstrapResult.pulledCount
        });
        
        if (!bootstrapResult.success) {
          console.error('[initializeSync] ❌ Bootstrap failed:', bootstrapResult.error);
        } else {
          console.log('[initializeSync] ✅ Bootstrap completed successfully');
        }
      } else {
        console.warn('[initializeSync] ⚠️ Bootstrap needed but offline - will bootstrap when online');
      }
    } else {
      // Incremental sync if online
      if (navigator.onLine) {
        console.log('[initializeSync] ✅ Online - starting incremental sync...');
        const syncResult = await syncNow(userId);
        console.log('[initializeSync] Incremental sync result:', {
          success: syncResult.success,
          error: syncResult.error,
          pulledCount: syncResult.pulledCount,
          pushedCount: syncResult.pushedCount
        });
      } else {
        console.log('[initializeSync] ⚠️ Offline - skipping incremental sync');
      }
    }

    // Start background sync loop
    console.log('[initializeSync] 🔄 Starting background sync loop (30s interval)...');
    startBackgroundSync(userId, 30000); // Sync every 30 seconds
    console.log('[initializeSync] ✅ Background sync loop started');
  } catch (error) {
    console.error('[initializeSync] ❌ Error initializing sync:', {
      error,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      userId
    });
    throw error; // Re-throw to let caller handle
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

    initializeSync(user.id);

    // Cleanup function to stop background sync (if needed)
    // Note: startBackgroundSync returns a cleanup function, but we're not storing it here
    // In a production app, you might want to store and call it on unmount
  }, [user?.id, isLoaded]);
}

