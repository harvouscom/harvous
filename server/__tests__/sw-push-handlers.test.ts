/**
 * Runs the real `public/sw.js` in a simulated worker scope and drives its push handlers.
 *
 * The source-contract test next door proves the right calls are *present*; this proves they
 * behave. Three failures it is here to catch, all of which are invisible until a reminder
 * goes out to real people:
 *
 *   - a push that shows no notification (iOS responds by revoking the subscription, so the
 *     next send reaches nobody and nothing logs an error),
 *   - a click that opens a second copy of the app instead of focusing the open one,
 *   - a malformed payload taking the handler down, which on some browsers shows the generic
 *     "This site has been updated in the background" notification instead.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Listener = (event: unknown) => void;

interface Harness {
  listeners: Map<string, Listener>;
  shown: Array<{ title: string; options: Record<string, unknown> }>;
  fetches: Array<{ url: string; body: Record<string, unknown> }>;
  badges: string[];
  opened: string[];
  focused: string[];
  navigated: string[];
  posted: unknown[];
  parked: string[];
  windows: Array<{ url: string }>;
}

/**
 * Evaluate sw.js with a stubbed global scope.
 *
 * The file is written for a worker, so it is executed as a function body with `self` and the
 * worker globals passed in rather than imported — which also keeps the fetch/caching half of
 * the file inert, since nothing dispatches those events here.
 */
function loadServiceWorker(options: { windows?: Array<{ url: string }> } = {}): Harness {
  const source = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8');

  const harness: Harness = {
    listeners: new Map(),
    shown: [],
    fetches: [],
    badges: [],
    opened: [],
    focused: [],
    navigated: [],
    posted: [],
    parked: [],
    windows: options.windows ?? [],
  };

  const clientObjects = harness.windows.map((win) => ({
    url: win.url,
    focus: async () => {
      harness.focused.push(win.url);
    },
    // Present, and deliberately recorded rather than acted on: this is the call iOS ignores.
    navigate: async (url: string) => {
      harness.navigated.push(url);
    },
    postMessage: (message: unknown) => {
      harness.posted.push(message);
    },
  }));

  const self = {
    addEventListener: (type: string, listener: Listener) => harness.listeners.set(type, listener),
    location: { origin: 'https://app.harvous.com' },
    registration: {
      showNotification: async (title: string, opts: Record<string, unknown>) => {
        harness.shown.push({ title, options: opts });
      },
      pushManager: {
        subscribe: async () => ({ toJSON: () => ({ endpoint: 'https://push.example/new' }) }),
      },
    },
    clients: {
      matchAll: async () => clientObjects,
      openWindow: async (url: string) => {
        harness.opened.push(url);
      },
      claim: async () => {},
    },
    skipWaiting: () => {},
    caches: {
      open: async () => ({
        put: async (request: { url?: string } | string, response: { text: () => Promise<string> }) => {
          harness.parked.push(await response.text());
        },
        match: async () => undefined,
        delete: async () => true,
      }),
      keys: async () => [],
      match: async () => undefined,
    },
  };

  const navigatorStub = {
    setAppBadge: async (n: number) => {
      harness.badges.push(`set:${n}`);
    },
    clearAppBadge: async () => {
      harness.badges.push('clear');
    },
  };

  const fetchStub = async (url: string, init?: { body?: string }) => {
    harness.fetches.push({ url, body: init?.body ? JSON.parse(init.body) : {} });
    return { ok: true };
  };

  // eslint-disable-next-line no-new-func
  const run = new Function('self', 'navigator', 'fetch', 'caches', 'URL', 'console', source);
  run(self, navigatorStub, fetchStub, self.caches, URL, { log: vi.fn(), warn: vi.fn(), error: vi.fn() });

  return harness;
}

/** Exactly what `buildReminderPayload` produces, so the two halves are tested against one shape. */
const REAL_PAYLOAD = {
  title: "Sunday's verse",
  body: '“For God so loved the world…” — John 3:16 (NET)',
  tag: 'harvous-reminder',
  renotify: false,
  icon: '/images/icons/icon-192.png',
  badge: '/images/icons/badge-96.png',
  data: {
    url: '/read/today',
    kind: 'sunday',
    deliveryId: 'delivery-123',
    sentAt: '2026-09-06T13:00:00.000Z',
  },
  actions: [{ action: 'open', title: 'Open' }],
};

