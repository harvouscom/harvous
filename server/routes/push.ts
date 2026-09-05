/**
 * Web push subscription management, outcome reporting, and the reminder tick trigger.
 *
 * Two of these are called by the service worker rather than the app, which is why they are
 * written to work with only a cookie: a worker woken by a push has no Clerk token to attach.
 * `clerkAuth` already accepts the `__session` cookie, so nothing special is needed here, but
 * see the note on `/api/push/event` about why it is written to fail quietly.
 */
import { Hono, type Context } from 'hono';
import crypto from 'node:crypto';
import {
  and,
  db,
  desc,
  eq,
  first,
  isNull,
  ne,
  PushSubscriptions,
  ReminderDeliveries,
  UserMetadata,
} from '../db';
import { now as dbNow } from '../db/dates';
import { getAuth, getAuthenticatedAuth, requireAuth } from '../middleware/auth';
import { handleAPIError } from '@/utils/error-handling';
import { rateLimit } from '@/utils/rate-limit';
import { buildReminderPayload } from '../utils/reminder-payload';
import {
  localPartsFor,
  recordTestDelivery,
  runReminderTick,
} from '../utils/push-reminders';
import { isPushRemindersSchemaMissing } from '../utils/pg-undefined-relation';
import { isValidIanaTimeZone } from '../utils/votd-local-date';
import {
  countSubscriptionsForUser,
  deleteSubscriptionForUser,
  isPushConfigured,
  sendToUser,
  vapidPublicKey,
} from '../utils/web-push-client';

const app = new Hono();

/**
 * Bearer-secret cron auth, set by `clerkAuth` for VOTD_CRON_SECRET or PUSH_REMINDER_CRON_SECRET.
 * Read through a plain `Context` because the app instance's Variables map does not declare it —
 * the same shape `server/routes/votd.ts` uses for the identical check.
 */
function isCronAuthed(c: Context): boolean {
  return c.get('cronAuthed') === true;
}

/** Push endpoints are long, but not arbitrarily so — a bound keeps a bad client from filling a column. */
const MAX_ENDPOINT_LENGTH = 2048;
/** One test send a minute per account. Enough to check the plumbing, not enough to be a channel. */
const TEST_SEND_COOLDOWN_MS = 60_000;
const lastTestSendAt = new Map<string, number>();

interface SubscriptionBody {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
}

function readSubscription(raw: unknown): { endpoint: string; p256dh: string; auth: string } | null {
  if (!raw || typeof raw !== 'object') return null;
  const { endpoint, keys } = raw as SubscriptionBody;
  if (typeof endpoint !== 'string' || endpoint.length === 0 || endpoint.length > MAX_ENDPOINT_LENGTH) {
    return null;
  }
  // https only: a push endpoint is a URL we will POST to on a schedule, and anything else is
  // either a mistake or someone using this table as an outbound request primitive.
  if (!endpoint.startsWith('https://')) return null;
  const p256dh = keys?.p256dh;
  const auth = keys?.auth;
  if (typeof p256dh !== 'string' || !p256dh || typeof auth !== 'string' || !auth) return null;
  if (p256dh.length > 256 || auth.length > 256) return null;
  return { endpoint, p256dh, auth };
}

// ─── GET /api/push/vapid-public-key ──────────────────────────────────────────
// Public by design: it is the *public* half of the VAPID pair, and the client needs it before
// it can subscribe. Cached for a day — it changes only when the keys are rotated.

app.get('/api/push/vapid-public-key', (c) => {
  const key = vapidPublicKey();
  c.res.headers.set('Cache-Control', 'public, max-age=86400');
  return c.json({ publicKey: key, configured: isPushConfigured() });
});

// ─── POST /api/push/subscribe ────────────────────────────────────────────────

