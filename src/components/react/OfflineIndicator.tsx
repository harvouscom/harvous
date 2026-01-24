import React, { useState, useEffect, useCallback } from 'react';
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
  // Initialize with false (online) during SSR, then check actual state on client
  const [isOffline, setIsOffline] = useState(() => {
    if (typeof navigator === 'undefined') return false;
    return !navigator.onLine;
  });
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [isSmallScreen, setIsSmallScreen] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

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
  // This MUST run regardless of userId to detect offline state
  useEffect(() => {
    // Set initial state on client mount
    if (typeof navigator !== 'undefined') {
      setIsOffline(!navigator.onLine);
    }

    const handleOnline = () => {
      setIsOffline(false);
    };
    const handleOffline = () => {
      setIsOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []); // No dependencies - always runs

  // Separate useEffect for sync status checking (requires userId)
  useEffect(() => {
    if (!userId) {
      return;
    }

    // Check pending sync count and sync state
    const checkSyncStatus = async () => {
      if (!userId) {
        return;
      }
      
      try {
        // Ensure database is open before operations
        await ensureDatabaseOpen();
        
        // Get pending sync queue count with retry logic
        const pendingCount = await retryIndexedDBOperation(async () => {
          return await offlineDB.syncQueue
            .where('userId')
            .equals(userId)
            .filter(op => op.retryCount < 5)
            .count();
        });
        setPendingSyncCount(pendingCount);

        // Get sync state (already has error handling and database check)
        const syncState = await getSyncState(userId);
        if (syncState) {
          setIsSyncing(syncState.isSyncing || false);
          setSyncError(syncState.syncError);
        }
      } catch (error) {
        // Silently handle database errors - don't spam console when database is closed
        // Only log if it's not a DatabaseClosedError
        const errorName = (error as any)?.name;
        if (errorName !== 'DatabaseClosedError' && !(error as any)?.message?.includes('closed')) {
          console.error('[OfflineIndicator] Error checking sync status:', error);
        }
      }
    };

    // Initial check
    checkSyncStatus();

    // Check periodically
    const interval = setInterval(checkSyncStatus, 5000);

    // Also check when coming back online
    const handleOnlineWithCheck = () => {
      setIsOffline(false);
      checkSyncStatus();
    };
    window.addEventListener('online', handleOnlineWithCheck);

    return () => {
      window.removeEventListener('online', handleOnlineWithCheck);
      clearInterval(interval);
    };
  }, [userId]);

  // Retry sync handler
  const handleRetrySync = useCallback(async () => {
    if (!userId || isRetrying || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
    
    setIsRetrying(true);
    try {
      const result = await syncNow(userId);
      if (result.success) {
        setSyncError(null);
        // Refresh the pending count - ensure database is open first
        await ensureDatabaseOpen();
        const pendingCount = await retryIndexedDBOperation(async () => {
          return await offlineDB.syncQueue
            .where('userId')
            .equals(userId)
            .filter(op => op.retryCount < 5)
            .count();
        });
        setPendingSyncCount(pendingCount);
      }
    } catch (error) {
      console.error('[OfflineIndicator] Retry sync failed:', error);
    } finally {
      setIsRetrying(false);
    }
  }, [userId, isRetrying]);

  // Only show when offline OR there's a sync error
  // When online, syncing happens silently in the background
  if (!isOffline && !syncError) {
    return null;
  }

  // Base styles matching ToastProvider
  const baseStyle: React.CSSProperties = {
    backgroundColor: 'rgb(255, 255, 255)',
    background: syncError 
      ? 'linear-gradient(168.707deg, rgba(239, 68, 68, 1.0) 11.711%, rgb(220, 38, 38) 71.325%)'
      : 'linear-gradient(168.707deg, rgba(245, 158, 11, 1.0) 11.711%, rgb(217, 119, 6) 71.325%)',
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
        bottom: '100px', // 64px nav-column-bottom height + 12px spacing + 24px layout padding
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
    // Truncate long error messages
    return error.length > 30 ? error.substring(0, 30) + '...' : error;
  };

  return (
    <div className="offline-indicator" style={indicatorStyle}>
      {syncError ? (
        <>
          <Icon name="circle-exclamation" size={16} />
          <span style={{ flex: 1 }}>
            Sync failed: {getFriendlyErrorMessage(syncError)}
            {pendingSyncCount > 0 && (
              <span style={{ fontWeight: 400, opacity: 0.9 }}>
                {' '}· {pendingSyncCount} pending
              </span>
            )}
          </span>
          {(typeof navigator !== 'undefined' && navigator.onLine) && (
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
          )}
        </>
      ) : isOffline ? (
        <>
          <Icon name="wifi" size={16} />
          <span>
            You're currently offline
            {pendingSyncCount > 0 && (
              <>
                {' '}·{' '}
                <span 
                  className="badge-count" 
                  style={{ 
                    display: 'inline-flex', 
                    verticalAlign: 'middle', 
                    marginLeft: '4px',
                    background: 'rgba(255, 255, 255, 0.25)',
                    width: '24px',
                    height: '24px'
                  }}
                >
                  <span className="badge-number" style={{ color: 'white' }}>{formatBadgeCount(pendingSyncCount)}</span>
                </span>
              </>
            )}
          </span>
        </>
      ) : null}
    </div>
  );
}


