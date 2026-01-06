import React, { useState, useEffect, useCallback } from 'react';
import { offlineDB } from '@/utils/offline-db';
import { getSyncState } from '@/utils/sync-manager';
import { usePersistedUserId } from '@/utils/user-id';
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
        // Get pending sync queue count
        const pendingCount = await offlineDB.syncQueue
          .where('userId')
          .equals(userId)
          .filter(op => op.retryCount < 5)
          .count();
        setPendingSyncCount(pendingCount);

        // Get sync state
        const syncState = await getSyncState(userId);
        if (syncState) {
          setIsSyncing(syncState.isSyncing || false);
          setSyncError(syncState.syncError);
        }
      } catch (error) {
        console.error('[OfflineIndicator] Error checking sync status:', error);
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

  return (
    <div className="offline-indicator" style={indicatorStyle}>
      {syncError ? (
        <>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>Sync error: {syncError}</span>
        </>
      ) : isOffline ? (
        <>
          <Icon name="wifi" size={16} />
          <span>You're currently offline</span>
        </>
      ) : null}
    </div>
  );
}

