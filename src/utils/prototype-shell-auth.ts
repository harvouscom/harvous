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
