import { APIError } from './api';
import { toast } from '@/utils/toast';

/**
 * Turn a thrown error into something worth showing a person.
 *
 * Every prototype call site used to read `err instanceof APIError ? err.message : fallback`.
 * The fallbacks were written for users ("Could not update pin"); the server strings were
 * written for developers ("Note not found in space", "Unsupported organization fields: …").
 * Because the server almost always responds, the developer string almost always won — and
 * it landed in a bold red toast that never auto-dismissed and always offered a Support
 * button, which is what made ordinary failures read as alarming and technical.
 *
 * So: server prose is never shown unless its code is explicitly allow-listed as
 * user-authored. Everything else maps to short copy, or falls back to the caller's own.
 */

export type ErrorPresentationAction = 'support' | 'retry';

export interface ErrorPresentation {
  message: string;
  /** Stay until dismissed. Reserved for failures the user genuinely needs to act on. */
  persistent: boolean;
  action?: ErrorPresentationAction;
}

export interface PresentErrorOptions {
  /**
   * Groups repeated failures of the same operation (e.g. 'pin', 'save'). The third
   * failure in a row escalates to a persistent toast with a support affordance, so a
   * one-off blip stays quiet but a stuck state doesn't.
   */
  scope?: string;
}

/**
 * Server `code`s whose `error` string is written for users and safe to surface verbatim.
 * Add to this only when the message reads like product copy — when in doubt, map it below.
 */
const USER_AUTHORED_ERROR_CODES = new Set([
  'SHARED_SPACE_LIMIT_EXCEEDED',
  'NOTE_LIMIT_EXCEEDED',
  'INVITE_DEAD',
  'INVITE_EXPIRED',
  'INVITE_REVOKED',
]);

const CODE_COPY: Record<string, string> = {
  FORBIDDEN: "You don't have permission to do that",
  NOT_FOUND: "We couldn't find that anymore",
  BAD_REQUEST: "That didn't go through",
  RATE_LIMIT_EXCEEDED: 'Too many changes at once — try again in a moment',
  NOTE_VERSION_CONFLICT: 'This changed somewhere else. Your version is saved as a draft',
  ACTIVE_SHARED_ASSOCIATIONS: 'This note is still shared somewhere, so it can’t be removed yet',
};

const STATUS_COPY: Record<number, string> = {
  401: 'Please sign in again',
  403: "You don't have permission to do that",
  404: "We couldn't find that anymore",
  409: 'This changed somewhere else. Your version is saved as a draft',
  429: 'Too many changes at once — try again in a moment',
};

/** Failures repeated within this window count toward escalation. */
const ESCALATION_WINDOW_MS = 30_000;
const ESCALATE_AFTER_FAILURES = 3;

const recentFailures = new Map<string, { count: number; at: number }>();

function noteFailure(scope: string | undefined, now: number): number {
  if (!scope) return 1;
  const prior = recentFailures.get(scope);
  const count = prior && now - prior.at < ESCALATION_WINDOW_MS ? prior.count + 1 : 1;
  recentFailures.set(scope, { count, at: now });
  return count;
}

/** Called after a success so a later blip starts a fresh streak. */
export function clearErrorScope(scope: string): void {
  recentFailures.delete(scope);
}

/** Test seam. */
export function resetErrorScopes(): void {
  recentFailures.clear();
}

function isOfflineLike(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  // api.ts throws APIError only when the server actually responded; anything else is a
  // fetch/network failure.
  return !(error instanceof APIError) && error instanceof Error;
}

export function presentError(
  error: unknown,
  fallback: string,
  options: PresentErrorOptions = {},
  now: number = Date.now(),
): ErrorPresentation {
  const failures = noteFailure(options.scope, now);
  const escalated = failures >= ESCALATE_AFTER_FAILURES;

  if (error instanceof APIError) {
    const code = error.code ?? '';
    if (code && USER_AUTHORED_ERROR_CODES.has(code) && error.message) {
      return { message: error.message, persistent: true, action: 'support' };
    }
    const message = CODE_COPY[code] ?? STATUS_COPY[error.status] ?? fallback;
    // Rate limiting resolves on its own — never escalate it to a stuck-state toast.
    if (error.status === 429) return { message, persistent: false };
    if (error.status >= 500) {
      return escalated
        ? { message, persistent: true, action: 'support' }
        : { message, persistent: false, action: 'retry' };
    }
    return escalated ? { message, persistent: true, action: 'support' } : { message, persistent: false };
  }

  if (isOfflineLike(error)) {
    return { message: "You're offline — we'll finish this when you reconnect", persistent: false };
  }

  return escalated
    ? { message: fallback, persistent: true, action: 'support' }
    : { message: fallback, persistent: false };
}

/**
 * Present a failed operation as a toast. The one call sites should use.
 *
 * `fallback` is the caller's own user-facing sentence — the thing that was already
 * written well but almost never shown, because the raw server string won the ternary.
 */
export function toastError(error: unknown, fallback: string, options: PresentErrorOptions = {}): void {
  const presentation = presentError(error, fallback, options);
  toast.error(presentation.message, {
    persistent: presentation.persistent,
    ...(options.scope ? { id: `error:${options.scope}` } : {}),
  });
}
