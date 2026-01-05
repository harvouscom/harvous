import React, { useEffect, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { initializeSync } from '@/utils/sync-init';
import OfflineIndicator from './OfflineIndicator';

/**
 * Global component to manage sync loop and show offline indicator.
 * This component MUST only run on the client side.
 * We use a try/catch and a ready state to handle Clerk initialization timing.
 */
export default function SyncManagerIsland() {
  const [clerkReady, setClerkReady] = useState(false);
  
  // Use a separate component for the inner logic to isolate the useUser() call
  // This prevents the whole island from crashing if useUser is called too early
  return (
    <ClerkSyncWrapper />
  );
}

function ClerkSyncWrapper() {
  let user: any = null;
  let isLoaded = false;

  // Safely call useUser
  try {
    const clerk = useUser();
    user = clerk.user;
    isLoaded = clerk.isLoaded;
  } catch (e) {
    // Clerk provider not ready yet
    return null;
  }

  useEffect(() => {
    if (isLoaded && user?.id) {
      initializeSync(user.id).catch(err => {
        console.error('[SyncManagerIsland] Failed to initialize sync:', err);
      });
    }
  }, [user?.id, isLoaded]);

  return <OfflineIndicator />;
}

