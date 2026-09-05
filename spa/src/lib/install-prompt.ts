/**
 * Chrome's install prompt, as the app sees it.
 *
 * The event itself is captured in `public/scripts/service-worker-manager.js`,
 * which runs before React mounts — `beforeinstallprompt` fires early and once
 * per page load, so a listener registered during hydration would miss it. That
 * script keeps the event and publishes this small bridge on `window`; this file
 * is the only reader, and it exists so nothing else has to know the global's
 * name or its shape.
 *
 * Availability is a real store rather than a boolean read once: the event can
 * arrive after a surface has rendered, and it goes away the moment it is spent
 * or the app is installed in another tab.
 *
 * Absent on iOS and on any browser that does not implement the event, where
 * `available` stays false and the written instructions are the whole answer.
 */
import { useSyncExternalStore } from 'react';

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

/** Fired by the capture script whenever a prompt is gained or spent. */
export const INSTALL_AVAILABILITY_EVENT = 'harvous:install-availability';

type InstallBridge = {
  readonly available: boolean;
  prompt: () => Promise<InstallOutcome>;
};

function bridge(): InstallBridge | null {
  if (typeof window === 'undefined') return null;
  return (
    (window as unknown as { __harvousInstallPrompt?: InstallBridge }).__harvousInstallPrompt ?? null
  );
}

export function subscribeInstallAvailability(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(INSTALL_AVAILABILITY_EVENT, onChange);
  return () => window.removeEventListener(INSTALL_AVAILABILITY_EVENT, onChange);
}

export function installPromptAvailable(): boolean {
  return bridge()?.available ?? false;
}

/**
 * Show the dialog. Resolves what the reader chose, or 'unavailable' when there
 * was no held prompt — which is the ordinary answer on iOS, not an error.
 */
export function promptInstall(): Promise<InstallOutcome> {
  const held = bridge();
  return held ? held.prompt() : Promise.resolve('unavailable');
}

/**
 * `[canInstall, install]` for a surface that offers the one-tap path.
 *
 * Server snapshot is false: nothing can be installed before there is a window,
 * and a card that renders "Install" and then swaps to "Learn how" on hydration
 * would flicker.
 */
export function useInstallPrompt(): { canInstall: boolean; install: () => Promise<InstallOutcome> } {
  const canInstall = useSyncExternalStore(
    subscribeInstallAvailability,
    installPromptAvailable,
    () => false,
  );
  return { canInstall, install: promptInstall };
}
