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
import type { PrototypeShellMode } from '@/utils/prototype-shell-auth';

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
 * The mode the shell actually settled on, published by `useHarvousIdentity`.
 *
 * Null until the first render. Non-React callers below prefer it over guessing, because the two
 * answers diverging is not hypothetical — see `isGuestModeActive`.
 */
let resolvedMode: PrototypeShellMode | null = null;

/** Called by `useHarvousIdentity` so code without hooks can read the same answer. */
export function publishShellMode(mode: PrototypeShellMode): void {
  resolvedMode = mode;
}

/**
 * `__client_uat` is Clerk's "user authenticated at" stamp: a timestamp when signed in, `0` when
 * not. Narrower on purpose than `hasClerkSessionCookieHint`, which also accepts a bare
 * `__session` because painting a shell early is worth a false positive and this is not.
 */
function hasAuthenticatedClerkCookie(): boolean {
  if (typeof document === 'undefined') return false;
  return /(?:^|;\s*)__client_uat=[1-9]/.test(document.cookie);
}

/**
 * Guest mode, for code that has no hooks to ask with — the fire-and-forget loggers, the sync
 * bootstrap, the reader's annotate dock.
 *
 * **It defers to the resolved mode rather than re-deriving one.** This used to ask
 * `hasClerkSessionCookieHint()`, on the reasoning that a session cookie means a member. That
 * hint is deliberately loose — its job is to paint a shell during Clerk's cold start, so it
 * answers true for the mere *presence* of a `__session` cookie. A signed-out browser can carry
 * one alongside `__client_uat=0`, and then this said "not a guest" while `useHarvousIdentity`,
 * which waits for Clerk, said "guest". The checklist never hydrated; worse, the annotate dock
 * would have PATCHed a guest's note to a server that answers 401 rather than saving it here.
 *
 * Before the first render there is no resolved mode, so it falls back to the marker plus the
 * narrower cookie above.
 */
export function isGuestModeActive(): boolean {
  if (resolvedMode) return resolvedMode === 'guest';
  return hasGuestSession() && !hasAuthenticatedClerkCookie();
}
