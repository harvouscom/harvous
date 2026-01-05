import React, { useState, useEffect } from 'react';
import { offlineDB } from '@/utils/offline-db';
import { getSyncState } from '@/utils/sync-manager';
import { useUser } from '@clerk/clerk-react';

/**
 * Offline indicator component showing sync status
 * Displays offline banner, pending sync count, and error state
 */
export default function OfflineIndicator() {
  const { user } = useUser();
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;

    const userId = user.id;

    // Check online/offline status
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Check pending sync count and sync state
    const checkSyncStatus = async () => {
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
        console.error('Error checking sync status:', error);
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
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnlineWithCheck);
      clearInterval(interval);
    };
  }, [user?.id]);

  // Don't show if online, no pending syncs, and no errors
  if (!isOffline && pendingSyncCount === 0 && !syncError && !isSyncing) {
    return null;
  }

  return (
    <div className="offline-indicator" style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 1000,
      padding: '0.75rem 1rem',
      backgroundColor: isOffline ? '#f59e0b' : syncError ? '#ef4444' : '#3b82f6',
      color: 'white',
      fontSize: '0.875rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '0.5rem',
      boxShadow: '0 -2px 8px rgba(0, 0, 0, 0.1)',
    }}>
      {isOffline ? (
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
            <path d="M17 17h.01" />
            <path d="M3 3l18 18" />
            <path d="M12 12h.01" />
            <path d="M8 8h.01" />
            <path d="M5 5h.01" />
          </svg>
          <span>You're offline. Changes will sync when you reconnect.</span>
        </>
      ) : syncError ? (
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
      ) : isSyncing ? (
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
            style={{
              animation: 'spin 1s linear infinite',
            }}
          >
            <path d="M21 12a9 9 0 11-6.219-8.56" />
          </svg>
          <span>Syncing...</span>
        </>
      ) : pendingSyncCount > 0 ? (
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
            <path d="M21 12a9 9 0 11-6.219-8.56" />
          </svg>
          <span>Syncing {pendingSyncCount} {pendingSyncCount === 1 ? 'change' : 'changes'}...</span>
        </>
      ) : null}
      
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

