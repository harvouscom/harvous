/**
 * The one door out of guest mode, so every surface offering it offers the same one.
 *
 * There are four places a guest can be asked to make an account — the standing row, the toolbar
 * account control, the checklist's last step, and the exit prompt — and they must agree on three
 * things: where it goes, that the visit is attributed as a guest conversion, and that leaving
 * this way does not trip the exit prompt on the way out.
 */
import { GUEST_ENTRY_PARAM, GUEST_SIGNUP_SOURCE } from './guest-session';

/** Set while the app is navigating to sign-up under its own steam. */
let leaving = false;

/** True when this page is on its way to sign-up because the guest asked it to be. */
export function isLeavingForSignUp(): boolean {
  return leaving;
}

/**
 * `/sign-up`, carrying where to come back to and where they came from.
 *
 * `source=guest` rides the existing marketing-attribution rail — `signup-attribution.ts` reads
 * it off the URL and parks it in a cookie so it survives Clerk's multi-step email-code flow,
 * which is the only reason a conversion this many screens later can still be counted.
 *
 * `redirect_url` rides the query string, and both auth UIs carry it across the email-code step
 * in their own way. On `app.harvous.com`, `new.harvous.com` and `localhost`,
 * `isSiteInspiredAuthHost()` picks `HarvousAuthForm` — a headless form driving `useSignUp()`
 * with its steps in React state, so the URL never leaves `/sign-up?…` and the param is still
 * there when `redirectAfterAuth()` reads it. Any other host (a raw `127.0.0.1`, say) gets
 * `ClerkPrebuiltAuth`, which does route to `/sign-up/verify-email-address` but hands Clerk a
 * `fallbackRedirectUrl` built from the param at mount.
 *
 * `writePendingAuthRedirect` was tried here and is the wrong tool twice over: its allowlist
 * covers join / invite / share / upgrade only, so a reader path is rejected and the call is a
 * silent no-op.
 */
export function guestSignUpHref(): string {
  const params = new URLSearchParams({ source: GUEST_SIGNUP_SOURCE });
  if (typeof window !== 'undefined') {
    // Come back to the chapter they were reading, not to a generic home — but without the
    // `?try=1` that brought them in. Carrying it back would hand a brand-new member a link
    // that re-arms guest mode, which does nothing while they are signed in and hands them an
    // empty local partition the day they sign out.
    const back = new URLSearchParams(window.location.search);
    back.delete(GUEST_ENTRY_PARAM);
    const query = back.toString();
    params.set('redirect_url', `${window.location.pathname}${query ? `?${query}` : ''}`);
  }
  return `/sign-up?${params.toString()}`;
}

/**
 * Mark the app's own outbound navigation to sign-up.
 *
 * Without this the exit prompt fires on the way to the very page it was asking them to visit —
 * the pointer leaves the viewport heading for the address bar, or the tab hides during the
 * cross-page load, and a guest who said yes gets asked again. Mirrors the intent of the
 * existing `sessionStorage['harvousSkipBeforeUnload']` convention used by the upgrade and
 * support links.
 */
export function leaveForSignUp(): void {
  leaving = true;
  try {
    sessionStorage.setItem('harvousSkipBeforeUnload', 'guest-signup');
  } catch {
    /* ignore — the in-memory flag above already covers this page's own prompt */
  }
}
