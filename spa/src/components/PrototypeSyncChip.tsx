import { createPortal } from 'react-dom';
import { useSyncQueueStatus } from '../hooks/useSyncQueueStatus';
import { getPrototypeSyncChipPresentation } from '../utils/prototype-sync-chip-copy';

/**
 * Single global sync-status pill for the prototype shell. Shows offline / saving / caught-up /
 * failed states from the offline mutation queue. Mounted once inside SimplifiedPrototypeLayout
 * (the prototype-only boundary) so it never doubles up with the Classic OfflineIndicator.
 * Fixed lower-left so it clears the bottom-right/center toaster. Hidden when online and healthy.
 */
const VARIANT_CLASS = {
  offline: 'proto-sync-chip--offline',
  syncing: 'proto-sync-chip--syncing',
  success: 'proto-sync-chip--success',
  error: 'proto-sync-chip--error',
} as const;

export default function PrototypeSyncChip({ userId }: { userId?: string | null }) {
  const {
    isOffline,
    pendingCount,
    failedCount,
    syncError,
    isSyncing,
    showAllSynced,
    queueUnhealthy,
    isRetrying,
    retry,
  } = useSyncQueueStatus(userId);

  const { visible, variant, label, showRetry } = getPrototypeSyncChipPresentation({
    isOffline,
    pendingCount,
    failedCount,
    syncError,
    isSyncing,
    showAllSynced,
    queueUnhealthy,
  });

  if (!visible || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className={`proto-sync-chip ${VARIANT_CLASS[variant]}`}
    >
      <span
        aria-hidden="true"
        className={
          variant === 'syncing'
            ? 'proto-sync-chip__dot proto-sync-chip__dot--spin'
            : 'proto-sync-chip__dot'
        }
      />
      <span className="proto-sync-chip__label">{label}</span>
      {showRetry ? (
        <button
          type="button"
          className="proto-sync-chip__retry"
          onClick={retry}
          disabled={isRetrying}
        >
          {isRetrying ? 'Retrying…' : 'Retry'}
        </button>
      ) : null}
    </div>,
    document.body,
  );
}
