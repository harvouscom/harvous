import { beforeEach, describe, expect, it, vi } from 'vitest';

const KEY = 'harvous.scan.pending';

async function freshModule() {
  vi.resetModules();
  return import('../scan-pending');
}

describe('scan-pending', () => {
  beforeEach(() => localStorage.clear());

  it('survives a reload — the case iOS creates by reloading the PWA under the camera', async () => {
    (await freshModule()).markScanPending('picker');
    const afterReload = await freshModule();
    expect(afterReload.getScanPendingSnapshot().pending).toMatchObject({ via: 'picker' });
  });

  it('forgets a scan older than thirty minutes', async () => {
    localStorage.setItem(KEY, JSON.stringify({ startedAt: Date.now() - 31 * 60 * 1000, via: 'camera-app' }));
    const mod = await freshModule();
    expect(mod.getScanPendingSnapshot().pending).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('clears on a chosen photo, a cancel, or "Not now"', async () => {
    const mod = await freshModule();
    mod.markScanPending('camera-app');
    expect(mod.getScanPendingSnapshot().pending).not.toBeNull();
    mod.clearScanPending();
    expect(mod.getScanPendingSnapshot().pending).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('counts blank notes on screen, so the shell card stands down while one shows the offer', async () => {
    const mod = await freshModule();
    const off = mod.registerBlankNoteOffer();
    expect(mod.getScanPendingSnapshot().blankNoteOffers).toBe(1);
    off();
    expect(mod.getScanPendingSnapshot().blankNoteOffers).toBe(0);
  });

  it('notifies subscribers with a new snapshot on every change', async () => {
    const mod = await freshModule();
    const before = mod.getScanPendingSnapshot();
    mod.markScanPending('picker');
    expect(mod.getScanPendingSnapshot()).not.toBe(before);
  });

  it('offers to resume a chooser scan only after a reload, never mid-session', async () => {
    // iOS sends no cancel event when its camera is dismissed, so a same-session chooser scan
    // may simply have been cancelled.
    const mod = await freshModule();
    mod.markScanPending('picker');
    expect(mod.shouldOfferResume(mod.getScanPendingSnapshot())).toBe(false);
    const afterReload = await freshModule();
    expect(afterReload.shouldOfferResume(afterReload.getScanPendingSnapshot())).toBe(true);
  });

  it('offers to resume the Camera-app route at once — the reader promised to come back', async () => {
    const mod = await freshModule();
    mod.markScanPending('camera-app');
    expect(mod.shouldOfferResume(mod.getScanPendingSnapshot())).toBe(true);
  });
});
