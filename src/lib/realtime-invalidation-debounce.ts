/**
 * Per-payload debounce for Realtime invalidations.
 *
 * A single shared timer drops an earlier event when a second arrives inside the
 * window (e.g. note:updated then note:created 100ms later). Keying by
 * `${type}:${id}` keeps independent events on independent clocks.
 */

import type { RealtimeInvalidationPayload } from '@/lib/realtime-invalidation';

/** Default refetch nudge — matches historical useRealtimeSync behaviour. */
export const REALTIME_INVALIDATION_DEBOUNCE_MS = 600;

/**
 * Live-body co-edit patches. Author autosave is ~700ms; 120ms here keeps
 * end-to-end around ~900ms without multiplying write volume.
 */
export const REALTIME_LIVE_BODY_DEBOUNCE_MS = 120;

export function invalidationDebounceKey(payload: RealtimeInvalidationPayload): string {
  return `${payload.type}:${payload.id ?? ''}`;
}

export function invalidationDebounceMs(payload: RealtimeInvalidationPayload): number {
  if (
    payload.note &&
    (payload.type === 'note:updated' || payload.type === 'note:created')
  ) {
    return REALTIME_LIVE_BODY_DEBOUNCE_MS;
  }
  return REALTIME_INVALIDATION_DEBOUNCE_MS;
}

/**
 * Schedule `fn` under `key`, replacing any prior timer for that key only.
 * Returns a cancel-all helper for effect cleanup.
 */
export function createKeyedDebouncer(
  timers: Map<string, ReturnType<typeof setTimeout>> = new Map(),
): {
  schedule: (key: string, ms: number, fn: () => void) => void;
  clearAll: () => void;
  /** Test/inspection helper — which keys currently have a pending timer. */
  pendingKeys: () => string[];
} {
  return {
    schedule(key, ms, fn) {
      const existing = timers.get(key);
      if (existing) clearTimeout(existing);
      const handle = setTimeout(() => {
        timers.delete(key);
        fn();
      }, ms);
      timers.set(key, handle);
    },
    clearAll() {
      for (const handle of timers.values()) clearTimeout(handle);
      timers.clear();
    },
    pendingKeys() {
      return [...timers.keys()];
    },
  };
}
