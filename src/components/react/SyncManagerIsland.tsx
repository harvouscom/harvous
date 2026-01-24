import React, { useEffect, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { ClerkWrapper } from './ClerkWrapper';
import { initializeSync } from '@/utils/sync-init';
import { persistUserId, getPersistedUserId } from '@/utils/user-id';
import { executeOnlineRecovery, onOnlineRecovery, offOnlineRecovery } from '@/utils/network';
import { syncNow } from '@/utils/sync-manager';
import { offlineDB, ensureDatabaseOpen, retryIndexedDBOperation } from '@/utils/offline-db';
import { isOfflineModeEnabled } from '@/utils/posthog';
import OfflineIndicator from './OfflineIndicator';

interface SyncManagerIslandProps {
  userId?: string | null;
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
export default function SyncManagerIsland({ userId: serverUserId }: SyncManagerIslandProps = {}) {
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

    initializeSync(userId)
      .catch(err => {
        const errorMessage = err?.message || String(err);
        // Silently ignore AUTH_NOT_READY errors (auth still loading)
        if (errorMessage !== 'AUTH_NOT_READY') {
          console.error('[SyncManagerIsland] Failed to initialize sync:', errorMessage);
        }
      });

    setHasInitialized(true);
  }, [userId, hasInitialized]);

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
      {isOfflineEnabled && <OfflineIndicator userId={userId} />}
    </>
  );
}

/**
 * Component that uses Clerk hooks to get userId.
 * Must be wrapped in ClerkProvider to work properly in static builds.
 */
function ClerkSyncContent({ onUserIdChange }: { onUserIdChange: (userId: string | null) => void }) {
  const { isLoaded, user } = useUser();

  useEffect(() => {
    if (isLoaded && user?.id) {
      // Persist userId immediately for offline access
      persistUserId(user.id);
      // Update parent component's userId
      onUserIdChange(user.id);
    }
  }, [user?.id, isLoaded, onUserIdChange]);

  // This component doesn't render anything visible
  return null;
}

/**
 * Wrapper that provides ClerkProvider context for ClerkSyncContent.
 * In static builds, each React Island needs its own ClerkProvider.
 */
function ClerkSyncWrapper({ onUserIdChange }: { onUserIdChange: (userId: string | null) => void }) {
  return (
    <ClerkWrapper fallback={null}>
      <ClerkSyncContent onUserIdChange={onUserIdChange} />
    </ClerkWrapper>
  );
}

