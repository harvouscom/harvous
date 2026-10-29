import { useEffect, useRef, useSyncExternalStore } from 'react';
import { haptics } from '@/utils/haptics';
import { toast } from '@/utils/toast';
import { useSyncQueueStatus } from '../hooks/useSyncQueueStatus';
import {
  getPrototypeSyncChipPresentation,
  type PrototypeSyncChipPresentation,
} from '../utils/prototype-sync-chip-copy';

/**
 * Sync status for the prototype shell, watched once and shown in two sizes.
 *
 * It used to be a pill fixed to the window's lower-left corner, portaled to the body and
 * painted `#fff` — invisible on a dark canvas, and a second floating thing competing with the
 * toaster and the study dock for the same corner. Now the quiet states (offline, saving) are a
 * small glyph in the toolbar (`PrototypeSyncStatusButton`), and only a real failure — the
 * queue gave up, or sync itself errored — is loud enough for a toast.
 *
 * Watched here rather than in the toolbar because the toolbar is not one component: it swaps
 * between its detail and unified shapes as the window crosses the breakpoint, is replaced
 * outright on admin routes, and a toast raised from inside it would fire once per remount.
 * The watcher sits where the chip did (once, in `SimplifiedPrototypeLayout`) and publishes
 * what it sees; the toolbar glyph only reads.
 */

export type PrototypeSyncSnapshot = {
  presentation: PrototypeSyncChipPresentation;
  isRetrying: boolean;
  retry: () => void;
};

let snapshot: PrototypeSyncSnapshot | null = null;
const listeners = new Set<() => void>();

function publish(next: PrototypeSyncSnapshot | null) {
  snapshot = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** What the watcher last saw, or null when no member is signed in. */
export function usePrototypeSyncSnapshot(): PrototypeSyncSnapshot | null {
  return useSyncExternalStore(subscribe, () => snapshot, () => null);
}

/**
 * How long a failure must hold before it earns a toast. The status hook retries a stuck queue
 * once on its own as soon as it sees one; a failure that clears inside that window was a blip,
 * and a toast for it would be asking someone to act on something already fixed.
 */
const FAILURE_TOAST_DELAY_MS = 4000;

const FAILURE_TOAST_ID = 'proto-sync-failure';

export default function PrototypeSyncWatcher({ userId }: { userId?: string | null }) {
  const status = useSyncQueueStatus(userId);
  const presentation = getPrototypeSyncChipPresentation(status);
  const { isRetrying, retry } = status;

  const retryRef = useRef(retry);
  retryRef.current = retry;

  const { visible, variant, label, detail, showRetry } = presentation;
  useEffect(() => {
    publish({
      presentation: { visible, variant, label, detail, showRetry },
      isRetrying,
      retry: () => retryRef.current(),
    });
  }, [visible, variant, label, detail, showRetry, isRetrying]);

  useEffect(() => () => publish(null), []);

  /*
   * One toast per failure episode. Offline is not one: Retry cannot work without a
   * connection, and the toolbar already says why nothing is going up. If the failure is still
   * there once the connection returns (and the hook's own retry has had its go), that is when
   * it is worth interrupting for.
   */
  const failing = variant === 'error' && !status.isOffline;
  const toastedRef = useRef(false);
  useEffect(() => {
    if (!failing) {
      toastedRef.current = false;
      return undefined;
    }
    if (toastedRef.current) return undefined;
    const timer = setTimeout(() => {
      toastedRef.current = true;
      haptics.error();
      toast.error("Couldn't save to the cloud", {
        persistent: true,
        id: FAILURE_TOAST_ID,
        action: { label: 'Retry', onAction: () => retryRef.current() },
      });
    }, FAILURE_TOAST_DELAY_MS);
    return () => clearTimeout(timer);
  }, [failing]);

  return null;
}
