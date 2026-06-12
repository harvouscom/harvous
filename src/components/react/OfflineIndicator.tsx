import React, { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { offlineDB, ensureDatabaseOpen, retryIndexedDBOperation } from '@/utils/offline-db';
import { getSyncState, retryStuckQueue } from '@/utils/sync-manager';
import { usePersistedUserId } from '@/utils/user-id';
import { formatBadgeCount } from '@/utils/badge-count';
import {
  CHIP_FALLBACK_BOTTOM_PX,
  CHIP_GAP_PX,
  DEFAULT_OFFLINE_CHIP_HEIGHT_PX,
  pickAddNoteAnchor,
} from '@/utils/mobile-offline-chip-layout';
import Icon from './Icon';
import OfflineModeInfoDialog from './dialogs/OfflineModeInfoDialog';

const OFFLINE_CHIP_Z = 1000004;

/**
 * Offline indicator component showing sync status
 * Offline-only: pill chip above Add a note + help dialog; errors use toast
 */
export default function OfflineIndicator({ userId: propUserId }: { userId?: string }) {
  const persistedUserId = usePersistedUserId();
  const userId = propUserId || persistedUserId;
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [isSmallScreen, setIsSmallScreen] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [showSyncSuccess, setShowSyncSuccess] = useState(false);
  const [failedCount, setFailedCount] = useState(0);
  const [helpDialogOpen, setHelpDialogOpen] = useState(false);
  /** Desktop: additional column panel open (synced via window events from DesktopPanelManager). */
  const [desktopHelpOpen, setDesktopHelpOpen] = useState(false);
  const [chipPosition, setChipPosition] = useState<{ anchored: boolean; top: number; left: number } | null>(null);
  const chipRef = useRef<HTMLButtonElement>(null);
  const prevPendingRef = useRef(0);
  /** True after `offline` until we process the next `online` (offline recovery path). */
  const wentOfflineRef = useRef(false);
  /** Set on reconnect when there was pending work; cleared when we show "All items synced" or skip celebration. */
  const celebrateWhenQueueEmptiesRef = useRef(false);

  const checkViewport = useCallback(() => {
    const width = window.innerWidth;
    setIsMobile(width < 1160);
    setIsSmallScreen(width < 800);
  }, []);

  useEffect(() => {
    checkViewport();
    window.addEventListener('resize', checkViewport);
    return () => window.removeEventListener('resize', checkViewport);
  }, [checkViewport]);

  useEffect(() => {
    const onDesktopHelpOpen = () => setDesktopHelpOpen(true);
    const onDesktopHelpClose = () => setDesktopHelpOpen(false);
    window.addEventListener('openOfflineHelpPanel', onDesktopHelpOpen);
    window.addEventListener('closeOfflineHelpPanel', onDesktopHelpClose);
    window.addEventListener('closeAllPanels', onDesktopHelpClose);
    return () => {
      window.removeEventListener('openOfflineHelpPanel', onDesktopHelpOpen);
      window.removeEventListener('closeOfflineHelpPanel', onDesktopHelpClose);
      window.removeEventListener('closeAllPanels', onDesktopHelpClose);
    };
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => {
      wentOfflineRef.current = true;
      setIsOffline(true);
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

        if (
          celebrateWhenQueueEmptiesRef.current &&
          prevPendingRef.current > 0 &&
          pendingCount === 0 &&
          navigator.onLine
        ) {
          celebrateWhenQueueEmptiesRef.current = false;
          setShowSyncSuccess(true);
          setTimeout(() => setShowSyncSuccess(false), 3000);
        }
        prevPendingRef.current = pendingCount;
        setPendingSyncCount(pendingCount);

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

    const handleOnlineWithCheck = async () => {
      setIsOffline(false);
      if (wentOfflineRef.current) {
        if (userId) {
          try {
            await ensureDatabaseOpen();
            const pendingAtReconnect = await retryIndexedDBOperation(async () => {
              return await offlineDB.syncQueue
                .where('userId')
                .equals(userId)
                .filter(op => op.retryCount < 5)
                .count();
            });
            celebrateWhenQueueEmptiesRef.current = pendingAtReconnect > 0;
          } catch {
            celebrateWhenQueueEmptiesRef.current = false;
          }
        } else {
          celebrateWhenQueueEmptiesRef.current = false;
        }
        wentOfflineRef.current = false;
      }
      checkSyncStatus();
    };
    window.addEventListener('online', handleOnlineWithCheck);

    return () => {
      window.removeEventListener('online', handleOnlineWithCheck);
      clearInterval(interval);
    };
  }, [userId, isOffline]);

  const handleRetrySync = useCallback(async () => {
    if (!userId || isRetrying || !navigator.onLine) return;

    setIsRetrying(true);
    try {
      const result = await retryStuckQueue(userId);
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

  const shouldShow = isOffline || syncError || showSyncSuccess || failedCount > 0;
  const showOfflineChip = isOffline && !showSyncSuccess && !syncError && failedCount === 0;

  const updateChipPosition = useCallback(() => {
    if (typeof document === 'undefined') return;
    const anchor = pickAddNoteAnchor();
    const chipH = chipRef.current?.offsetHeight ?? DEFAULT_OFFLINE_CHIP_HEIGHT_PX;
    if (anchor) {
      const r = anchor.getBoundingClientRect();
      setChipPosition({
        anchored: true,
        top: r.top - CHIP_GAP_PX - chipH,
        left: r.left + r.width / 2,
      });
    } else {
      setChipPosition({ anchored: false, top: 0, left: 0 });
    }
  }, []);

  useLayoutEffect(() => {
    if (!showOfflineChip) {
      setChipPosition(null);
      return;
    }
    updateChipPosition();
    const ro = new ResizeObserver(() => updateChipPosition());
    ro.observe(document.body);
    const scrollRoots = [
      ...document.querySelectorAll('.main-column__scroll'),
      ...document.querySelectorAll('.mobile-main__body'),
    ];
    const onScroll = () => updateChipPosition();
    scrollRoots.forEach((el) => el.addEventListener('scroll', onScroll, { passive: true }));
    window.addEventListener('resize', updateChipPosition);
    const raf1 = requestAnimationFrame(() => {
      updateChipPosition();
      requestAnimationFrame(updateChipPosition);
    });
    return () => {
      ro.disconnect();
      scrollRoots.forEach((el) => el.removeEventListener('scroll', onScroll));
      window.removeEventListener('resize', updateChipPosition);
      cancelAnimationFrame(raf1);
    };
  }, [showOfflineChip, updateChipPosition, pendingSyncCount, helpDialogOpen]);

  if (!shouldShow) return null;

  const lightCardBackground =
    'linear-gradient(168.707deg, rgba(255, 255, 255, 1.0) 11.711%, rgb(248, 248, 248) 71.325%)';

  let background: string;
  if (syncError || failedCount > 0) {
    background = 'linear-gradient(168.707deg, rgba(239, 68, 68, 1.0) 11.711%, rgb(220, 38, 38) 71.325%)';
  } else {
    background = lightCardBackground;
  }

  const textColor = syncError || failedCount > 0 ? 'white' : 'var(--color-deep-grey)';

  const baseStyle: React.CSSProperties = {
    backgroundColor: 'rgb(255, 255, 255)',
    background,
    color: textColor,
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
        ...baseStyle,
        left: '24px',
        bottom: '100px',
        width: '260px',
        minWidth: '260px',
        maxWidth: '260px',
        transform: 'none',
      };

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
        flexShrink: 0,
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

  const chipStyle: React.CSSProperties =
    chipPosition?.anchored === true
      ? {
          position: 'fixed',
          top: Math.max(8, chipPosition.top),
          left: chipPosition.left,
          transform: 'translateX(-50%)',
          zIndex: OFFLINE_CHIP_Z,
        }
      : {
          position: 'fixed',
          bottom: CHIP_FALLBACK_BOTTOM_PX,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: OFFLINE_CHIP_Z,
        };

  const offlineChipPortal =
    showOfflineChip &&
    createPortal(
      <button
        ref={chipRef}
        type="button"
        className="offline-indicator offline-indicator--chip"
        data-offline-interactive
        aria-haspopup="dialog"
        aria-expanded={isMobile ? helpDialogOpen : desktopHelpOpen}
        onClick={() => {
          if (isMobile) {
            setHelpDialogOpen(true);
          } else {
            window.dispatchEvent(
              new CustomEvent('openOfflineHelpPanel', { detail: { pendingSyncCount } })
            );
          }
        }}
        style={{
          ...chipStyle,
          appearance: 'none',
          WebkitAppearance: 'none',
          maxWidth: 'min(calc(100vw - 32px), 320px)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        <span className="offline-indicator--chip-icon" aria-hidden>
          <Icon name="wifi-slash" size={15} />
        </span>
        <span className="offline-indicator--chip-label" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          Currently offline
          {pendingSyncCount > 0 ? ` · ${formatBadgeCount(pendingSyncCount)} pending` : ''}
        </span>
      </button>,
      document.body
    );

  if (showOfflineChip) {
    return (
      <>
        {offlineChipPortal}
        {isMobile ? (
          <OfflineModeInfoDialog
            isOpen={helpDialogOpen}
            onClose={() => setHelpDialogOpen(false)}
            pendingSyncCount={pendingSyncCount}
          />
        ) : null}
      </>
    );
  }

  return (
    <div className="offline-indicator" style={indicatorStyle}>
      {showSyncSuccess ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-bold-blue)' }}>
          <Icon name="check" size={16} />
          <span>All items synced</span>
        </span>
      ) : syncError ? (
        <>
          <Icon name="circle-exclamation" size={16} />
          <span style={{ flex: 1 }}>
            Sync failed: {getFriendlyErrorMessage(syncError)}
            {pendingSyncCount > 0 && (
              <span style={{ fontWeight: 400, opacity: 0.9 }}>
                {' '}
                &middot; {pendingSyncCount} pending
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
      ) : null}
    </div>
  );
}