function pushEvent(payload: unknown, waits: Promise<unknown>[]) {
  return {
    data: { json: () => payload },
    waitUntil: (p: Promise<unknown>) => waits.push(p),
  };
}

describe('service worker push handler', () => {
  let harness: Harness;
  let waits: Promise<unknown>[];

  beforeEach(() => {
    harness = loadServiceWorker();
    waits = [];
  });

  it('shows the notification with the payload the server built', async () => {
    harness.listeners.get('push')!(pushEvent(REAL_PAYLOAD, waits));
    await Promise.all(waits);

    expect(harness.shown).toHaveLength(1);
    const [shown] = harness.shown;
    expect(shown!.title).toBe("Sunday's verse");
    expect(shown!.options).toMatchObject({
      body: '“For God so loved the world…” — John 3:16 (NET)',
      icon: '/images/icons/icon-192.png',
      badge: '/images/icons/badge-96.png',
      tag: 'harvous-reminder',
      renotify: false,
    });
    expect(shown!.options.actions).toEqual([{ action: 'open', title: 'Open' }]);
  });

  it('always shows something, even for an empty or unparseable payload', async () => {
    // A push that displays nothing makes iOS revoke the subscription, silently.
    harness.listeners.get('push')!({
      data: {
        json: () => {
          throw new Error('not json');
        },
      },
      waitUntil: (p: Promise<unknown>) => waits.push(p),
    });
    await Promise.all(waits);

    expect(harness.shown).toHaveLength(1);
    expect(harness.shown[0]!.title).toBe('Harvous');
    expect(harness.shown[0]!.options.body).toBeTruthy();
  });

  it('sets the app badge when a reminder arrives', async () => {
    harness.listeners.get('push')!(pushEvent(REAL_PAYLOAD, waits));
    await Promise.all(waits);
    expect(harness.badges).toContain('set:1');
  });
});

