/**
 * Route the app when a notification is tapped.
 *
 * The service worker cannot do this itself. `WindowClient.navigate()` is the call for it and
 * is not implemented on iOS: the window is brought to the front still showing whatever page
 * it was on, so tapping "Sunday's verse" left you on whichever screen you had open. The
 * worker posts a message instead and the app, which owns a router, does the navigating.
 *
 * Deliberately routes rather than assigning `location.href`. A notification tap on a Home
 * Screen app should feel like moving inside the app, not like it relaunching.
 */
import { navigate } from '../shims/app-navigate';

export const NOTIFICATION_NAVIGATE_MESSAGE = 'HARVOUS_NOTIFICATION_NAVIGATE';

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
 * The message arrives from our own service worker, but the URL inside it came from a push
 * payload, and a payload is the one part of this that is not written by us at send time in
 * any provable way. Resolving against the current origin and refusing anything that lands
 * elsewhere keeps a notification from being able to send someone off-site.
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

/** Listen for taps. Returns a teardown for the caller's effect. */
export function initNotificationNavigation(): () => void {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return () => {};

  const onMessage = (event: MessageEvent) => {
    if (!isNavigateMessage(event.data)) return;
    const path = resolveNotificationPath(event.data.url);
    if (!path) return;
    void navigate(path);
  };

  navigator.serviceWorker.addEventListener('message', onMessage);
  return () => navigator.serviceWorker.removeEventListener('message', onMessage);
}
