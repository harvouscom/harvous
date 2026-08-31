/**
 * Prototype shell visibility during Clerk cold start.
 *
 * Cookie hint may paint the shell only while Clerk is still loading.
 * After `isLoaded`, trust `isSignedIn` alone — stale cookies must not keep a
 * zombie shell that never redirects and never enables notes/nav.
 */
export function computePrototypeShouldShowShell(
  isLoaded: boolean,
  isSignedIn: boolean | undefined,
  hasSessionCookieHint: boolean,
): boolean {
  if (!isLoaded) return hasSessionCookieHint;
  return Boolean(isSignedIn);
}

/** True when Clerk finished loading and the user is signed out (redirect to sign-in). */
export function shouldRedirectPrototypeToSignIn(
  isLoaded: boolean,
  isSignedIn: boolean | undefined,
): boolean {
  return isLoaded && !isSignedIn;
}

/**
 * Who the shell is being rendered for.
 *
 * - `account` — a real Clerk session. Everything works.
 * - `guest`   — trying Harvous without an account. Reads what is public, writes to this device.
 * - `signed-out` — no session and no guest marker. The shell does not render; redirect to sign-in.
 */
export type PrototypeShellMode = 'account' | 'guest' | 'signed-out';

/**
 * The shell's third state.
 *
 * Kept beside the two predicates above rather than folded into them: those answer "paint or
 * not" and "redirect or not", and both still have call sites that only want that answer. This
 * one answers "for whom", which is what the surfaces below the gate actually branch on.
 *
 * **A real session always wins.** A guest marker is a leftover the moment Clerk reports a
 * session — someone who signed up mid-visit is not a guest with an account, they are an
 * account. Anything else would leave the local-only banner up over synced notes.
 *
 * The cookie hint keeps its old meaning and its old precedence: while Clerk is still loading it
 * is the only evidence of a returning member, so it paints the account shell. A guest marker is
 * consulted only once that hint has come up empty, which is why a returning member who once
 * tried as a guest never flashes the guest row on the way in.
 */
export function resolvePrototypeShellMode(
  isLoaded: boolean,
  isSignedIn: boolean | undefined,
  hasSessionCookieHint: boolean,
  hasGuestSession: boolean,
): PrototypeShellMode {
  if (computePrototypeShouldShowShell(isLoaded, isSignedIn, hasSessionCookieHint)) return 'account';
  return hasGuestSession ? 'guest' : 'signed-out';
}
