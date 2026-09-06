/**
 * The browser half of reminders: what this device can do, and turning it on.
 *
 * The interesting thing here is not the subscribe call, it is `getPushSupport()`. "Can this
 * browser show a notification?" has five different answers and only one of them is a plain
 * yes, so the settings page branches on the answer rather than showing one button that fails
 * differently everywhere:
 *
 *   unsupported       — no service worker or no Push API (older Safari, some in-app browsers).
 *   needs-home-screen — iOS. Apple allows push only for apps added to the Home Screen, so a
 *                       Safari tab must be told to install first rather than shown a button
 *                       that cannot work.
 *   denied            — blocked. The browser will not prompt again; only site settings can undo it.
 *   default           — has never been asked. The only state where a prompt is allowed.
 *   granted           — already on.
 *
 * Deliberately dependency-free and small: the shell imports it for badge clearing and the
 * subscription re-sync, so anything heavy here would land in the eager bundle.
 */
import { reportDiagnosticEvent } from '@/utils/diagnostics-client';
import { api } from './api';
import { isPWA } from '@/utils/content-list-helpers';
import { isIOS } from '@/utils/platform-detect';
import { browserIanaTimeZone } from './votd-today';

export type PushSupport = 'unsupported' | 'needs-home-screen' | 'denied' | 'default' | 'granted';

/**
 * How often a live device re-registers its subscription.
 *
 * Six hours rather than a day because subscribing now displaces the same user's other rows
 * with an identical device signature (see `POST /api/push/subscribe`). Two identical phones
 * on one account therefore evict each other, and this is what bounds that: the evicted one
 * is back within a quarter day, so the cost is at most a single missed reminder rather than
 * a device going quiet. One small POST per device per six hours buys that.
 */
const RESYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;
const RESYNC_STAMP_KEY = 'harvous-push-resync-at';

export function getPushSupport(): PushSupport {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'unsupported';

  /*
   * Truthiness, not `in`. Browsers declare `navigator.serviceWorker` on the prototype but
   * leave it undefined outside a secure context, so `'serviceWorker' in navigator` is true
   * on `http://192.168.x.x` — which is exactly how a phone reaches a dev server on the same
   * network. The `in` form would call that supported and then throw on `serviceWorker.ready`.
   */
  const hasPushApis =
    Boolean(navigator.serviceWorker) &&
    typeof (window as Window & { PushManager?: unknown }).PushManager !== 'undefined' &&
    typeof (window as Window & { Notification?: unknown }).Notification !== 'undefined';

  if (!hasPushApis) {
    // iOS Safari in a tab reports exactly this, and "your browser can't" would be a lie —
    // the same browser can, once the app is on the Home Screen.
    return isIOS() ? 'needs-home-screen' : 'unsupported';
  }
  if (isIOS() && !isPWA()) return 'needs-home-screen';

  const permission = Notification.permission;
  if (permission === 'denied') return 'denied';
  if (permission === 'granted') return 'granted';
  return 'default';
}

/** The VAPID public key, from the build if it is baked in, else from the server. */
async function applicationServerKey(): Promise<Uint8Array | null> {
  const fromEnv = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  const key = fromEnv?.trim() || (await fetchVapidKey());
  return key ? urlBase64ToUint8Array(key) : null;
}

async function fetchVapidKey(): Promise<string | null> {
  try {
    const response = await api.get<{ publicKey: string | null }>('/api/push/vapid-public-key');
    return response.publicKey?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * VAPID keys travel as URL-safe base64; `pushManager.subscribe` wants raw bytes.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(normalized);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

async function postSubscription(subscription: PushSubscription): Promise<number> {
  const response = await api.post<{ deviceCount?: number }>('/api/push/subscribe', {
    subscription: subscription.toJSON(),
    userAgent: navigator.userAgent,
    timezone: browserIanaTimeZone(),
  });
  return response.deviceCount ?? 1;
}

export interface EnableResult {
  ok: boolean;
  support: PushSupport;
  deviceCount?: number;
  error?: string;
}

/**
 * Ask for permission and subscribe. Must be called straight from a click.
 *
 * Browsers require a user gesture for `requestPermission`, and iOS enforces it strictly —
 * calling this from an effect or a timeout silently resolves to `default` and looks like the
 * button did nothing.
 */
export async function enablePushReminders(): Promise<EnableResult> {
  const support = getPushSupport();
  if (support !== 'default' && support !== 'granted') return { ok: false, support };

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { ok: false, support: permission === 'denied' ? 'denied' : 'default' };
  }

  const key = await applicationServerKey();
  if (!key) return { ok: false, support: 'granted', error: 'Push is not configured on the server yet.' };

  try {
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        // Required, and honest: every push we send shows a notification.
        userVisibleOnly: true,
        applicationServerKey: key as BufferSource,
      }));
    const deviceCount = await postSubscription(subscription);
    stampResync();
    return { ok: true, support: 'granted', deviceCount };
  } catch (error) {
    /*
     * Subscribing can fail after permission was granted, and the browser's own words for it
     * are not fit to show anyone — "Registration failed - push service error" is the string
     * Chromium produces. It is also not a rare case: Brave ships with Google's push messaging
     * switched off by default, so every Brave user meets this until they turn it on, and any
     * network that blocks the push endpoint produces the same thing.
     *
     * So the reader gets a sentence they can act on, and the raw text goes where it is
     * useful instead.
     */
    const raw = error instanceof Error ? error.message : String(error);
    reportDiagnosticEvent({
      source: 'client_js',
      severity: 'warning',
      message: `[push-nav] subscribe failed: ${raw}`,
    });
    return {
      ok: false,
      support: 'granted',
      error: 'Your browser would not complete the setup. Some browsers turn push messaging off by default.',
    };
  }
}

