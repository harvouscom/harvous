import { useCallback, useEffect, useRef, useState } from 'react';
import { offlineDB, ensureDatabaseOpen, retryIndexedDBOperation } from '@/utils/offline-db';
import { getSyncState, syncNow } from '@/utils/sync-manager';
import { getPersistedUserId } from '@/utils/user-id';

export interface SyncQueueStatus {
  /** Browser is offline. */
  isOffline: boolean;
  /** Operations still waiting to push (retryCount < 5). */
  pendingCount: number;
  /** Operations that exhausted retries (retryCount >= 5). */
  failedCount: number;
  /** Last sync error message, if any. */
  syncError: string | null;
  /** A sync push/pull is in flight. */
  isSyncing: boolean;
  /** Briefly true right after the queue drains following a period of pending work. */
  showAllSynced: boolean;
  /** Manually flush the queue (used by the chip's Retry action). */
  retry: () => void;
}

/**
 * Polls the offline sync queue (every 5s, plus on online/offline transitions) and returns a
 * single status object the prototype's global sync chip renders from. Reuses the exact data
 * sources the Classic OfflineIndicator uses (`offlineDB.syncQueue` + `getSyncState`).
 */
export function useSyncQueueStatus(userIdProp?: string | null): SyncQueueStatus {
  const userId = userIdProp ?? getPersistedUserId();

  const [isOffline, setIsOffline] = useState<boolean>(
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  );
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showAllSynced, setShowAllSynced] = useState(false);

  const prevPendingRef = useRef(0);
  const celebrateRef = useRef(false);
  const wentOfflineRef = useRef(false);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => {
      setIsOffline(true);
      wentOfflineRef.current = true;
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!userId) return;

    const countWhere = (filter: (retryCount: number) => boolean) =>
      retryIndexedDBOperation(async () =>
        offlineDB.syncQueue
          .where('userId')
          .equals(userId)
          .filter((op) => filter(op.retryCount))
          .count(),
      );

    const check = async () => {
      try {
        await ensureDatabaseOpen();
        const pending = await countWhere((rc) => rc < 5);

        // Celebrate the moment a non-empty queue drains while online.
        if (celebrateRef.current && prevPendingRef.current > 0 && pending === 0 && navigator.onLine) {
          celebrateRef.current = false;
          setShowAllSynced(true);
          setTimeout(() => setShowAllSynced(false), 3000);
        }
        prevPendingRef.current = pending;
        setPendingCount(pending);
        setFailedCount(await countWhere((rc) => rc >= 5));

        const state = await getSyncState(userId);
        if (state) {
          setSyncError(state.syncError);
          setIsSyncing(!!state.isSyncing);
        }
      } catch (error) {
        const name = (error as { name?: string })?.name;
        if (name !== 'DatabaseClosedError' && !(error as { message?: string })?.message?.includes('closed')) {
          console.error('[useSyncQueueStatus] check failed:', error);
        }
      }
    };

    check();
    const interval = setInterval(check, 5000);

    const handleOnline = async () => {
      if (wentOfflineRef.current) {
        try {
          await ensureDatabaseOpen();
          celebrateRef.current = (await countWhere((rc) => rc < 5)) > 0;
        } catch {
          celebrateRef.current = false;
        }
        wentOfflineRef.current = false;
      }
      check();
    };
    window.addEventListener('online', handleOnline);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
    };
  }, [userId]);

  const retry = useCallback(() => {
    if (!userId || !navigator.onLine) return;
    void syncNow(userId);
  }, [userId]);

  return { isOffline, pendingCount, failedCount, syncError, isSyncing, showAllSynced, retry };
}
