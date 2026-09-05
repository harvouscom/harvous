/**
 * The install prompt bridge.
 *
 * What these guard is the failure the feature shipped with for a year: the
 * event captured, cancelled, and then dropped, so Chrome's mini-infobar was
 * suppressed and nothing ever replaced it. A held prompt must be reachable,
 * single-use, and gone the moment it is spent.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  INSTALL_AVAILABILITY_EVENT,
  installPromptAvailable,
  promptInstall,
  subscribeInstallAvailability,
} from '../install-prompt';

type Bridge = {
  readonly available: boolean;
  prompt: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
};

function setBridge(bridge: Bridge | undefined): void {
  (window as unknown as { __harvousInstallPrompt?: Bridge }).__harvousInstallPrompt = bridge;
}

afterEach(() => {
  setBridge(undefined);
});

describe('install prompt bridge', () => {
  it('reports nothing to install when the capture script never held one', () => {
    // iOS, and every browser without the event. Not an error state.
    setBridge(undefined);
    expect(installPromptAvailable()).toBe(false);
  });

  it('resolves "unavailable" rather than throwing when asked with no prompt held', async () => {
    setBridge(undefined);
    await expect(promptInstall()).resolves.toBe('unavailable');
  });

  it('reports what the reader chose', async () => {
    setBridge({ available: true, prompt: () => Promise.resolve('accepted') });
    expect(installPromptAvailable()).toBe(true);
    await expect(promptInstall()).resolves.toBe('accepted');

    setBridge({ available: true, prompt: () => Promise.resolve('dismissed') });
    await expect(promptInstall()).resolves.toBe('dismissed');
  });

  it('subscribes to availability changes and unsubscribes cleanly', () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeInstallAvailability(onChange);

    window.dispatchEvent(new CustomEvent(INSTALL_AVAILABILITY_EVENT));
    expect(onChange).toHaveBeenCalledTimes(1);

    unsubscribe();
    window.dispatchEvent(new CustomEvent(INSTALL_AVAILABILITY_EVENT));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe('the capture script', () => {
  const source = () =>
    readFileSync(resolve(process.cwd(), 'public/scripts/service-worker-manager.js'), 'utf8');

  it('still cancels the mini-infobar, and now keeps what it cancelled', () => {
    const text = source();
    expect(text).toContain('e.preventDefault()');
    expect(text).toContain('window.__harvousInstallPrompt');
    // The bug: assigned and never read. The bridge is what makes it readable.
    expect(text).toContain('deferredPrompt = e');
    expect(text).toContain('event.prompt()');
  });

  it('spends the held prompt before firing it, so it cannot be fired twice', () => {
    const text = source();
    const clearAt = text.indexOf('deferredPrompt = null;\n      announceInstallAvailability();');
    const fireAt = text.indexOf('event.prompt()');
    expect(clearAt).toBeGreaterThan(-1);
    expect(fireAt).toBeGreaterThan(clearAt);
  });

  it('drops the prompt when the app is installed by any other route', () => {
    expect(source()).toContain("window.addEventListener('appinstalled'");
  });

  it('announces every change, so a rendered surface is never stale', () => {
    const text = source();
    expect(text).toContain(`new CustomEvent('harvous:install-availability')`);
    // Gained, spent, and installed elsewhere — three announcements.
    expect(text.match(/announceInstallAvailability\(\)/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
