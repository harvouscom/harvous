/** Pending ops above this threshold are treated as a stuck/unhealthy queue. */
export const SYNC_QUEUE_UNHEALTHY_THRESHOLD = 100;

export type PrototypeSyncChipVariant = 'offline' | 'syncing' | 'success' | 'error';

export type PrototypeSyncChipInput = {
  isOffline: boolean;
  pendingCount: number;
  failedCount: number;
  syncError: string | null;
  isSyncing: boolean;
  showAllSynced: boolean;
  queueUnhealthy: boolean;
};

export type PrototypeSyncChipPresentation = {
  visible: boolean;
  variant: PrototypeSyncChipVariant;
  label: string;
  showRetry: boolean;
};

/** Casual, non-technical chip copy — never exposes raw queue counts. */
export function getPrototypeSyncChipPresentation(
  input: PrototypeSyncChipInput,
): PrototypeSyncChipPresentation {
  const hasError =
    input.queueUnhealthy || input.failedCount > 0 || !!input.syncError;

  const healthy =
    !input.isOffline &&
    input.pendingCount === 0 &&
    input.failedCount === 0 &&
    !input.syncError &&
    !input.isSyncing &&
    !input.queueUnhealthy;

  if (healthy && !input.showAllSynced) {
    return { visible: false, variant: 'success', label: '', showRetry: false };
  }

  if (hasError) {
    return {
      visible: true,
      variant: 'error',
      label: "Couldn't save to the cloud",
      showRetry: !input.isOffline,
    };
  }

  if (input.showAllSynced) {
    return {
      visible: true,
      variant: 'success',
      label: 'All caught up',
      showRetry: false,
    };
  }

  if (input.isOffline) {
    return {
      visible: true,
      variant: 'offline',
      label:
        input.pendingCount > 0
          ? "You're offline — saved on this device"
          : "You're offline",
      showRetry: false,
    };
  }

  if (input.isSyncing || input.pendingCount > 0) {
    return {
      visible: true,
      variant: 'syncing',
      label: 'Saving…',
      showRetry: false,
    };
  }

  return { visible: false, variant: 'success', label: '', showRetry: false };
}
