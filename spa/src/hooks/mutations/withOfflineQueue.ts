import { APIError } from '../../lib/api';
import { getPersistedUserId } from '@/utils/user-id';
import { isOfflineModeEnabled } from '@/utils/offline-mode';

/**
 * Offline-fallback mutation helper for the prototype SPA.
 *
 * The prototype talks to a direct REST API (`/api/notes/*`) AND a separate sync-push endpoint
 * driven by the background loop. So writes are ONLINE-FIRST: attempt the network call, and only
 * if it fails because we're offline do we persist to the durable queue (IndexedDB row + enqueue
 * via `offline-mutations`) for later push. This avoids double-applying online writes (a queued
 * op that gets pushed again would duplicate a create or 404 a delete and surface a false sync
 * failure). When queued offline we DO NOT surface the error — the queue owns delivery and React
 * Query keeps its optimistic cache (no rollback). A genuine server rejection (4xx/5xx) still
 * throws so the hook's existing error/rollback path runs.
 *
 * Note creation is intentionally NOT routed through here: its offline write must happen in
 * `onSuccess` so the offline-db id can be forced to equal the optimistic cache id minted in
 * `onMutate` (see useCreateSimpleNote), which is what lets the local→server reconcile work.
 */

/** True for a network/offline failure (queue will retry) — false for a server rejection. */
export function isOfflineError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  // `api.ts` throws APIError only when the server actually responded. A thrown non-APIError
  // is a fetch/network failure (TypeError), which we treat as "offline, queued for retry".
  return !(err instanceof APIError);
}

export interface OfflineFirstOutcome<T> {
  /** The server response when the online call succeeded; null when queued offline. */
  online: T | null;
  /** True when the online call could not reach the server and the durable queue owns delivery. */
  queued: boolean;
  /** Local id returned by the offline write (e.g. a `local_*` create id), when applicable. */
  localId: string | null;
}

export async function runOfflineFirst<T>(opts: {
  /** The network call. Throwing an APIError surfaces; throwing a network error falls back to the queue. */
  online: () => Promise<T>;
  /** Durable offline write run only when the network call fails offline. Returns a minted local id, if any. */
  offline?: (userId: string) => Promise<string | void>;
}): Promise<OfflineFirstOutcome<T>> {
  try {
    const online = await opts.online();
    return { online, queued: false, localId: null };
  } catch (err) {
    if (!isOfflineError(err)) throw err;

    // Offline: persist to the durable queue so the change syncs on reconnect.
    const userId = getPersistedUserId();
    let localId: string | null = null;
    if (opts.offline && userId && isOfflineModeEnabled()) {
      try {
        const res = await opts.offline(userId);
        if (typeof res === 'string') localId = res;
      } catch (offlineErr) {
        console.error('[runOfflineFirst] offline write failed:', offlineErr);
      }
    }
    return { online: null, queued: true, localId };
  }
}