app.post('/api/push/subscribe', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = await c.req.json();
    const subscription = readSubscription(body?.subscription);
    if (!subscription) return c.json({ error: 'Invalid subscription' }, 400);

    const userAgent =
      typeof body?.userAgent === 'string' ? body.userAgent.slice(0, 512) : c.req.header('User-Agent')?.slice(0, 512) ?? null;

    await db
      .insert(PushSubscriptions)
      .values({
        id: crypto.randomUUID(),
        userId: auth.userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh,
        auth: subscription.auth,
        userAgent,
        createdAt: dbNow(),
        lastSuccessAt: null,
        failCount: 0,
      })
      // Same browser re-subscribing, or a shared device now signed in as someone else. The
      // endpoint is the identity, so the row follows the current signer rather than forking.
      .onConflictDoUpdate({
        target: PushSubscriptions.endpoint,
        set: {
          userId: auth.userId,
          p256dh: subscription.p256dh,
          auth: subscription.auth,
          userAgent,
          failCount: 0,
        },
      });

    /*
     * Drop this device's earlier rows.
     *
     * Deleting a Home Screen app and re-adding it leaves the old subscription behind, and
     * Apple's push service keeps accepting sends to it — so it never 404s, never prunes, and
     * every reminder goes out twice forever.
     *
     * The scope is evidential rather than a guess: this request is the one moment the server
     * has proof that a live browser holds this endpoint on this device, and the rows being
     * displaced have produced no such proof. It is still a signature match, so two identical
     * phones on one account will evict each other; `RESYNC_INTERVAL_MS` on the client is six
     * hours so the loser re-registers within a quarter day. That bounds the worst case to
     * "one of two phones may miss one reminder", against a guaranteed duplicate for everyone.
     */
    const displaced = await db
      .delete(PushSubscriptions)
      .where(
        and(
          eq(PushSubscriptions.userId, auth.userId),
          userAgent === null
            ? isNull(PushSubscriptions.userAgent)
            : eq(PushSubscriptions.userAgent, userAgent),
          ne(PushSubscriptions.endpoint, subscription.endpoint),
        ),
      )
      .returning({ id: PushSubscriptions.id });
    if (displaced.length > 0) {
      console.log(
        `[push] subscribe displaced ${displaced.length} stale subscription(s) for the same device`,
      );
    }

    // The subscribe tap is the one moment we are certain the user is at a device in their own
    // timezone, so capture it here too rather than relying on the shell's sync having run.
    const timezone = typeof body?.timezone === 'string' ? body.timezone.trim() : '';
    if (timezone && isValidIanaTimeZone(timezone)) {
      await db
        .update(UserMetadata)
        .set({ timezone, updatedAt: dbNow() })
        .where(eq(UserMetadata.userId, auth.userId));
    }

    const deviceCount = await countSubscriptionsForUser(auth.userId);
    return c.json({ success: true, deviceCount });
  } catch (error) {
    if (isPushRemindersSchemaMissing(error)) {
      return c.json(
        { error: 'Reminders are not set up on this server yet.', code: 'SCHEMA_NOT_READY' },
        503,
      );
    }
    const e = handleAPIError(error, { endpoint: '/api/push/subscribe', action: 'push_subscribe' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── POST /api/push/unsubscribe ──────────────────────────────────────────────
// This device only. The schedule stays: turning notifications off on a laptop should not
// silently turn them off on a phone.

app.post('/api/push/unsubscribe', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = await c.req.json();
    const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : '';
    if (!endpoint) return c.json({ error: 'Missing endpoint' }, 400);

    await deleteSubscriptionForUser(auth.userId, endpoint);
    const deviceCount = await countSubscriptionsForUser(auth.userId);
    return c.json({ success: true, deviceCount });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/push/unsubscribe', action: 'push_unsubscribe' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── POST /api/push/event ────────────────────────────────────────────────────
// Called by the service worker when a notification is clicked or dismissed.
//
// Written to fail quietly on purpose. It runs inside a `waitUntil` in a worker the browser
// may kill at any moment, and the reader is meanwhile being navigated to the deep link — an
// error here must never be something they can see. A missed report simply means the next
// tick resolves that delivery by attribution instead.

app.post('/api/push/event', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = await c.req.json();
    const deliveryId = typeof body?.deliveryId === 'string' ? body.deliveryId : '';
    const event = body?.event;
    if (!deliveryId || (event !== 'click' && event !== 'close')) {
      return c.json({ success: false }, 400);
    }

    const outcome = event === 'click' ? 'clicked' : 'dismissed';
    const row = first(
      await db
        .select({ id: ReminderDeliveries.id, outcome: ReminderDeliveries.outcome })
        .from(ReminderDeliveries)
        .where(and(eq(ReminderDeliveries.id, deliveryId), eq(ReminderDeliveries.userId, auth.userId)))
        .limit(1),
    );
    if (!row) return c.json({ success: false }, 404);

    // First outcome wins, with one exception: a tap after a dismissal is still a tap. Some
    // platforms fire `notificationclose` alongside `notificationclick`, and letting the close
    // stand would turn every click into a dismissal.
    if (row.outcome && !(row.outcome === 'dismissed' && outcome === 'clicked')) {
      return c.json({ success: true, unchanged: true });
    }

    await db
      .update(ReminderDeliveries)
      .set({ outcome, outcomeAt: dbNow(), outcomeSource: 'sw' })
      .where(eq(ReminderDeliveries.id, deliveryId));

    return c.json({ success: true });
  } catch {
    // Deliberately not handleAPIError: see the block comment above.
    return c.json({ success: false }, 200);
  }
});

// ─── POST /api/push/send-test ────────────────────────────────────────────────

app.post('/api/push/send-test', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    if (!isPushConfigured()) {
      return c.json({ error: 'Push is not configured on this server', code: 'PUSH_UNCONFIGURED' }, 503);
    }

    const last = lastTestSendAt.get(auth.userId) ?? 0;
    const nowMs = Date.now();
    if (nowMs - last < TEST_SEND_COOLDOWN_MS) {
      return c.json(
        { error: 'Give it a minute before sending another test.', code: 'RATE_LIMIT_EXCEEDED' },
        429,
        { 'Retry-After': String(Math.ceil((TEST_SEND_COOLDOWN_MS - (nowMs - last)) / 1000)) },
      );
    }
    lastTestSendAt.set(auth.userId, nowMs);

    const meta = first(
      await db
        .select({ timezone: UserMetadata.timezone })
        .from(UserMetadata)
        .where(eq(UserMetadata.userId, auth.userId))
        .limit(1),
    );
    const sentAt = new Date();
    const parts = localPartsFor(meta?.timezone ?? 'UTC', sentAt);

    const built = await buildReminderPayload(auth.userId, { kind: 'test', now: sentAt });
    const deliveryId = await recordTestDelivery({
      userId: auth.userId,
      variant: built.variant,
      sentAt,
      localDate: parts.localDate,
      localHour: parts.hour,
      deviceCount: 0,
    });
    built.payload.data.deliveryId = deliveryId;

    const result = await sendToUser(auth.userId, built.payload);
    await db
      .update(ReminderDeliveries)
      .set({ deviceCount: result.sent })
      .where(eq(ReminderDeliveries.id, deliveryId));

    return c.json({ success: true, ...result });
  } catch (error) {
    if (isPushRemindersSchemaMissing(error)) {
      return c.json(
        { error: 'Reminders are not set up on this server yet.', code: 'SCHEMA_NOT_READY' },
        503,
      );
    }
    const e = handleAPIError(error, { endpoint: '/api/push/send-test', action: 'push_send_test' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── POST /api/push/run-reminders ────────────────────────────────────────────
// The tick, on demand. Fly's always-on machine runs it hourly by itself; this exists for the
// dry run, for local development (where the scheduler never starts), and as a manual retry
// after an outage.

app.post('/api/push/run-reminders', async (c) => {
  try {
    const isDev = process.env.NODE_ENV !== 'production';
    if (!isCronAuthed(c) && !isDev) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const dryRun = c.req.query('dryRun') === '1';
    const atParam = c.req.query('at');
    const at = atParam ? new Date(atParam) : new Date();
    if (Number.isNaN(at.getTime())) return c.json({ error: 'Invalid `at`' }, 400);

    const summary = await runReminderTick({ now: at, dryRun });
    return c.json({ success: true, ...summary });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/push/run-reminders', action: 'push_run_reminders' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── GET /api/push/status ────────────────────────────────────────────────────
// What the settings page needs that get-profile does not carry: how many devices, and the
// one honest line about how the last few reminders landed.

app.get('/api/push/status', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const deviceCount = await countSubscriptionsForUser(auth.userId);
    const recent = await db
      .select({
        kind: ReminderDeliveries.kind,
        variant: ReminderDeliveries.variant,
        outcome: ReminderDeliveries.outcome,
        sentAt: ReminderDeliveries.sentAt,
      })
      .from(ReminderDeliveries)
      .where(eq(ReminderDeliveries.userId, auth.userId))
      .orderBy(desc(ReminderDeliveries.sentAt))
      .limit(16);

    const { summarizeRecentDeliveries } = await import('../utils/reminder-policy');
    const summary = summarizeRecentDeliveries(
      recent.map((row) => ({
        kind: row.kind,
        variant: row.variant,
        outcome: (row.outcome ?? null) as never,
        sentAt: row.sentAt,
      })),
    );

    const pending = recent.filter((row) => row.outcome === null).length;
    c.res.headers.set('Cache-Control', 'private, no-store');
    return c.json({
      configured: isPushConfigured(),
      deviceCount,
      recentSummary: summary,
      pending,
    });
  } catch (error) {
    // Deployed, not yet migrated. Reminders are optional chrome — reporting "no devices"
    // lets the settings page render its own explanation instead of an error toast.
    if (isPushRemindersSchemaMissing(error)) {
      c.res.headers.set('Cache-Control', 'private, no-store');
      return c.json({ configured: false, deviceCount: 0, recentSummary: null, pending: 0 });
    }
    const e = handleAPIError(error, { endpoint: '/api/push/status', action: 'push_status' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

export default app;
