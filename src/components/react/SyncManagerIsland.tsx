import React, { useEffect, useState } from 'react';
import { initializeSync } from '@/utils/sync-init';
import { persistUserId, getPersistedUserId } from '@/utils/user-id';
import { executeOnlineRecovery } from '@/utils/network';
import OfflineIndicator from './OfflineIndicator';

/**
 * Global component to manage sync loop and show offline indicator.
 * This component MUST only run on the client side.
 * Works both online (with Clerk) and offline (with localStorage).
 * 
 * Uses a separate component to safely call Clerk hooks without crashing when offline.
 * Also coordinates online recovery to prevent thundering herd when connection is restored.
 */
export default function SyncManagerIsland() {
  // Initialize from localStorage immediately AND set window variable
  // This ensures window.__harvous_userId is available synchronously for all components
  const [userId, setUserId] = useState<string | null>(() => {
    const persisted = getPersistedUserId();
    // Ensure window variable is set for synchronous access elsewhere
    if (persisted && typeof window !== 'undefined') {
      (window as any).__harvous_userId = persisted;
    }
    return persisted;
  });
  const [hasInitialized, setHasInitialized] = useState(false);

  // Initialize sync if we have a persisted userId (handles offline start)
  useEffect(() => {
    if (userId && !hasInitialized) {
      console.log('[SyncManagerIsland] Initializing sync with persisted userId:', userId);
      initializeSync(userId).catch(err => {
        console.error('[SyncManagerIsland] Failed to initialize sync:', err);
      });
      setHasInitialized(true);
    }
  }, [userId, hasInitialized]);

  // Coordinate online recovery - single point of handling 'online' events
  useEffect(() => {
    const handleOnline = () => {
      console.log('[SyncManagerIsland] Online event detected, executing recovery...');
      executeOnlineRecovery();
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  // Use a separate component for Clerk access to isolate potential crashes
  return (
    <>
      <ClerkSyncWrapper onUserIdChange={(id) => {
        if (id) {
          setUserId(id);
        }
      }} />
      <OfflineIndicator userId={userId} />
    </>
  );
}

/**
 * Separate component that safely attempts to use Clerk.
 * If Clerk is unavailable (offline), this component simply doesn't render,
 * but the parent SyncManagerIsland continues to work with localStorage userId.
 */
function ClerkSyncWrapper({ onUserIdChange }: { onUserIdChange: (userId: string | null) => void }) {
  // Try to use Clerk - if it fails, component won't render but parent continues
  let clerkUser: any = null;
  let isLoaded = false;

  try {
    // Dynamically import and use Clerk
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { useUser } = require('@clerk/clerk-react');
    const clerk = useUser();
    clerkUser = clerk.user;
    isLoaded = clerk.isLoaded;
  } catch (e) {
    // Clerk not available (offline) - return null, parent continues with localStorage
    return null;
  }

  useEffect(() => {
    if (isLoaded && clerkUser?.id) {
      // Persist userId for offline access
      persistUserId(clerkUser.id);
      // Update parent component's userId
      onUserIdChange(clerkUser.id);
    }
  }, [clerkUser?.id, isLoaded, onUserIdChange]);

  // This component doesn't render anything visible
  return null;
}

