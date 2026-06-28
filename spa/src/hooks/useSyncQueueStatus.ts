import { useCallback, useEffect, useRef, useState } from 'react';
import { offlineDB, ensureDatabaseOpen, retryIndexedDBOperation } from '@/utils/offline-db';
import {
  getSyncState,
  recoverPrototypeSyncQueueIfBloated,
  retryStuckQueue,
  triggerImmediateSync,
} from '@/utils/sync-manager';
import { getPersistedUserId } from '@/utils/user-id';
import { SYNC_QUEUE_UNHEALTHY_THRESHOLD } from '../utils/prototype-sync-chip-copy';

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
  /** True when the pending queue is abnormally large (likely stuck). */
  queueUnhealthy: boolean;
  /** True while the chip's Retry action is running. */
  isRetrying: boolean;
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
  const [queueUnhealthy, setQueueUnhealthy] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  const prevPendingRef = useRef(0);
  const celebrateRef = useRef(false);
  const wentOfflineRef = useRef(false);
  const checkRef = useRef<(() => Promise<void>) | null>(null);
  const unhealthyWarnedRef = useRef(false);
  const autoRetryAttemptedRef = useRef(false);
  const errorDiagWarnedRef = useRef(false);

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

    unhealthyWarnedRef.current = false;
    autoRetryAttemptedRef.current = false;

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
        const failed = await countWhere((rc) => rc >= 5);
        const unhealthy = pending > SYNC_QUEUE_UNHEALTHY_THRESHOLD;

        if (unhealthy && !unhealthyWarnedRef.current) {
          unhealthyWarnedRef.current = true;
          console.warn('[useSyncQueueStatus] sync queue unhealthy', { pending, userId });
        }

        // Self-heal: when online with a stuck queue (either abnormally large, or ops that
        // exhausted their retries), auto-retry once per online episode. Without this, a
        // transient offline blip that pushes ops to retryCount>=5 leaves the chip stuck on
        // "Couldn't save to the cloud" forever even after the connection is restored, until the
        // user manually taps Retry. `autoRetryAttemptedRef` is re-armed on each reconnect
        // (see handleOnline) so we recover on reconnect but never hammer a permanently-dead op.
        if ((unhealthy || failed > 0) && navigator.onLine && !autoRetryAttemptedRef.current) {
          autoRetryAttemptedRef.current = true;
          if (unhealthy) {
            void recoverPrototypeSyncQueueIfBloated(userId).then(() => checkRef.current?.());
          } else {
            triggerImmediateSync(userId);
            void retryStuckQueue(userId).then(() => checkRef.current?.());
          }
        }

        // Celebrate the moment a non-empty queue drains while online.
        if (celebrateRef.current && prevPendingRef.current > 0 && pending === 0 && navigator.onLine) {
          celebrateRef.current = false;
          setShowAllSynced(true);
          setTimeout(() => setShowAllSynced(false), 3000);
        }
        prevPendingRef.current = pending;
        setPendingCount(pending);
        setQueueUnhealthy(unhealthy);
        setFailedCount(failed);

        const state = await getSyncState(userId);
        const syncErrorValue = state?.syncError ?? null;
        if (state) {
          setSyncError(syncErrorValue);
          setIsSyncing(!!state.isSyncing);
        }

        const hasChipError = unhealthy || failed > 0 || !!syncErrorValue;
        if (hasChipError && !errorDiagWarnedRef.current && import.meta.env.DEV) {
          errorDiagWarnedRef.current = true;
          const sampleOps = await retryIndexedDBOperation(async () =>
            offlineDB.syncQueue
              .where('userId')
              .equals(userId)
              .filter((op) => op.retryCount >= 5 || !!op.lastError)
              .limit(5)
              .toArray(),
          );
          console.warn('[useSyncQueueStatus] sync chip error state', {
            pending,
            failed,
            syncError: syncErrorValue,
            sampleLastErrors: sampleOps.map((op) => ({
              entityType: op.entityType,
              operation: op.operation,
              retryCount: op.retryCount,
              lastError: op.lastError,
            })),
          });
        } else if (!hasChipError) {
          errorDiagWarnedRef.current = false;
        }
      } catch (error) {
        const name = (error as { name?: string })?.name;
        if (name !== 'DatabaseClosedError' && !(error as { message?: string })?.message?.includes('closed')) {
          console.error('[useSyncQueueStatus] check failed:', error);
        }
      }
    };

    const POLL_MS_HEALTHY = 5000;
    const POLL_MS_PENDING = 1000;
    let intervalMs = POLL_MS_HEALTHY;

    const checkAndReschedule = async () => {
      await check();
      const nextMs = prevPendingRef.current > 0 ? POLL_MS_PENDING : POLL_MS_HEALTHY;
      if (nextMs !== intervalMs) {
        intervalMs = nextMs;
        clearInterval(interval);
        interval = setInterval(() => { void checkAndReschedule(); }, intervalMs);
      }
    };

    let interval = setInterval(() => { void checkAndReschedule(); }, intervalMs);

    checkRef.current = checkAndReschedule;
    void checkAndReschedule();

    const handleOnline = async () => {
      // Re-arm the one-shot self-heal so reconnecting always gets a fresh auto-retry of any
      // ops that got stuck while offline.
      autoRetryAttemptedRef.current = false;
      if (wentOfflineRef.current) {
        try {
          await ensureDatabaseOpen();
          celebrateRef.current = (await countWhere((rc) => rc < 5)) > 0;
        } catch {
          celebrateRef.current = false;
        }
        wentOfflineRef.current = false;
      }
      void checkAndReschedule();
    };
    window.addEventListener('online', handleOnline);

    return () => {
      checkRef.current = null;
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
    };
  }, [userId]);

  const retry = useCallback(() => {
    if (!userId || !navigator.onLine) return;
    void (async () => {
      setIsRetrying(true);
      try {
        await recoverPrototypeSyncQueueIfBloated(userId);
        await retryStuckQueue(userId);
        triggerImmediateSync(userId);
        await checkRef.current?.();
      } catch (error) {
        console.error('[useSyncQueueStatus] retry failed:', error);
      } finally {
        setIsRetrying(false);
      }
    })();
  }, [userId]);

  return {
    isOffline,
    pendingCount,
    failedCount,
    syncError,
    isSyncing,
    showAllSynced,
    queueUnhealthy,
    isRetrying,
    retry,
  };
}
