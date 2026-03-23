import React, { useState, useEffect, useCallback, useRef } from 'react';
import { offlineDB, ensureDatabaseOpen, retryIndexedDBOperation } from '@/utils/offline-db';
import { getSyncState, syncNow } from '@/utils/sync-manager';
import { usePersistedUserId } from '@/utils/user-id';
import { formatBadgeCount } from '@/utils/badge-count';
import Icon from './Icon';

/**
 * Offline indicator component showing sync status
 * Displays offline banner, pending sync count, and error state
 * Self-contained - reads userId directly instead of relying on prop
 * Matches ToastProvider design and positioning
 */
export default function OfflineIndicator({ userId: propUserId }: { userId?: string }) {
  // Use persisted userId directly - works online and offline
  const persistedUserId = usePersistedUserId();
  const userId = propUserId || persistedUserId;
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [isSmallScreen, setIsSmallScreen] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [showSyncSuccess, setShowSyncSuccess] = useState(false);
  const [failedCount, setFailedCount] = useState(0);
  const prevPendingRef = useRef(0);

  // Check viewport (same logic as ToastProvider)
  const checkViewport = useCallback(() => {
    const width = window.innerWidth;
    setIsMobile(width < 1160);
    setIsSmallScreen(width < 800);
  }, []);

  // Check viewport on mount and resize
  useEffect(() => {
    checkViewport();
    window.addEventListener('resize', checkViewport);
    return () => window.removeEventListener('resize', checkViewport);
  }, [checkViewport]);

  // Unconditional useEffect for online/offline detection
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Separate useEffect for sync status checking (requires userId)
  useEffect(() => {
    if (!userId) return;

    const checkSyncStatus = async () => {
      if (!userId) return;

      try {
        await ensureDatabaseOpen();

        const pendingCount = await retryIndexedDBOperation(async () => {
          return await offlineDB.syncQueue
            .where('userId')
            .equals(userId)
            .filter(op => op.retryCount < 5)
            .count();
        });

        // Detect sync completion: pending went from >0 to 0 while online
        if (prevPendingRef.current > 0 && pendingCount === 0 && !isOffline) {
          setShowSyncSuccess(true);
          setTimeout(() => setShowSyncSuccess(false), 3000);
        }
        prevPendingRef.current = pendingCount;
        setPendingSyncCount(pendingCount);

        // Count permanently failed items
        const failed = await retryIndexedDBOperation(async () => {
          return await offlineDB.syncQueue
            .where('userId')
            .equals(userId)
            .filter(op => op.retryCount >= 5)
            .count();
        });
        setFailedCount(failed);

        const syncState = await getSyncState(userId);
        if (syncState) {
          setIsSyncing(syncState.isSyncing || false);
          setSyncError(syncState.syncError);
        }
      } catch (error) {
        const errorName = (error as any)?.name;
        if (errorName !== 'DatabaseClosedError' && !(error as any)?.message?.includes('closed')) {
          console.error('[OfflineIndicator] Error checking sync status:', error);
        }
      }
    };

    checkSyncStatus();
    const interval = setInterval(checkSyncStatus, 5000);

    const handleOnlineWithCheck = () => {
      setIsOffline(false);
      checkSyncStatus();
    };
    window.addEventListener('online', handleOnlineWithCheck);

    return () => {
      window.removeEventListener('online', handleOnlineWithCheck);
      clearInterval(interval);
    };
  }, [userId, isOffline]);

  // Retry sync handler
  const handleRetrySync = useCallback(async () => {
    if (!userId || isRetrying || !navigator.onLine) return;

    setIsRetrying(true);
    try {
      const result = await syncNow(userId);
      if (result.success) {
        setSyncError(null);
        await ensureDatabaseOpen();
        const pendingCount = await retryIndexedDBOperation(async () => {
          return await offlineDB.syncQueue
            .where('userId')
            .equals(userId)
            .filter(op => op.retryCount < 5)
            .count();
        });
        setPendingSyncCount(pendingCount);
        const failed = await retryIndexedDBOperation(async () => {
          return await offlineDB.syncQueue
            .where('userId')
            .equals(userId)
            .filter(op => op.retryCount >= 5)
            .count();
        });
        setFailedCount(failed);
      }
    } catch (error) {
      console.error('[OfflineIndicator] Retry sync failed:', error);
    } finally {
      setIsRetrying(false);
    }
  }, [userId, isRetrying]);

  // Determine if we should show the indicator
  const shouldShow = isOffline || syncError || showSyncSuccess || failedCount > 0;
  if (!shouldShow) return null;

  // Determine background color based on state
  let background: string;
  if (syncError || failedCount > 0) {
    background = 'linear-gradient(168.707deg, rgba(239, 68, 68, 1.0) 11.711%, rgb(220, 38, 38) 71.325%)';
  } else if (showSyncSuccess) {
    background = 'linear-gradient(168.707deg, rgba(34, 197, 94, 1.0) 11.711%, rgb(22, 163, 74) 71.325%)';
  } else {
    background = 'linear-gradient(168.707deg, rgba(245, 158, 11, 1.0) 11.711%, rgb(217, 119, 6) 71.325%)';
  }

  // Base styles matching ToastProvider
  const baseStyle: React.CSSProperties = {
    backgroundColor: 'rgb(255, 255, 255)',
    background,
    color: 'white',
    fontFamily: '"Reddit Sans", system-ui, -apple-system, sans-serif',
    fontSize: '16px',
    fontWeight: '600',
    borderRadius: '12px',
    boxShadow: '0px 7px 16px 0px rgba(0, 0, 0, 0.1), 0px 30px 30px 0px rgba(0, 0, 0, 0.09), 0px 67px 40px 0px rgba(0, 0, 0, 0.05), 0px 119px 47px 0px rgba(0, 0, 0, 0.01), 0px 185px 52px 0px rgba(0, 0, 0, 0)',
    padding: '16px 20px',
    textAlign: 'center',
    minWidth: '280px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    position: 'fixed',
    zIndex: 1000,
  };

  // Apply responsive positioning (matching ToastProvider CSS from global.css)
  const indicatorStyle: React.CSSProperties = isSmallScreen
    ? {
        ...baseStyle,
        bottom: '48px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '90vw',
        minWidth: 'auto',
      }
    : isMobile
    ? {
        ...baseStyle,
        bottom: '16px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '75%',
        maxWidth: 'calc(100vw - 32px)',
      }
    : {
        // Desktop: Left side, above nav column (matches toast positioning)
        ...baseStyle,
        left: '24px',
        bottom: '100px',
        width: '310px',
        minWidth: '310px',
        maxWidth: '310px',
        transform: 'none',
      };

  // Get a user-friendly error message
  const getFriendlyErrorMessage = (error: string): string => {
    if (error.toLowerCase().includes('network') || error.toLowerCase().includes('fetch')) {
      return 'Network issue';
    }
    if (error.toLowerCase().includes('unauthorized') || error.toLowerCase().includes('401')) {
      return 'Session expired';
    }
    if (error.toLowerCase().includes('timeout')) {
      return 'Request timed out';
    }
    return error.length > 30 ? error.substring(0, 30) + '...' : error;
  };

  const retryButton = navigator.onLine && (
    <button
      onClick={handleRetrySync}
      disabled={isRetrying}
      style={{
        background: 'rgba(255, 255, 255, 0.2)',
        border: 'none',
        borderRadius: '6px',
        color: 'white',
        padding: '6px 12px',
        fontSize: '14px',
        fontWeight: 500,
        cursor: isRetrying ? 'not-allowed' : 'pointer',
        opacity: isRetrying ? 0.7 : 1,
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        flexShrink: 0
      }}
    >
      {isRetrying ? (
        <>
          <span style={{ animation: 'spin 1s linear infinite', display: 'inline-flex' }}>
            <Icon name="spinner" size={14} />
          </span>
          Syncing...
        </>
      ) : (
        <>
          <Icon name="arrows-rotate" size={14} />
          Retry
        </>
      )}
    </button>
  );

  return (
    <div className="offline-indicator" style={indicatorStyle}>
      {showSyncSuccess ? (
        <>
          <Icon name="check" size={16} />
          <span>All items synced</span>
        </>
      ) : syncError ? (
        <>
          <Icon name="circle-exclamation" size={16} />
          <span style={{ flex: 1 }}>
            Sync failed: {getFriendlyErrorMessage(syncError)}
            {pendingSyncCount > 0 && (
              <span style={{ fontWeight: 400, opacity: 0.9 }}>
                {' '}&middot; {pendingSyncCount} pending
              </span>
            )}
          </span>
          {retryButton}
        </>
      ) : failedCount > 0 ? (
        <>
          <Icon name="circle-exclamation" size={16} />
          <span style={{ flex: 1 }}>
            {failedCount} {failedCount === 1 ? 'item' : 'items'} failed to sync
          </span>
          {retryButton}
        </>
      ) : isOffline ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Icon name="wifi" size={16} />
            <span>You're offline{pendingSyncCount > 0 ? ` \u00B7 ${formatBadgeCount(pendingSyncCount)} pending` : ''}</span>
          </div>
          <span style={{ fontWeight: 400, fontSize: '13px', opacity: 0.85 }}>
            {pendingSyncCount > 0
              ? 'Will sync when you reconnect'
              : 'New notes will sync when you reconnect'}
          </span>
        </div>
      ) : null}
    </div>
  );
}
