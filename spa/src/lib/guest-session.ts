/**
 * Trying Harvous without an account.
 *
 * A guest is a real visitor with no Clerk session: they read Scripture (already public — see
 * `usePrototypeBibleChapter`), write notes and highlights to this device, and send nothing to
 * the server. On sign-up their work is adopted into the new account rather than re-typed.
 *
 * Module state with a subscribe, not context, for the same reason the onboarding store is:
 * surfaces nowhere near each other ask "am I a guest" — the toolbar, the editor's save path,
 * every locked empty state — and none of them should have to be handed the answer through six
 * components.
 */
import {
  PROTO_GUEST_SESSION_KEY,
  PROTO_GUEST_EXIT_PROMPT_KEY,
} from '../layouts/proto-session-keys';
import { hasClerkSessionCookieHint } from '../hooks/queries/useProfile';

/**
 * The Dexie partition a guest's rows live under.
 *
 * Every offline table is indexed `[userId+id]` already (`src/utils/offline-db.ts`), so a guest
 * needs no schema change — just a userId no Clerk account can collide with. Clerk ids are
 * `user_…`, so a bare `guest` is safe by construction.
 */
export const GUEST_USER_ID = 'guest';

/** The query param that turns an arriving link into a guest visit. */
export const GUEST_ENTRY_PARAM = 'try';

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeToGuestSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** ISO timestamp this visit began, or null when there is no guest session. */
export function guestSessionStartedAt(): string | null {
  try {
    return localStorage.getItem(PROTO_GUEST_SESSION_KEY);
  } catch {
    /* private mode / quota — treat as no session rather than trapping the shell */
    return null;
  }
}

export function hasGuestSession(): boolean {
  return guestSessionStartedAt() !== null;
}

/**
 * Begin (or keep) a guest visit.
 *
 * Idempotent on purpose: arriving a second time on a `?try=1` link should not reset the clock or
 * re-arm the exit prompt on someone who has been reading for an hour.
 */
export function startGuestSession(startedAt = new Date().toISOString()): void {
  if (hasGuestSession()) return;
  try {
    localStorage.setItem(PROTO_GUEST_SESSION_KEY, startedAt);
  } catch {
    /* ignore — a guest who cannot write localStorage still gets the reader */
  }
  emit();
}

/**
 * End the guest visit. Called once, by adoption, after the rows have been re-partitioned.
 *
 * Order matters at the call site: clearing this flips every surface to account mode, so the
 * notes must already belong to the account by the time it runs, or a guest's work briefly looks
 * like it vanished.
 */
export function clearGuestSession(): void {
  try {
    localStorage.removeItem(PROTO_GUEST_SESSION_KEY);
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.removeItem(PROTO_GUEST_EXIT_PROMPT_KEY);
  } catch {
    /* ignore */
  }
  emit();
}

/** True when this URL is a "try it free" arrival, e.g. `/read/today?try=1`. */
export function isGuestEntryUrl(search: string): boolean {
  try {
    return new URLSearchParams(search).get(GUEST_ENTRY_PARAM) === '1';
  } catch {
    return false;
  }
}

/**
 * Adopt a `?try=1` arrival into a guest session.
 *
 * Runs at module load as well as from the boot script, because the boot script only runs on a
 * real page load — a client-side navigation into a try link (dev, or a link inside the app)
 * would otherwise land on the shell with no marker and bounce to sign-in.
 */
export function startGuestSessionFromUrl(search: string): boolean {
  if (!isGuestEntryUrl(search)) return false;
  startGuestSession();
  return true;
}

/**
 * Marketing attribution for a guest who converts.
 *
 * A slug, because `sanitizeSignupSlug` in `signup-attribution.ts` drops anything that is not
 * kebab-case rather than forwarding query junk.
 */
export const GUEST_SIGNUP_SOURCE = 'guest';

/**
 * Guest mode, for code that has no hooks to ask with — the fire-and-forget loggers, the sync
 * bootstrap, anything running outside a render.
 *
 * Carries the same precedence rule as `resolvePrototypeShellMode`: a session cookie means a
 * member, and a member is never a guest no matter what marker this browser is holding. Stated
 * again here rather than imported because the React answer arrives a render late, and these
 * callers fire during the first one.
 */
export function isGuestModeActive(): boolean {
  return hasGuestSession() && !hasClerkSessionCookieHint();
}