/**
 * Stop reminders on this device only.
 *
 * The schedule is untouched on purpose: someone turning notifications off on a work laptop
 * has said nothing about their phone.
 */
export async function disablePushRemindersOnThisDevice(): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe().catch(() => {});
  await api.post('/api/push/unsubscribe', { endpoint }).catch(() => {});
  clearResyncStamp();
}

function stampResync(): void {
  try {
    localStorage.setItem(RESYNC_STAMP_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

function clearResyncStamp(): void {
  try {
    localStorage.removeItem(RESYNC_STAMP_KEY);
  } catch {
    /* ignore */
  }
}

function resyncDue(): boolean {
  try {
    const raw = localStorage.getItem(RESYNC_STAMP_KEY);
    if (!raw) return true;
    return Date.now() - Number(raw) > RESYNC_INTERVAL_MS;
  } catch {
    return true;
  }
}

/**
 * Heal a subscription that drifted, once a day at most.
 *
 * Two things it repairs, both invisible until a reminder fails to arrive: the browser
 * rotated the endpoint while the app was closed (the worker's `pushsubscriptionchange` is
 * the first chance at this, and it does not always fire), and the server pruned the row after
 * a run of failures on a device that has since come back.
 */
export async function syncPushSubscriptionIfGranted(): Promise<void> {
  if (getPushSupport() !== 'granted') return;
  if (!resyncDue()) return;
  const subscription = await currentSubscription().catch(() => null);
  if (!subscription) return;
  try {
    await postSubscription(subscription);
    stampResync();
  } catch {
    /* offline, or mid-auth — the next open tries again */
  }
}

/** Clear the app-icon badge. Safe to call anywhere; unsupported browsers simply have none. */
export function clearAppBadge(): void {
  const nav = navigator as Navigator & { clearAppBadge?: () => Promise<void> };
  if (typeof nav.clearAppBadge === 'function') void nav.clearAppBadge().catch(() => {});
}

/** How many devices this account can be reached on, plus the one line about recent reminders. */
export interface PushStatus {
  configured: boolean;
  deviceCount: number;
  recentSummary: string | null;
  pending: number;
}

export function fetchPushStatus(): Promise<PushStatus> {
  return api.get<PushStatus>('/api/push/status');
}

export interface SendTestResult {
  sent: number;
  gone: number;
  failed: number;
}

export function sendTestReminder(): Promise<SendTestResult> {
  return api.post<SendTestResult>('/api/push/send-test');
}

/**
 * What to say after a test send.
 *
 * Not a device count. "Sent to 2 devices" leads with a number that is easy to get wrong — a
 * reinstalled Home Screen app leaves its old subscription behind, and the push service keeps
 * accepting it — and it answers a question nobody asked at that moment. How many devices are
 * reachable is a considered fact that belongs on the settings row, which states it.
 *
 * What someone actually needs after pressing the button is what to do next, and on iOS that
 * is not obvious: a notification is suppressed while its own app is in the foreground, so
 * staying put looks exactly like the feature being broken.
 */
export function testSendToastMessage(support: PushSupport = getPushSupport()): string {
  const onIosApp = isIOS() && isPWA() && support === 'granted';
  return onIosApp ? 'Sent. Leave Harvous to see it.' : 'Sent. It should appear in a moment.';
}
