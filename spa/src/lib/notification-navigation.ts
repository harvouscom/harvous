/**
 * Route the app when a notification is tapped.
 *
 * The service worker cannot do this itself. `WindowClient.navigate()` is the call for it and
 * is not implemented on iOS: the window is brought to the front still showing whatever page
 * it was on, so tapping "Sunday's verse" left you on whichever screen you had open.
 *
 * Two handoffs, because one is not enough:
 *
 *   - a message, for an app that is already running and listening;
 *   - a Cache Storage entry, for one that is not. A message is delivered once to whoever is
 *     listening at that instant, so on a cold launch — the tap that matters most, the one
 *     that opens the app — it lands on nobody. The entry survives the worker being killed and
 *     the app booting, and is consumed on the way in.
 *
 * Loaded eagerly and kept dependency-free for that reason: as a lazy chunk this raced the
 * message it exists to receive.
 */
import { navigate } from '../shims/app-navigate';

export const NOTIFICATION_NAVIGATE_MESSAGE = 'HARVOUS_NOTIFICATION_NAVIGATE';

/** Must match `PENDING_NAV_CACHE` / `PENDING_NAV_KEY` in public/sw.js. */
const PENDING_NAV_CACHE = 'harvous-pending-navigation';
const PENDING_NAV_KEY = '/__harvous_pending_navigation';

/**
 * How recently the tap must have happened for the app to act on it.
 *
 * A parked destination is a statement about what someone just did, not a standing
 * instruction. Without a window, an entry left behind by a failed launch would hijack the
 * next open — possibly days later, sending someone to a verse that is no longer today's.
 */
const PENDING_NAV_MAX_AGE_MS = 2 * 60_000;

interface NotificationNavigateMessage {
  type: typeof NOTIFICATION_NAVIGATE_MESSAGE;
  url: string;
}

function isNavigateMessage(data: unknown): data is NotificationNavigateMessage {
  if (!data || typeof data !== 'object') return false;
  const { type, url } = data as Record<string, unknown>;
  return type === NOTIFICATION_NAVIGATE_MESSAGE && typeof url === 'string' && url.length > 0;
}

/**
 * Same-origin only.
 *
 * The destination came from a push payload, and a payload is the one part of this not written
 * by us at send time in any provable way. Resolving against the current origin and refusing
 * anything that lands elsewhere keeps a notification from sending someone off-site.
 */
export function resolveNotificationPath(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

/** Whether a parked destination is recent enough to act on. Exported for its test. */
export function isPendingNavigationFresh(at: unknown, now = Date.now()): boolean {
  if (typeof at !== 'number' || !Number.isFinite(at)) return false;
  const age = now - at;
  return age >= 0 && age <= PENDING_NAV_MAX_AGE_MS;
}

/**
 * Take the parked destination, if there is a fresh one. Always clears what it read, so a
 * destination is acted on once and cannot fire again on the next launch.
 */
export async function consumePendingNavigation(): Promise<string | null> {
  if (typeof caches === 'undefined') return null;
  try {
    const cache = await caches.open(PENDING_NAV_CACHE);
    const response = await cache.match(PENDING_NAV_KEY);
    if (!response) return null;
    await cache.delete(PENDING_NAV_KEY);

    const payload = (await response.json()) as { url?: unknown; at?: unknown };
    if (typeof payload.url !== 'string') return null;
    if (!isPendingNavigationFresh(payload.at)) return null;
    return resolveNotificationPath(payload.url);
  } catch {
    return null;
  }
}

function goTo(path: string): void {
  // Already there — a tap that opened a new window arrives at the destination on its own.
  if (`${window.location.pathname}${window.location.search}` === path) return;
  void navigate(path);
}

/** Listen for taps, and check for one that happened before we were listening. */
export function initNotificationNavigation(): () => void {
  if (typeof window === 'undefined') return () => {};

  const checkPending = () => {
    void consumePendingNavigation().then((path) => {
      if (path) goTo(path);
    });
  };

  const onMessage = (event: MessageEvent) => {
    if (!isNavigateMessage(event.data)) return;
    const path = resolveNotificationPath(event.data.url);
    if (!path) return;
    // Clear the parked copy so the two handoffs cannot both fire.
    void consumePendingNavigation();
    goTo(path);
  };

  const onVisible = () => {
    if (document.visibilityState === 'visible') checkPending();
  };

  navigator.serviceWorker?.addEventListener('message', onMessage);
  document.addEventListener('visibilitychange', onVisible);
  checkPending();

  return () => {
    navigator.serviceWorker?.removeEventListener('message', onMessage);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
