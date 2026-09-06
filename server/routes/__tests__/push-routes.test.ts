/**
 * Source-contract tests for the push routes and the service worker they talk to.
 *
 * The invariants here are the ones that fail silently in production: a route that forgets its
 * auth gate, a service worker that receives a push and shows nothing (which makes iOS revoke
 * the subscription), or a reminder that can be sent twice for the same day.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const routeBlock = (text: string, signature: string) => {
  const start = text.indexOf(signature);
  expect(start).toBeGreaterThan(-1);
  const next = text.indexOf('app.', start + signature.length);
  return text.slice(start, next > start ? next : undefined);
};

describe('push routes', () => {
  const push = () => source('server/routes/push.ts');

  it('requires a signed-in user to store or remove a subscription', () => {
    expect(routeBlock(push(), "app.post('/api/push/subscribe'")).toContain('requireAuth');
    expect(routeBlock(push(), "app.post('/api/push/unsubscribe'")).toContain('requireAuth');
  });

  it('rate-limits every write path', () => {
    expect(routeBlock(push(), "app.post('/api/push/subscribe'")).toContain("rateLimit('write')");
    expect(routeBlock(push(), "app.post('/api/push/event'")).toContain("rateLimit('write')");
    expect(routeBlock(push(), "app.post('/api/push/send-test'")).toContain("rateLimit('write')");
  });

  it('only accepts https push endpoints', () => {
    // The stored endpoint is a URL the server POSTs to on a schedule; anything else would
    // make this table an outbound request primitive.
    expect(push()).toContain("endpoint.startsWith('https://')");
  });

  it('upserts on the endpoint so a re-subscribe does not fork a second row', () => {
    const block = routeBlock(push(), "app.post('/api/push/subscribe'");
    expect(block).toContain('onConflictDoUpdate');
    expect(block).toContain('target: PushSubscriptions.endpoint');
  });

  it('scopes unsubscribe to the caller and to one device', () => {
    expect(push()).toContain('deleteSubscriptionForUser(auth.userId, endpoint)');
  });

  it('displaces this device\'s stale rows, scoped three ways', () => {
    // A reinstalled Home Screen app leaves its old subscription behind and Apple keeps
    // accepting it, so it never prunes itself. The delete must be scoped by user AND device
    // signature AND "not the row we just wrote" — dropping any one of those would either
    // miss the ghost or take out someone else's device.
    const block = routeBlock(push(), "app.post('/api/push/subscribe'");
    expect(block).toContain('eq(PushSubscriptions.userId, auth.userId)');
    expect(block).toContain('eq(PushSubscriptions.userAgent, userAgent)');
    expect(block).toContain('ne(PushSubscriptions.endpoint, subscription.endpoint)');
    // A null user agent must match nulls rather than comparing to NULL, which never matches.
    expect(block).toContain('isNull(PushSubscriptions.userAgent)');
  });

  it('only lets a user settle their own delivery', () => {
    const block = routeBlock(push(), "app.post('/api/push/event'");
    expect(block).toContain('eq(ReminderDeliveries.userId, auth.userId)');
  });

  it('lets a click override a dismissal but nothing else', () => {
    // Some platforms fire notificationclose alongside notificationclick; without this the
    // close would land first and every tap would be recorded as a dismissal.
    expect(push()).toContain("row.outcome === 'dismissed' && outcome === 'clicked'");
  });

  it('never caches a "not configured yet" answer', () => {
    // Deploy order: if the app ships before the secrets reach the server, a cached false
    // would leave clients unable to subscribe for a day after the keys are actually in
    // place, with nothing on screen to explain it.
    const block = routeBlock(push(), "app.get('/api/push/vapid-public-key'");
    expect(block).toContain("configured ? 'public, max-age=86400' : 'no-store'");
  });

  it('gates the tick trigger on the cron bearer outside development', () => {
    const block = routeBlock(push(), "app.post('/api/push/run-reminders'");
    expect(block).toContain('isCronAuthed(c)');
    expect(block).toContain("process.env.NODE_ENV !== 'production'");
  });

  it('supports a dry run that changes nothing', () => {
    expect(routeBlock(push(), "app.post('/api/push/run-reminders'")).toContain("query('dryRun')");
  });
});

describe('notification tap wiring', () => {
  it('signals router readiness from the root route', () => {
    // The signal has to come from inside the router: navigation handed over by a tap can
    // arrive before the router mounts, when router.navigate would go nowhere.
    expect(source('spa/src/router.tsx')).toContain('markNotificationNavigationReady');
  });

  it('registers the tap listener before render, not from a component', () => {
    // As a lazy chunk it raced the message it exists to receive.
    const main = source('spa/src/main.tsx');
    const init = main.indexOf('initNotificationNavigation()');
    const render = main.indexOf('ReactDOM.createRoot');
    expect(init).toBeGreaterThan(-1);
    expect(init).toBeLessThan(render);
  });

  it('stamps activity on resume, not only on mount', () => {
    // An installed iOS app resumed from background never remounts, so the tick would record
    // every un-tapped reminder as ignored and eventually pause them.
    const layout = source('spa/src/layouts/SimplifiedPrototypeLayout.tsx');
    expect(layout).toContain('stampActiveOnResume');
    expect(layout).toContain("visibilitychange");
  });
});

describe('reminder settings endpoints', () => {
  const user = () => source('server/routes/user.ts');

  it('validates and rate-limits the schedule write, then invalidates the profile', () => {
    const block = routeBlock(user(), "app.post('/api/user/update-reminders'");
    expect(block).toContain('requireAuth');
    expect(block).toContain("rateLimit('write')");
    expect(block).toContain('validateReminderSettingsInput');
    expect(block).toContain("broadcastInvalidation(auth.userId, { type: 'userMetadata:updated' })");
  });

  it('validates the captured timezone against a real IANA zone', () => {
    expect(routeBlock(user(), "app.post('/api/user/update-timezone'")).toContain('isValidIanaTimeZone');
  });

  it('returns the reminder fields on the profile the settings page reads', () => {
    const block = routeBlock(user(), "app.get('/api/user/get-profile'");
    expect(block).toContain('timezone');
    expect(block).toContain('reminderSettings');
  });
});

describe('reminder tick', () => {
  const tick = () => source('server/utils/push-reminders.ts');

  it('claims the local day with a conditional update before sending', () => {
    // The whole double-send guard: a restart, an overlapping tick, or a repeated DST hour
    // must lose this race rather than send twice.
    expect(tick()).toContain('IS DISTINCT FROM');
    expect(tick()).toContain('.returning({ userId: UserMetadata.userId })');
  });

  it('never sends to an account with no timezone', () => {
    expect(tick()).toContain('isNotNull(UserMetadata.timezone)');
  });

  it('only considers accounts with a live subscription', () => {
    expect(tick()).toContain('EXISTS (SELECT 1 FROM');
  });

  it('skips anyone who used the app in the last few hours', () => {
    expect(tick()).toContain('RECENT_ACTIVITY_MS');
    expect(tick()).toContain('recentlyActiveUserIds');
  });

  it('releases the claim when the reminder reached no device', () => {
    expect(tick()).toContain('if (result.sent === 0)');
  });
});

describe('service worker push handlers', () => {
  const sw = () => source('public/sw.js');

  it('always shows a notification for a push', () => {
    // iOS revokes the subscription of any app that receives a push and displays nothing.
    const block = sw().slice(sw().indexOf("addEventListener('push'"));
    expect(block).toContain('self.registration.showNotification');
  });

  it('focuses an existing window before opening a new one', () => {
    const block = sw().slice(sw().indexOf("addEventListener('notificationclick'"));
    expect(block).toContain('includeUncontrolled: true');
    expect(block).toContain('sameOrigin.focus()');
    expect(block).toContain('openWindow');
  });

  it('reports both a click and a dismissal back to the server', () => {
    expect(sw()).toContain("reportNotificationEvent(payload.deliveryId, 'click')");
    expect(sw()).toContain("reportNotificationEvent(payload.deliveryId, 'close')");
  });

  it('re-subscribes when the browser rotates the endpoint', () => {
    expect(sw()).toContain("addEventListener('pushsubscriptionchange'");
    expect(sw()).toContain('pushManager.subscribe');
  });

  it('sends its reports with cookies, since a woken worker has no bearer token', () => {
    expect(sw()).toContain("credentials: 'include'");
  });

  it('caches the notification icons it renders with', () => {
    expect(sw()).toContain("'/images/icons/icon-192.png'");
    expect(sw()).toContain("'/images/icons/badge-96.png'");
  });
});

describe('manifest', () => {
  const manifest = () => JSON.parse(source('public/manifest.json'));

  it('ships maskable icons so Android does not crop the mark', () => {
    const maskable = manifest().icons.filter((icon: { purpose: string }) => icon.purpose === 'maskable');
    expect(maskable.map((icon: { sizes: string }) => icon.sizes).sort()).toEqual(['192x192', '512x512']);
  });

  it('ships a 192 and a 512 for the plain icon purpose', () => {
    const sizes = manifest()
      .icons.filter((icon: { purpose: string }) => icon.purpose === 'any')
      .map((icon: { sizes: string }) => icon.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
  });
});

/*
 * Staging and production are two Workers proxying /api/* to one Fly machine, and the live
 * Clerk cookie reaches both — so enabling reminders on new.harvous.com used to write a row
 * against the developer's real userId, and the displacement delete (keyed on userId+userAgent,
 * not origin) then removed their genuine app.harvous.com subscription.
 */
describe('subscribe refuses an origin the reminders are not sent for', () => {
  const push = () => source('server/routes/push.ts');

  it('judges the Origin before writing anything', () => {
    const text = push();
    const block = routeBlock(text, "app.post('/api/push/subscribe'");
    expect(block).toContain('isSubscribableOrigin(c)');
    // Ordering is the whole point: judged after the insert is a row already written.
    expect(block.indexOf('isSubscribableOrigin(c)')).toBeLessThan(
      block.indexOf('.insert(PushSubscriptions)'),
    );
  });

  it('answers with a code the client can act on, not a bare failure', () => {
    expect(routeBlock(push(), "app.post('/api/push/subscribe'")).toContain("code: 'wrong_origin'");
  });

  it('leaves localhost and non-browser callers alone', () => {
    const text = push();
    // Browsers set Origin on every POST, same-origin included, so a request without one is
    // not a browser — failing those closed would break callers this has no quarrel with.
    expect(text).toContain('if (!origin) return true;');
    expect(text).toContain("hostname === 'localhost'");
  });
});
