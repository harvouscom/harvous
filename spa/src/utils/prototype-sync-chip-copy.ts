import { SYNC_QUEUE_UNHEALTHY_THRESHOLD } from '@/utils/sync-manager';

export { SYNC_QUEUE_UNHEALTHY_THRESHOLD };

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
  /** The sentence under the label in the toolbar status popover. */
  detail: string;
  showRetry: boolean;
};

const HIDDEN: PrototypeSyncChipPresentation = {
  visible: false,
  variant: 'success',
  label: '',
  detail: '',
  showRetry: false,
};

/** Casual, non-technical status copy — never exposes raw queue counts. */
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

  if (healthy && !input.showAllSynced) return HIDDEN;

  if (hasError) {
    return {
      visible: true,
      variant: 'error',
      label: "Couldn't save to the cloud",
      detail: input.isOffline
        ? "Your changes are kept on this device. They'll go up once you're back online."
        : "Your changes are kept on this device. Try again, or keep writing and we'll retry.",
      showRetry: !input.isOffline,
    };
  }

  if (input.showAllSynced) {
    return {
      visible: true,
      variant: 'success',
      label: 'All caught up',
      detail: 'Everything is saved to the cloud.',
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
      detail:
        input.pendingCount > 0
          ? "Your changes are saved on this device and will go up when you're back online."
          : "Anything you write is kept on this device until you're back online.",
      showRetry: false,
    };
  }

  if (input.isSyncing || input.pendingCount > 0) {
    return {
      visible: true,
      variant: 'syncing',
      label: 'Saving…',
      detail: 'Sending your latest changes to the cloud.',
      showRetry: false,
    };
  }

  return HIDDEN;
}
