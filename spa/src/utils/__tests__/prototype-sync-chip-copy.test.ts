import { describe, expect, it } from 'vitest';
import {
  getPrototypeSyncChipPresentation,
  SYNC_QUEUE_UNHEALTHY_THRESHOLD,
} from '../prototype-sync-chip-copy';

const healthyOnline = {
  isOffline: false,
  pendingCount: 0,
  failedCount: 0,
  syncError: null,
  isSyncing: false,
  showAllSynced: false,
  queueUnhealthy: false,
};

describe('getPrototypeSyncChipPresentation', () => {
  it('hides the chip when online and healthy', () => {
    const result = getPrototypeSyncChipPresentation(healthyOnline);
    expect(result.visible).toBe(false);
  });

  it('shows a brief success state', () => {
    const result = getPrototypeSyncChipPresentation({
      ...healthyOnline,
      showAllSynced: true,
    });
    expect(result.visible).toBe(true);
    expect(result.variant).toBe('success');
    expect(result.label).toBe('All caught up');
  });

  it('uses casual offline copy', () => {
    const offline = getPrototypeSyncChipPresentation({
      ...healthyOnline,
      isOffline: true,
      pendingCount: 0,
    });
    expect(offline.label).toBe("You're offline");

    const offlineWithWork = getPrototypeSyncChipPresentation({
      ...healthyOnline,
      isOffline: true,
      pendingCount: 12,
    });
    expect(offlineWithWork.label).toBe("You're offline — saved on this device");
  });

  it('shows Saving… instead of raw pending counts', () => {
    const syncing = getPrototypeSyncChipPresentation({
      ...healthyOnline,
      isSyncing: true,
      pendingCount: 42,
    });
    expect(syncing.label).toBe('Saving…');
    expect(syncing.label).not.toMatch(/\d/);

    const backlog = getPrototypeSyncChipPresentation({
      ...healthyOnline,
      pendingCount: 3,
    });
    expect(backlog.label).toBe('Saving…');
    expect(backlog.variant).toBe('syncing');
  });

  it('treats absurd queue size as an error without showing digits', () => {
    const result = getPrototypeSyncChipPresentation({
      ...healthyOnline,
      pendingCount: 709454,
      queueUnhealthy: 709454 > SYNC_QUEUE_UNHEALTHY_THRESHOLD,
    });
    expect(result.visible).toBe(true);
    expect(result.variant).toBe('error');
    expect(result.label).toBe("Couldn't save to the cloud");
    expect(result.label).not.toMatch(/\d/);
    expect(result.showRetry).toBe(true);
  });

  it('shows a friendly error for failed sync without counts', () => {
    const result = getPrototypeSyncChipPresentation({
      ...healthyOnline,
      failedCount: 5,
    });
    expect(result.variant).toBe('error');
    expect(result.label).toBe("Couldn't save to the cloud");
    expect(result.label).not.toMatch(/\d/);
  });
});
