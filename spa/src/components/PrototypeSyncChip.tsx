import ProtoStatusChip from '@/components/react/ProtoStatusChip';
import { useSyncQueueStatus } from '../hooks/useSyncQueueStatus';
import { getPrototypeSyncChipPresentation } from '../utils/prototype-sync-chip-copy';

/**
 * Single global sync-status pill for the prototype shell. Shows offline / saving / caught-up /
 * failed states from the offline mutation queue. Mounted once inside SimplifiedPrototypeLayout
 * (the prototype-only boundary) so it never doubles up with the Classic OfflineIndicator.
 * Fixed lower-left so it clears the bottom-right/center toaster. Hidden when online and healthy.
 */
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

  return (
    <ProtoStatusChip
      visible={visible}
      variant={variant}
      label={label}
      showRetry={showRetry}
      onRetry={retry}
      isRetrying={isRetrying}
    />
  );
}
