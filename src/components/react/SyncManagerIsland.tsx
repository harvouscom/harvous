import React, { useEffect } from 'react';
import { useUser } from '@clerk/clerk-react';
import { initializeSync } from '@/utils/sync-init';
import OfflineIndicator from './OfflineIndicator';

/**
 * Global component to manage sync loop and show offline indicator.
 * This component is intended to be used as a React Island in the main layout.
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

