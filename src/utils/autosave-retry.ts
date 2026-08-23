/**
 * Retry policy for the prototype note autosave.
 *
 * Background: the autosave used to re-fire immediately from its own `finally` block on
 * every failure — no delay, no cap. Because a 409 is deterministic (the retry reuses the
 * same stale `expectedVersion`), one conflict looped at network speed until it burned the
 * 20-writes/minute budget, after which every request 429'd. Each iteration also re-ran
 * full-body scripture detection and dispatched an error toast.
 *
 * This module is the policy half of the fix, kept pure so it can be unit-tested without
 * mounting the editor. The mechanism half lives in CardFullEditable's save loop.
 */

export type SaveFailureKind =
  /** Version conflict (409). Deterministic — retrying with the same payload always fails. */
  | 'conflict'
  /** Not permitted / gone (403, 404). Retrying can't help. */
  | 'forbidden'
  /** Rate limited (429). Retry, but only after the window the server named. */
  | 'rateLimited'
  /** Network blip or 5xx. Worth retrying with backoff. */
  | 'transient'
  /** Anything else (4xx we don't model). Don't retry. */
  | 'fatal';

export interface SaveFailureClassification {
  kind: SaveFailureKind;
  retryable: boolean;
  /** Server-directed wait, when it sent `Retry-After`. */
  retryAfterMs?: number;
}

/** Max automatic attempts for one unchanged payload, including the first. */
export const MAX_SAVE_ATTEMPTS = 5;

const BASE_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 16_000;

/**
 * Minimum gap between two network saves. The 700ms debounce only gates the *first*
 * attempt after a keystroke; this floor is what keeps sustained typing away from the
 * server's budget for `PUT /api/notes/update`.
 *
 * It used to be 3s, which is 20 saves/minute — *exactly* the old `RATE_LIMITS.WRITE`
 * cap of 20/minute. Sized at the limit rather than under it, so steady typing sat on the
 * ceiling and any other write in the same minute (a second note, an unmount flush, the
 * keepalive PUT iOS fires on every app switch) produced a 429 and the "Too many changes
 * at once" toast. The endpoint now has its own 60/minute bucket (RATE_LIMITS.NOTE_SAVE)
 * and this floor is 5s = 12 saves/minute, so the gap is a ratio, not a coincidence.
 *
 * Raising this only delays when an edit reaches the server. It never risks the edit: the
 * 250ms local-draft writer in CardFullEditable is far tighter and survives a crash or close.
 */
export const MIN_SAVE_INTERVAL_MS = 5_000;

interface ErrorLike {
  status?: number;
  code?: string;
  retryAfterSec?: number;
  /**
   * A thrower's own verdict, honored over any status-based guess.
   *
   * Exists because some save failures never reach the network and so carry no status —
   * `MissingExpectedNoteVersionError` is the live example. Without this they fell into
   * the "no status means the request never got a response" branch below, were treated as
   * transient, and were retried five times; each attempt failed identically and toasted
   * "Trouble saving…", so a deterministic, unfixable-by-waiting error looked like a flaky
   * network. `src/` cannot import from `spa/`, so the error declares its kind rather than
   * this module recognizing its class.
   */
  saveFailureKind?: SaveFailureKind;
}

/**
 * Classify a save rejection. Accepts anything — `APIError`, a bare `Error` from an
 * offline queue, or a non-Error throw — so callers never need to pre-narrow.
 */
export function classifySaveFailure(error: unknown): SaveFailureClassification {
  const err = (error ?? {}) as ErrorLike;
  const status = typeof err.status === 'number' ? err.status : undefined;

  // A declared kind wins: the thrower knows things the status cannot say.
  if (err.saveFailureKind) {
    const declared = err.saveFailureKind;
    return { kind: declared, retryable: declared === 'transient' || declared === 'rateLimited' };
  }

  if (status === 409) return { kind: 'conflict', retryable: false };
  if (status === 403 || status === 404) return { kind: 'forbidden', retryable: false };
  if (status === 429) {
    const retryAfterMs =
      typeof err.retryAfterSec === 'number' && Number.isFinite(err.retryAfterSec)
        ? Math.max(0, err.retryAfterSec) * 1000
        : undefined;
    return { kind: 'rateLimited', retryable: true, retryAfterMs };
  }
  if (status !== undefined && status >= 500) return { kind: 'transient', retryable: true };
  // No status at all means the request never got a response — offline, DNS, aborted.
  if (status === undefined) return { kind: 'transient', retryable: true };

  return { kind: 'fatal', retryable: false };
}

/**
 * Delay before attempt N+1. `attempt` is the number of attempts already made (1 after the
 * first failure). Exponential with jitter; a server-sent `Retry-After` always wins, since
 * retrying before the window closes is guaranteed to 429 again.
 */
export function nextBackoffDelayMs(
  attempt: number,
  retryAfterMs?: number,
  random: () => number = Math.random,
): number {
  if (typeof retryAfterMs === 'number' && Number.isFinite(retryAfterMs) && retryAfterMs > 0) {
    return retryAfterMs;
  }
  const exponential = Math.min(BASE_BACKOFF_MS * 2 ** Math.max(0, attempt - 1), MAX_BACKOFF_MS);
  // Full jitter over the back half: spreads retries without ever dropping below half the
  // intended delay, so a burst of editors doesn't resynchronize on the same window.
  return Math.round(exponential * (0.5 + random() * 0.5));
}

/**
 * Should we schedule another automatic attempt?
 *
 * `attempts` counts attempts already made for this exact payload. The signature check is
 * the caller's job: a *changed* payload resets the counter, because the user editing
 * further is new information, not a retry.
 */
export function shouldRetrySave(
  classification: SaveFailureClassification,
  attempts: number,
  maxAttempts: number = MAX_SAVE_ATTEMPTS,
): boolean {
  return classification.retryable && attempts < maxAttempts;
}

/** Stable identity for a save payload — a changed signature means "not the same retry". */
export function saveSignature(title: string, content: string, collectionKey: string): string {
  return `${title}\u0000${content}\u0000${collectionKey}`;
}

/**
 * User-facing copy for a failed save. Deliberately short and non-technical; the local
 * draft always survives a failed save, so every message says so rather than alarming.
 */
export function saveFailureMessage(kind: SaveFailureKind, gaveUp: boolean): string {
  switch (kind) {
    case 'conflict':
      return 'This note changed somewhere else. Your version is saved as a draft';
    case 'forbidden':
      return "You can't edit this note";
    case 'rateLimited':
      return 'Too many changes at once. Saving will pick back up in a moment';
    // Not retryable, and not a permission problem — the save could not even be attempted
    // safely. Say what to do instead of promising a retry that will never help.
    case 'fatal':
      return 'Could not save. Reload the note to pick your changes back up';
    default:
      return gaveUp
        ? "Still can't save. Your work is safe on this device — we'll retry when you edit again"
        : 'Trouble saving. Your work is safe on this device while we retry';
  }
}
