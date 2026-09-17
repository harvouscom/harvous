/**
 * Route the app when a notification is tapped.
 *
 * The service worker cannot do this itself. `WindowClient.navigate()` is the call for it and
 * is not implemented on iOS: the window is brought to the front still showing whatever page
 * it was on, so tapping "Sunday's verse" left you on whichever screen you had open.
 *
 * Two handoffs, because neither is sufficient alone:
 *
 *   - a message, for an app already running and listening;
 *   - a Cache Storage entry, for one that is not. A message is delivered once, so on a cold
 *     launch — the tap that matters most, the one that opens the app — it lands on nobody.
 *
 * Three things this file has learned the hard way, each of which broke it:
 *
 *   1. It must load eagerly. As a lazy chunk it raced the message it exists to receive.
 *   2. Reading the parked entry must not delete it. Consuming it before the router could act
 *      threw the destination away with nothing to show for it.
 *   3. `addEventListener('message')` does not start the client message queue. Only assigning
 *      `onmessage` or calling `startMessages()` does, per spec.
 */
import { readServiceWorkerContainer } from '@/utils/storage-security';
import {
  forceShowTodaysPassageToday,
  scrollToTodaysPassage,
  TODAYS_PASSAGE_FOCUS,
} from './votd-today';

export const NOTIFICATION_NAVIGATE_MESSAGE = 'HARVOUS_NOTIFICATION_NAVIGATE';

/** Must match `PENDING_NAV_CACHE` / `PENDING_NAV_KEY` in public/sw.js. */
const PENDING_NAV_CACHE = 'harvous-pending-navigation';
const PENDING_NAV_KEY = '/__harvous_pending_navigation';

/**
 * How recently the tap must have happened for the app to act on it.
 *
 * A parked destination is a statement about what someone just did, not a standing
 * instruction. It is also what makes it safe to read the entry without deleting it: an entry
 * nothing ever drains expires rather than hijacking a launch days later.
 */
const PENDING_NAV_MAX_AGE_MS = 2 * 60_000;

/** The message and the visibility peek can both resolve the same tap. Only act once. */
const DUPLICATE_WINDOW_MS = 5_000;

interface NotificationNavigateMessage {
  type: typeof NOTIFICATION_NAVIGATE_MESSAGE;
  url: string;
}

/**
 * Nothing may navigate before the router has mounted.
 *
 * `initNotificationNavigation` runs before `createRoot`, so a destination can arrive while
 * `router.navigate` would be a no-op. It is held here instead and drained on readiness.
 */
let routerReady = false;
let queuedPath: string | null = null;
let lastHandled: { path: string; at: number } | null = null;

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

/** Read the parked destination without disturbing it. */
export async function peekPendingNavigation(): Promise<string | null> {
  if (typeof caches === 'undefined') return null;
  try {
    const cache = await caches.open(PENDING_NAV_CACHE);
    const response = await cache.match(PENDING_NAV_KEY);
    if (!response) return null;
    const payload = (await response.json()) as { url?: unknown; at?: unknown };
    if (typeof payload.url !== 'string') return null;
    if (!isPendingNavigationFresh(payload.at)) {
      await cache.delete(PENDING_NAV_KEY);
      return null;
    }
    return resolveNotificationPath(payload.url);
  } catch {
    return null;
  }
}

export async function clearPendingNavigation(): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    const cache = await caches.open(PENDING_NAV_CACHE);
    await cache.delete(PENDING_NAV_KEY);
  } catch {
    /* nothing to clear */
  }
}

/** Peek then clear. Kept for callers that genuinely want both. */
export async function consumePendingNavigation(): Promise<string | null> {
  const path = await peekPendingNavigation();
  if (path) await clearPendingNavigation();
  return path;
}

function goTo(path: string): void {
  if (path.includes(`focus=${TODAYS_PASSAGE_FOCUS}`)) {
    forceShowTodaysPassageToday();
  }

  if (!routerReady) {
    queuedPath = path;
    return;
  }

  if (`${window.location.pathname}${window.location.search}` === path) {
    /*
     * Already here, so there is no navigation to carry the reveal — and a tap that appears to do
     * nothing is the report this whole path exists to answer. The flag above has made the row
     * render; take them to it, on the next frame so that render has happened first.
     */
    if (path.includes(`focus=${TODAYS_PASSAGE_FOCUS}`)) {
      requestAnimationFrame(() => scrollToTodaysPassage());
    }
    void clearPendingNavigation();
    return;
  }

  const now = Date.now();
  if (lastHandled && lastHandled.path === path && now - lastHandled.at < DUPLICATE_WINDOW_MS) {
    return;
  }
  lastHandled = { path, at: now };

  void import('../shims/app-navigate').then((mod) => mod.navigate(path));
  void clearPendingNavigation();
}

function checkPending(): void {
  void peekPendingNavigation().then((path) => {
    if (path) goTo(path);
  });
}

export function markNotificationNavigationReady(): void {
  if (routerReady) return;
  routerReady = true;
  setTimeout(() => {
    if (queuedPath) {
      const path = queuedPath;
      queuedPath = null;
      goTo(path);
      return;
    }
    checkPending();
  }, 0);
}

export function initNotificationNavigation(): () => void {
  if (typeof window === 'undefined') return () => {};

  const onMessage = (event: MessageEvent) => {
    if (!isNavigateMessage(event.data)) return;
    const path = resolveNotificationPath(event.data.url);
    if (path) goTo(path);
  };

  const onVisible = () => {
    if (document.visibilityState === 'visible') checkPending();
  };

  const serviceWorker = readServiceWorkerContainer();
  serviceWorker?.addEventListener('message', onMessage);
  serviceWorker?.startMessages?.();
  document.addEventListener('visibilitychange', onVisible);
  checkPending();

  return () => {
    serviceWorker?.removeEventListener('message', onMessage);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

export function resetNotificationNavigationForTests(): void {
  routerReady = false;
  queuedPath = null;
  lastHandled = null;
}
