import React from 'react';
import { useUser } from '@clerk/clerk-react';
import { bootstrapSync, syncNow, needsBootstrap, startBackgroundSync } from './sync-manager';

/**
 * Initialize sync on app load
 * Should be called once when the app starts (after user is authenticated)
 */
export async function initializeSync(userId: string): Promise<void> {
  try {
    // Check if bootstrap is needed
    if (await needsBootstrap(userId)) {
      if (navigator.onLine) {
        await bootstrapSync(userId);
      } else {
        console.warn('Bootstrap needed but offline - will bootstrap when online');
      }
    } else {
      // Incremental sync if online
      if (navigator.onLine) {
        await syncNow(userId);
      }
    }

    // Start background sync loop
    startBackgroundSync(userId, 30000); // Sync every 30 seconds
  } catch (error) {
    console.error('Error initializing sync:', error);
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