describe('service worker notificationclick', () => {
  function clickEvent(waits: Promise<unknown>[], data = REAL_PAYLOAD.data) {
    return {
      notification: { close: vi.fn(), data },
      waitUntil: (p: Promise<unknown>) => waits.push(p),
    };
  }

  it('focuses an already-open Harvous window and asks the app to route', async () => {
    const harness = loadServiceWorker({ windows: [{ url: 'https://app.harvous.com/prototype' }] });
    const waits: Promise<unknown>[] = [];
    harness.listeners.get('notificationclick')!(clickEvent(waits));
    await Promise.all(waits);

    expect(harness.focused).toEqual(['https://app.harvous.com/prototype']);
    expect(harness.posted).toEqual([
      { type: 'HARVOUS_NOTIFICATION_NAVIGATE', url: 'https://app.harvous.com/read/today' },
    ]);
    expect(harness.opened).toEqual([]);
  });

  it('parks the destination for an app that is still booting', async () => {
    // A message is delivered once, to whoever is listening at that instant. On a cold launch
    // that is nobody — which is the tap that matters most, the one that opens the app.
    const harness = loadServiceWorker({ windows: [] });
    const waits: Promise<unknown>[] = [];
    harness.listeners.get('notificationclick')!(clickEvent(waits));
    await Promise.all(waits);

    expect(harness.parked).toHaveLength(1);
    const parked = JSON.parse(harness.parked[0]!);
    expect(parked.url).toBe('https://app.harvous.com/read/today');
    expect(typeof parked.at).toBe('number');
  });

  it('does not rely on WindowClient.navigate, which iOS ignores', async () => {
    // The window came to the front still showing whatever page it was on. Asserted rather
    // than commented, because navigate() is the obvious call to reach for again later.
    const harness = loadServiceWorker({ windows: [{ url: 'https://app.harvous.com/prototype' }] });
    const waits: Promise<unknown>[] = [];
    harness.listeners.get('notificationclick')!(clickEvent(waits));
    await Promise.all(waits);

    expect(harness.navigated).toEqual([]);
  });

  it('reports the click before the worker can be killed', async () => {
    // The report was originally fired with `void` inside waitUntil, and on iOS not one ever
    // arrived: the worker dies when the waitUntil promise settles, taking the fetch with it.
    const harness = loadServiceWorker({ windows: [] });
    const waits: Promise<unknown>[] = [];
    harness.listeners.get('notificationclick')!(clickEvent(waits));
    // Deliberately checked *after* awaiting only what waitUntil was given.
    await Promise.all(waits);

    expect(harness.fetches.map((f) => f.url)).toContain('/api/push/event');
  });

  it('opens a window when none is already there', async () => {
    const harness = loadServiceWorker({ windows: [] });
    const waits: Promise<unknown>[] = [];
    harness.listeners.get('notificationclick')!(clickEvent(waits));
    await Promise.all(waits);

    expect(harness.opened).toEqual(['https://app.harvous.com/read/today']);
  });

  it('ignores a window from another origin rather than messaging it', async () => {
    const harness = loadServiceWorker({ windows: [{ url: 'https://example.com/somewhere' }] });
    const waits: Promise<unknown>[] = [];
    harness.listeners.get('notificationclick')!(clickEvent(waits));
    await Promise.all(waits);

    expect(harness.posted).toEqual([]);
    expect(harness.opened).toEqual(['https://app.harvous.com/read/today']);
  });

  it('clears the badge and reports the click', async () => {
    const harness = loadServiceWorker({ windows: [] });
    const waits: Promise<unknown>[] = [];
    harness.listeners.get('notificationclick')!(clickEvent(waits));
    await Promise.all(waits);

    expect(harness.badges).toContain('clear');
    const report = harness.fetches.find((f) => f.url === '/api/push/event');
    expect(report?.body).toEqual({ deliveryId: 'delivery-123', event: 'click' });
  });

  it('keeps a payload-less notification harmless', async () => {
    const harness = loadServiceWorker({ windows: [] });
    const waits: Promise<unknown>[] = [];
    harness.listeners.get('notificationclick')!({
      notification: { close: vi.fn(), data: undefined },
      waitUntil: (p: Promise<unknown>) => waits.push(p),
    });
    await Promise.all(waits);

    expect(harness.opened).toEqual(['https://app.harvous.com/']);
    expect(harness.fetches).toEqual([]);
  });
});

describe('service worker notificationclose', () => {
  it('reports a dismissal', async () => {
    const harness = loadServiceWorker();
    const waits: Promise<unknown>[] = [];
    harness.listeners.get('notificationclose')!({
      notification: { data: REAL_PAYLOAD.data },
      waitUntil: (p: Promise<unknown>) => waits.push(p),
    });
    await Promise.all(waits);

    expect(harness.fetches[0]?.body).toEqual({ deliveryId: 'delivery-123', event: 'close' });
  });
});

describe('service worker pushsubscriptionchange', () => {
  it('re-subscribes with the old key and tells the server', async () => {
    const harness = loadServiceWorker();
    const waits: Promise<unknown>[] = [];
    harness.listeners.get('pushsubscriptionchange')!({
      oldSubscription: { options: { applicationServerKey: new Uint8Array([1, 2, 3]) } },
      waitUntil: (p: Promise<unknown>) => waits.push(p),
    });
    await Promise.all(waits);

    const call = harness.fetches.find((f) => f.url === '/api/push/subscribe');
    expect(call?.body).toEqual({ subscription: { endpoint: 'https://push.example/new' } });
  });

  it('does nothing when there is no key to re-subscribe with', async () => {
    const harness = loadServiceWorker();
    const waits: Promise<unknown>[] = [];
    harness.listeners.get('pushsubscriptionchange')!({
      oldSubscription: null,
      waitUntil: (p: Promise<unknown>) => waits.push(p),
    });
    await Promise.all(waits);

    expect(harness.fetches).toEqual([]);
  });
});
