/**
 * Where a tapped notification was going, kept until someone is signed in to arrive there.
 *
 * A tap while signed out bounces through `/sign-in?redirect_url=…`, and `redirect_url` is the
 * primary carrier. It is also the only one, and it lives in a URL that more than one path drops:
 * the 401 bounce used to send a bare `/sign-in`, an iOS Home Screen app can relaunch onto
 * whatever page it last showed, and the service worker's parked entry is cleared the moment the
 * router acts on it. Any of those landed you on Home with the notification forgotten.
 *
 * So when a sign-in bounce leaves a page a tap just opened, the destination is also written
 * here (`rememberIfNotificationTap`), in localStorage because sessionStorage does not survive a
 * PWA relaunch. `PendingAuthRedirectBridge` replays it once signed in, and only from the places
 * a lost destination leaves you: Home or an auth page. Anywhere else means you either arrived
 * or chose to go somewhere, and the entry is dropped.
 */
import { postAuthRedirectPath } from '../utils/post-auth-redirect';

const STORAGE_KEY = 'harvous-notification-return';

/** Long enough for an email code round trip; short enough that it never hijacks a later visit. */
export const NOTIFICATION_RETURN_MAX_AGE_MS = 30 * 60_000;

interface StoredReturn {
  path: string;
  at: number;
}

export function rememberNotificationReturn(rawPath: string, now = Date.now()): void {
  const path = postAuthRedirectPath(rawPath);
  // Home is where a lost destination already lands, so there is nothing to remember.
  if (path === '/') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ path, at: now } satisfies StoredReturn));
  } catch {
    /* storage unavailable: redirect_url still carries the common case */
  }
}

export function peekNotificationReturn(now = Date.now()): string | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredReturn>;
    const age = typeof parsed.at === 'number' ? now - parsed.at : Number.NaN;
    if (
      typeof parsed.path === 'string' &&
      age >= 0 &&
      age <= NOTIFICATION_RETURN_MAX_AGE_MS
    ) {
      const path = postAuthRedirectPath(parsed.path);
      if (path !== '/') return path;
    }
  } catch {
    /* fall through to clear */
  }
  clearNotificationReturn();
  return null;
}

export function clearNotificationReturn(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Where to go after sign-in: an explicit `redirect_url` wins, then a remembered tap, then Home.
 * Lets the auth forms go straight there instead of flashing Home before the bridge corrects it.
 */
export function postAuthDestination(redirectParam: string | null | undefined): string {
  const path = postAuthRedirectPath(redirectParam);
  return path === '/' ? (peekNotificationReturn() ?? '/') : path;
}

export type NotificationReturnDecision = 'navigate' | 'clear' | 'wait';

/**
 * What a signed-in visit should do with a remembered tap.
 *
 * - On an auth page that names its own `redirect_url`, wait: that redirect is about to run and
 *   the next route will decide.
 * - Already at the destination: clear.
 * - On Home or an auth page with nothing to go to: the destination was lost, so go there.
 * - Anywhere else: they went somewhere on purpose. Clear rather than yank them away.
 */
export function notificationReturnDecision(input: {
  current: string;
  pathname: string;
  isHome: boolean;
  hasExplicitRedirect: boolean;
  remembered: string | null;
}): NotificationReturnDecision {
  const { current, pathname, isHome, hasExplicitRedirect, remembered } = input;
  if (!remembered) return 'clear';
  const isAuthPath = /^\/sign-(in|up)(\/|$)/.test(pathname);
  if (isAuthPath && hasExplicitRedirect) return 'wait';
  if (current === remembered) return 'clear';
  if (isHome || isAuthPath) return 'navigate';
  return 'clear';
}
