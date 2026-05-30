import React, { useEffect, useState } from 'react';
import { initializeSync } from '@/utils/sync-init';
import { persistUserId, getPersistedUserId } from '@/utils/user-id';
import { executeOnlineRecovery, onOnlineRecovery, offOnlineRecovery } from '@/utils/network';
import { syncNow } from '@/utils/sync-manager';
import { offlineDB, ensureDatabaseOpen, retryIndexedDBOperation } from '@/utils/offline-db';
import { isOfflineModeEnabled } from '@/utils/offline-mode';
import OfflineIndicator from './OfflineIndicator';

interface SyncManagerIslandProps {
  userId?: string | null;
  /** When true, sync still runs but the offline / sync-error floating UI is not shown (e.g. `/prototype/`). */
  hideOfflineIndicator?: boolean;
  /** When true, bootstrap / incremental sync waits until idle so shell paint is not competing. */
  deferSyncInit?: boolean;
}

/**
 * Global component to manage sync loop and show offline indicator.
 * This component MUST only run on the client side.
 * Works both online (with Clerk) and offline (with localStorage).
 * 
 * Uses a separate component to safely call Clerk hooks without crashing when offline.
 * Also coordinates online recovery to prevent thundering herd when connection is restored.
 * 
 * @param userId - Optional userId from server-side auth. If provided, this takes precedence.
 */
export default function SyncManagerIsland({
  userId: serverUserId,
  hideOfflineIndicator = false,
  deferSyncInit = false,
}: SyncManagerIslandProps = {}) {
  // Initialize from server prop (fastest), then localStorage, then set window variable
  // This ensures window.__harvous_userId is available synchronously for all components
  const [userId, setUserId] = useState<string | null>(() => {
    // Server-provided userId takes precedence (most reliable)
    if (serverUserId) {
      persistUserId(serverUserId);
      if (typeof window !== 'undefined') {
        (window as any).__harvous_userId = serverUserId;
      }
      return serverUserId;
    }

    // Fallback to localStorage
    const persisted = getPersistedUserId();
    // Ensure window variable is set for synchronous access elsewhere
    if (persisted && typeof window !== 'undefined') {
      (window as any).__harvous_userId = persisted;
    }
    return persisted;
  });
  const [hasInitialized, setHasInitialized] = useState(false);

  // Update userId if server prop changes (e.g., after navigation)
  useEffect(() => {
    if (serverUserId && serverUserId !== userId) {
      persistUserId(serverUserId);
      if (typeof window !== 'undefined') {
        (window as any).__harvous_userId = serverUserId;
      }
      setUserId(serverUserId);
    }
  }, [serverUserId, userId]);

  // Initialize sync if we have a persisted userId (handles offline start)
  // Only initialize if offline mode feature flag is enabled
  useEffect(() => {
    if (!isOfflineModeEnabled() || !userId || hasInitialized) {
      return;
    }

    let syncCleanup: (() => void) | undefined;

    initializeSync(userId, { deferInitialWork: deferSyncInit })
      .then(cleanup => { syncCleanup = cleanup; })
      .catch(err => {
        const errorMessage = err?.message || String(err);
        // Silently ignore AUTH_NOT_READY errors (auth still loading)
        if (errorMessage !== 'AUTH_NOT_READY') {
          console.error('[SyncManagerIsland] Failed to initialize sync:', errorMessage);
        }
      });

    setHasInitialized(true);

    return () => { syncCleanup?.(); };
  }, [userId, hasInitialized, deferSyncInit]);

  // Coordinate online recovery - single point of handling 'online' events
  useEffect(() => {
    const handleOnline = () => executeOnlineRecovery();

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  // Register sync callback for online recovery
  // This ensures offline notes are synced when coming back online,
  // even if background sync hasn't been initialized yet
  // Only register if offline mode is enabled
  useEffect(() => {
    if (!userId || !isOfflineModeEnabled()) {
      return;
    }

    const recoveryId = `sync-manager-${userId}`;
    
    const syncCallback = async () => {
      if (!userId || !navigator.onLine) {
        return;
      }

      try {
        // Ensure database is open before checking sync queue
        await ensureDatabaseOpen();
        
        // Check if there are pending sync operations with retry logic
        const pendingCount = await retryIndexedDBOperation(async () => {
          return await offlineDB.syncQueue
            .where('userId')
            .equals(userId)
            .filter(op => op.retryCount < 5)
            .count();
        });

        if (pendingCount > 0) {
          await syncNow(userId);
        }
      } catch (error) {
        // Silently handle database errors - don't spam console when database is closed
        const errorName = (error as any)?.name;
        if (errorName !== 'DatabaseClosedError' && !(error as any)?.message?.includes('closed')) {
          console.error('[SyncManagerIsland] Online recovery sync error:', error);
        }
      }
    };

    // Register callback with high priority (5) so it runs early in recovery sequence
    onOnlineRecovery(recoveryId, syncCallback, 5);

    // Cleanup: unregister callback when userId changes or component unmounts
    return () => {
      offOnlineRecovery(recoveryId);
    };
  }, [userId]);

  // Only render offline indicator if offline mode is enabled
  const isOfflineEnabled = isOfflineModeEnabled();

  // Use a separate component for Clerk access to isolate potential crashes
  return (
    <>
      <ClerkSyncWrapper onUserIdChange={(id) => {
        if (id) {
          setUserId(id);
        }
      }} />
      {isOfflineEnabled && !hideOfflineIndicator ? (
        <OfflineIndicator userId={userId ?? undefined} />
      ) : null}
    </>
  );
}

/**
 * Separate component that safely attempts to use Clerk.
 * If Clerk is unavailable (offline), this component simply doesn't render,
 * but the parent SyncManagerIsland continues to work with localStorage userId.
 */
function ClerkSyncWrapper({ onUserIdChange }: { onUserIdChange: (userId: string | null | undefined) => void }) {
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
      // Persist userId immediately for offline access
      persistUserId(clerkUser.id);
      // Update parent component's userId
      onUserIdChange(clerkUser.id);
    }
  }, [clerkUser?.id, isLoaded, onUserIdChange]);

  // This component doesn't render anything visible
  return null;
}

