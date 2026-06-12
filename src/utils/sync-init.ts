import React from 'react';
import { useUser } from '@clerk/clerk-react';
import {
  bootstrapSync,
  syncNow,
  needsBootstrap,
  startBackgroundSync,
  flushPushQueue,
  recoverPrototypeSyncQueueIfBloated,
} from './sync-manager';
import { isOfflineModeEnabled } from './offline-mode';
import { isPrototypeShellPath } from '@/lib/prototype-path';

/** Prototype shell uses React Query only; IndexedDB bootstrap competes with first paint and can OOM the tab. */
export function isPrototypeShellRoute(): boolean {
  if (typeof window === 'undefined') return false;
  return isPrototypeShellPath(window.location.pathname);
}

export type InitializeSyncOptions = {
  /** Defer bootstrap/syncNow until idle so first paint is not competing with heavy IndexedDB work. */
  deferInitialWork?: boolean;
};

function scheduleDeferredWork(run: () => void | Promise<void>): void {
  if (typeof window === 'undefined') {
    void run();
    return;
  }
  const runWrapped = () => {
    void run();
  };
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(runWrapped, { timeout: 4000 });
    return;
  }
  window.setTimeout(runWrapped, 2500);
}

/**
 * Initialize sync on app load
 * Should be called once when the app starts (after user is authenticated)
 * Only initializes if offline mode feature flag is enabled
 * Returns a cleanup function to stop the background sync loop
 */
export async function initializeSync(
  userId: string,
  options?: InitializeSyncOptions,
): Promise<(() => void) | undefined> {
  // Check if offline mode is enabled via feature flag
  if (!isOfflineModeEnabled()) {
    return;
  }

  // Prototype shell: read path is React Query against the server, so we never bootstrap
  // or pull the IndexedDB mirror (that work competes with first paint and can OOM the tab).
  // We DO flush the local mutation queue and run a push-only background loop so notes
  // created/edited offline reach the server when connectivity returns.
  if (isPrototypeShellRoute()) {
    const flushQueue = async () => {
      if (navigator.onLine) {
        try {
          await recoverPrototypeSyncQueueIfBloated(userId);
          await flushPushQueue(userId);
        } catch (error) {
          console.error('[initializeSync] Prototype flush failed:', error);
        }
      }
    };

    if (options?.deferInitialWork) {
      let cleanup: (() => void) | undefined;
      let cancelled = false;
      scheduleDeferredWork(async () => {
        if (cancelled) return;
        await flushQueue();
        if (cancelled) return;
        cleanup = startBackgroundSync(userId, 300000, { pushOnly: true });
      });
      return () => {
        cancelled = true;
        cleanup?.();
      };
    }

    await flushQueue();
    return startBackgroundSync(userId, 300000, { pushOnly: true });
  }

  const runInitialSyncWork = async () => {
    const needsBoot = await needsBootstrap(userId);

    if (needsBoot) {
      if (navigator.onLine) {
        const bootstrapResult = await bootstrapSync(userId);

        if (!bootstrapResult.success && bootstrapResult.error !== 'AUTH_NOT_READY') {
          console.error('[initializeSync] Bootstrap failed:', bootstrapResult.error);
        }
      }
    } else if (navigator.onLine) {
      await syncNow(userId);
    }
  };

  try {
    if (options?.deferInitialWork) {
      let cleanup: (() => void) | undefined;
      let cancelled = false;
      scheduleDeferredWork(async () => {
        if (cancelled) return;
        await runInitialSyncWork();
        if (cancelled) return;
        cleanup = startBackgroundSync(userId, 300000);
      });
      return () => {
        cancelled = true;
        cleanup?.();
      };
    }

    await runInitialSyncWork();
    return startBackgroundSync(userId, 300000);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Silently ignore AUTH_NOT_READY errors (auth still loading)
    if (errorMessage === 'AUTH_NOT_READY') {
      return;
    }

    console.error('[initializeSync] Error:', errorMessage);
    throw error;
  }
}

/**
 * React hook for sync initialization
 * Call this in a component that mounts once (e.g., layout or root component)
 */
export function useSyncInitialization() {
  const { user, isLoaded } = useUser();

  React.useEffect(() => {
    if (!isLoaded || !user?.id) return;

    let cleanup: (() => void) | undefined;

    initializeSync(user.id)
      .then(cleanupFn => { cleanup = cleanupFn; })
      .catch(() => {});

    return () => { cleanup?.(); };
  }, [user?.id, isLoaded]);
}
