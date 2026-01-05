import React, { useEffect } from 'react';
import { useUser } from '@clerk/clerk-react';
import { initializeSync } from '@/utils/sync-init';
import OfflineIndicator from './OfflineIndicator';

/**
 * Global component to manage sync loop and show offline indicator.
 * This component MUST only run on the client side since it uses useUser().
 * Loaded in Layout.astro with client:only="react" directive.
 */
export default function SyncManagerIsland() {
  const { user, isLoaded } = useUser();

  useEffect(() => {
    if (isLoaded && user?.id) {
      // Initialize sync for the logged-in user
      initializeSync(user.id).catch(err => {
        console.error('[SyncManagerIsland] Failed to initialize sync:', err);
      });
    }
  }, [user?.id, isLoaded]);

  return <OfflineIndicator />;
}

