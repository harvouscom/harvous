/**
 * Sending a Web Push message, and keeping the subscription table honest while doing it.
 *
 * A push subscription is a thing the *browser* owns, and it dies quietly: the user clears
 * site data, the browser garbage-collects an app they stopped opening, the push service
 * rotates an endpoint. None of that reaches us as an event — the only way to learn is to
 * send and read the status code. So delivery and pruning are the same function here rather
 * than a send path plus a cleanup job that would never agree with it.
 *
 * 404/410 from the push service means "this endpoint is gone, permanently". Anything else is
 * a maybe — a timeout, a 500 at the push service — and gets a strike instead of a delete,
 * because deleting a live subscription silently unsubscribes someone who never asked to be.
 */
import webpush, { type PushSubscription as WebPushSubscription } from 'web-push';
import { and, db, eq, PushSubscriptions } from '../db';
import { now } from '../db/dates';

/** Consecutive soft failures before an endpoint is treated as dead. */
const MAX_FAIL_COUNT = 5;

export interface ReminderNotificationPayload {
  title: string;
  body: string;
  tag: string;
  renotify: false;
  icon: string;
  badge: string;
  data: {
    url: string;
    kind: string;
    deliveryId: string | null;
    sentAt: string;
  };
  actions: Array<{ action: string; title: string }>;
}

export interface SubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type SendResult = 'ok' | 'gone' | 'failed';

let configured = false;

/**
 * Whether push is set up on this deploy. Every caller checks first: without VAPID keys the
 * feature is simply off, which must read as "not configured" in a log line rather than as a
 * throw inside the hourly tick.
 */
export function isPushConfigured(): boolean {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY?.trim() &&
      process.env.VAPID_PRIVATE_KEY?.trim() &&
      process.env.VAPID_SUBJECT?.trim(),
  );
}

export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null;
}

function ensureConfigured(): void {
  if (configured) return;
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) {
    throw new Error('VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT must be set');
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

function statusCodeOf(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const code = (error as { statusCode?: unknown }).statusCode;
  return typeof code === 'number' ? code : null;
}

async function markSuccess(id: string): Promise<void> {
  await db
    .update(PushSubscriptions)
    .set({ lastSuccessAt: now(), failCount: 0 })
    .where(eq(PushSubscriptions.id, id));
}

async function markFailure(id: string, failCount: number): Promise<void> {
  const next = failCount + 1;
  if (next >= MAX_FAIL_COUNT) {
    await db.delete(PushSubscriptions).where(eq(PushSubscriptions.id, id));
    return;
  }
  await db.update(PushSubscriptions).set({ failCount: next }).where(eq(PushSubscriptions.id, id));
}

/**
 * Send to one subscription, then record what the push service said about it.
 *
 * TTL is four hours: a reminder is about a particular morning, and a push service holding it
 * for a phone that comes back online on Tuesday evening would deliver "Sunday's verse" two
 * days late. Better to drop it.
 */
export async function sendToSubscription(
  row: SubscriptionRow & { failCount?: number },
  payload: ReminderNotificationPayload,
): Promise<SendResult> {
  ensureConfigured();
  const subscription: WebPushSubscription = {
    endpoint: row.endpoint,
    keys: { p256dh: row.p256dh, auth: row.auth },
  };

  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload), {
      TTL: 4 * 60 * 60,
      urgency: 'normal',
    });
    await markSuccess(row.id);
    return 'ok';
  } catch (error) {
    const status = statusCodeOf(error);
    if (status === 404 || status === 410) {
      await db.delete(PushSubscriptions).where(eq(PushSubscriptions.id, row.id));
      return 'gone';
    }
    await markFailure(row.id, row.failCount ?? 0);
    console.warn(
      `[push] send failed status=${status ?? 'none'} endpoint=${row.endpoint.slice(0, 48)}…`,
    );
    return 'failed';
  }
}

export interface FanOutResult {
  sent: number;
  gone: number;
  failed: number;
}

/**
 * Send one payload to every device the user has. Sequential on purpose: a person has two or
 * three subscriptions, and the pruning writes below would otherwise race each other for the
 * same rows.
 */
export async function sendToUser(
  userId: string,
  payload: ReminderNotificationPayload,
): Promise<FanOutResult> {
  const rows = await db
    .select({
      id: PushSubscriptions.id,
      endpoint: PushSubscriptions.endpoint,
      p256dh: PushSubscriptions.p256dh,
      auth: PushSubscriptions.auth,
      failCount: PushSubscriptions.failCount,
    })
    .from(PushSubscriptions)
    .where(eq(PushSubscriptions.userId, userId));

  const result: FanOutResult = { sent: 0, gone: 0, failed: 0 };
  for (const row of rows) {
    const outcome = await sendToSubscription(row, payload);
    if (outcome === 'ok') result.sent += 1;
    else if (outcome === 'gone') result.gone += 1;
    else result.failed += 1;
  }
  return result;
}

/** How many devices this account could be reached on right now. */
export async function countSubscriptionsForUser(userId: string): Promise<number> {
  const rows = await db
    .select({ id: PushSubscriptions.id })
    .from(PushSubscriptions)
    .where(eq(PushSubscriptions.userId, userId));
  return rows.length;
}

export async function deleteSubscriptionForUser(userId: string, endpoint: string): Promise<void> {
  await db
    .delete(PushSubscriptions)
    .where(and(eq(PushSubscriptions.userId, userId), eq(PushSubscriptions.endpoint, endpoint)));
}
