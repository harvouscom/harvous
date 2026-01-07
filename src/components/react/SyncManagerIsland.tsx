import React, { useEffect, useState } from 'react';
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
      console.log('[SyncManagerIsland] Initial state - userId from server prop:', serverUserId);
      persistUserId(serverUserId);
      if (typeof window !== 'undefined') {
        (window as any).__harvous_userId = serverUserId;
      }
      return serverUserId;
    }
    
    // Fallback to localStorage
    const persisted = getPersistedUserId();
    console.log('[SyncManagerIsland] Initial state - userId from localStorage:', persisted);
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
      console.log('[SyncManagerIsland] 🔄 Server userId prop changed, updating:', serverUserId);
      persistUserId(serverUserId);
      if (typeof window !== 'undefined') {
        (window as any).__harvous_userId = serverUserId;
      }
      setUserId(serverUserId);
    }
  }, [serverUserId, userId]);

  // Log when userId changes
  useEffect(() => {
    if (userId) {
      console.log('[SyncManagerIsland] ✅ userId detected:', userId, {
        isOnline: navigator.onLine,
        hasInitialized,
        source: serverUserId === userId ? 'server' : 'localStorage'
      });
    } else {
      console.log('[SyncManagerIsland] ⚠️ No userId available yet');
    }
  }, [userId, hasInitialized, serverUserId]);

  // Initialize sync if we have a persisted userId (handles offline start)
  // Only initialize if offline mode feature flag is enabled
  useEffect(() => {
    // Check feature flag before initializing
    if (!isOfflineModeEnabled()) {
      console.log('[SyncManagerIsland] ⏸️ Offline mode disabled via feature flag, skipping sync initialization');
      return;
    }

    if (userId && !hasInitialized) {
      console.log('[SyncManagerIsland] 🚀 Starting sync initialization with userId:', userId, {
        isOnline: navigator.onLine,
        timestamp: new Date().toISOString()
      });
      
      initializeSync(userId)
        .then(() => {
          console.log('[SyncManagerIsland] ✅ Sync initialization completed successfully');
        })
        .catch(err => {
          console.error('[SyncManagerIsland] ❌ Failed to initialize sync:', {
            error: err,
            message: err?.message || String(err),
            stack: err?.stack,
            userId
          });
        });
      
      setHasInitialized(true);
    } else if (!userId) {
      console.log('[SyncManagerIsland] ⏸️ Waiting for userId before initializing sync');
    } else if (hasInitialized) {
      console.log('[SyncManagerIsland] ℹ️ Sync already initialized, skipping');
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
          console.log(`[SyncManagerIsland] Online recovery: ${pendingCount} pending operations, triggering sync...`);
          await syncNow(userId);
          console.log('[SyncManagerIsland] Online recovery sync completed');
        } else {
          console.log('[SyncManagerIsland] Online recovery: No pending operations, skipping sync');
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
      console.log('[ClerkSyncWrapper] ✅ Clerk user loaded, persisting userId:', clerkUser.id);
      // Persist userId immediately for offline access
      // This ensures userId is available even if user goes offline quickly
      // The dependency on clerkUser?.id ensures this runs as soon as Clerk loads
      persistUserId(clerkUser.id);
      // Update parent component's userId
      onUserIdChange(clerkUser.id);
    } else if (isLoaded && !clerkUser?.id) {
      console.log('[ClerkSyncWrapper] ⚠️ Clerk loaded but no user found');
    } else {
      console.log('[ClerkSyncWrapper] ⏳ Clerk not loaded yet, isLoaded:', isLoaded);
    }
  }, [clerkUser?.id, isLoaded, onUserIdChange]);

  // This component doesn't render anything visible
  return null;
}

