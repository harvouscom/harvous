import React, { useEffect, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { initializeSync } from '@/utils/sync-init';
import OfflineIndicator from './OfflineIndicator';

/**
 * Global component to manage sync loop and show offline indicator.
 * This component MUST only run on the client side since it uses useUser().
 * Will be loaded as a React Island with client:load directive.
 * 
 * The useEffect ensures sync initialization happens after hydration.
 */
export default function SyncManagerIsland() {
  const { user, isLoaded } = useUser();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    // Only run after component is mounted and user is loaded
    if (!mounted || !isLoaded || !user?.id) return;

    // Initialize sync for the logged-in user
    initializeSync(user.id).catch(err => {
      console.error('[SyncManagerIsland] Failed to initialize sync:', err);
    });
  }, [mounted, isLoaded, user?.id]);

  // Don't render until after hydration
  if (!mounted) {
    return null;
  }

  return <OfflineIndicator />;
}

