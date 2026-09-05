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
import { reportDiagnosticEvent } from '@/utils/diagnostics-client';

declare const __APP_VERSION__: string;

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

/** Temporary, paired with `PUSH_NAV_DIAGNOSTICS` in public/sw.js. */
const PUSH_NAV_DIAGNOSTICS = true;

type NavigationSource = 'message' | 'boot-peek' | 'visible-peek' | 'drain' | 'ready-recheck';

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
let queuedAt = 0;
let lastHandled: { path: string; at: number } | null = null;

function isNavigateMessage(data: unknown): data is NotificationNavigateMessage {
  if (!data || typeof data !== 'object') return false;
  const { type, url } = data as Record<string, unknown>;
  return type === NOTIFICATION_NAVIGATE_MESSAGE && typeof url === 'string' && url.length > 0;
}

function log(message: string): void {
  if (!PUSH_NAV_DIAGNOSTICS) return;
  reportDiagnosticEvent({
    source: 'client_js',
    severity: 'warning',
    message,
    appVersion: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : null,
  });
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
      // Expired: clear it so it cannot be re-read on every future check.
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

function goTo(path: string, via: NavigationSource): void {
  if (!routerReady) {
    // Held, not dropped, and deliberately not cleared — the parked copy is the only record
    // until something actually navigates.
    queuedPath = path;
    queuedAt = Date.now();
    log(`[push-nav] client queued path=${path} via=${via}`);
    return;
  }

  if (`${window.location.pathname}${window.location.search}` === path) {
    // Arrived on its own, which is what `openWindow` does. Nothing to do but tidy up.
    void clearPendingNavigation();
    return;
  }

  const now = Date.now();
  if (lastHandled && lastHandled.path === path && now - lastHandled.at < DUPLICATE_WINDOW_MS) {
    return;
  }
  lastHandled = { path, at: now };

  /*
   * Logged here, at the call, and never on arrival: `/read/today` is itself a redirect page
   * that loads a chunk and waits on the verse before it moves, so arrival is seconds later
   * and says nothing about whether this fired.
   */
  const waited = queuedAt ? now - queuedAt : 0;
  log(`[push-nav] client navigate path=${path} via=${via} waitedMs=${waited}`);

  /*
   * Imported here rather than at the top, to break a cycle.
   *
   * The router imports this module for its readiness signal, and the navigate shim reads
   * `router` at its own module top — so a static import here closes the loop
   * router → notification-navigation → shim → router. The bytes that buys back are trivial;
   * what it removes is an initialisation-order hazard. This module is imported by main.tsx
   * before render, so under a static import the shim could evaluate while router.tsx is
   * still initialising and capture an undefined `router`.
   *
   * Nothing is fetched at this point: `routerReady` is true, which means the router and its
   * shim are already loaded, so this resolves from memory one microtask later.
   */
  void import('../shims/app-navigate').then((mod) => mod.navigate(path));
  void clearPendingNavigation();
}

function checkPending(via: NavigationSource): void {
  void peekPendingNavigation().then((path) => {
    if (path) goTo(path, via);
  });
}

/**
 * The router has mounted and can be navigated.
 *
 * Called from the root route's component, which mounts once after the first match resolves.
 * The timeout puts the drain strictly after TanStack's own mount effects.
 */
export function markNotificationNavigationReady(): void {
  if (routerReady) return;
  routerReady = true;
  setTimeout(() => {
    if (queuedPath) {
      const path = queuedPath;
      queuedPath = null;
      goTo(path, 'drain');
      return;
    }
    // Covers a destination parked between boot and readiness, which no listener saw.
    checkPending('ready-recheck');
  }, 0);
}

/** Listen for taps, and check for one that happened before we were listening. */
export function initNotificationNavigation(): () => void {
  if (typeof window === 'undefined') return () => {};

  const onMessage = (event: MessageEvent) => {
    if (!isNavigateMessage(event.data)) return;
    const path = resolveNotificationPath(event.data.url);
    if (path) goTo(path, 'message');
  };

  const onVisible = () => {
    if (document.visibilityState === 'visible') checkPending('visible-peek');
  };

  navigator.serviceWorker?.addEventListener('message', onMessage);
  // Starts the client message queue, which addEventListener alone does not, and flushes
  // anything the worker posted before this listener existed.
  navigator.serviceWorker?.startMessages?.();
  document.addEventListener('visibilitychange', onVisible);
  checkPending('boot-peek');

  return () => {
    navigator.serviceWorker?.removeEventListener('message', onMessage);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

/** Test seam: the module holds cross-call state by design. */
export function resetNotificationNavigationForTests(): void {
  routerReady = false;
  queuedPath = null;
  queuedAt = 0;
  lastHandled = null;
}
