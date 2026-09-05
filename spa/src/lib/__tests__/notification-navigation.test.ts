/**
 * The tap-to-route handoff.
 *
 * Two real failures are encoded here. The first shipped to a phone: the service worker posted
 * a message and nothing acted on it, because the listener lived in a lazy chunk that had not
 * loaded when the message arrived. The second is the case that survives fixing the first —
 * a cold launch, where the app cannot be listening at the moment of the tap no matter how
 * eagerly it registers, so the destination has to be parked somewhere it can be collected.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const navigateMock = vi.fn();
vi.mock('../../shims/app-navigate', () => ({ navigate: (path: string) => navigateMock(path) }));

const {
  consumePendingNavigation,
  initNotificationNavigation,
  isPendingNavigationFresh,
  resolveNotificationPath,
} = await import('../notification-navigation');

const PENDING_NAV_KEY = '/__harvous_pending_navigation';

/** Minimal Cache Storage, so the parked-destination path can be driven end to end. */
function installCacheStorage(initial?: { url: string; at: number }) {
  const store = new Map<string, string>();
  if (initial) store.set(PENDING_NAV_KEY, JSON.stringify(initial));

  const cache = {
    put: async (request: Request | string, response: Response) => {
      const key = typeof request === 'string' ? request : request.url;
      store.set(key, await response.text());
    },
    match: async (key: string) => {
      const body = store.get(key);
      return body === undefined ? undefined : new Response(body);
    },
    delete: async (key: string) => store.delete(key),
  };

  vi.stubGlobal('caches', { open: async () => cache });
  return store;
}

beforeEach(() => {
  navigateMock.mockClear();
  vi.stubGlobal('window', {
    location: { origin: 'https://app.harvous.com', pathname: '/', search: '' },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveNotificationPath', () => {
  it('keeps a same-origin path with its query', () => {
    expect(resolveNotificationPath('https://app.harvous.com/read/John/15?t=ESV')).toBe(
      '/read/John/15?t=ESV',
    );
  });

  it('resolves a relative destination against the app', () => {
    expect(resolveNotificationPath('/read/today')).toBe('/read/today');
  });

  it('refuses to send anyone off-site', () => {
    // The destination arrives inside a push payload, which is the one part of this a sender
    // controls. A notification must not be able to navigate the app somewhere else.
    expect(resolveNotificationPath('https://example.com/phish')).toBeNull();
    // Protocol-relative, which reads like a path and is not one.
    expect(resolveNotificationPath('//example.com/phish')).toBeNull();
    expect(resolveNotificationPath('javascript:alert(1)')).toBeNull();
  });

  it('treats a bare string as a path on our own origin, which it is', () => {
    // Not a security hole and not worth rejecting: it resolves against the app and at worst
    // lands on the not-found route.
    expect(resolveNotificationPath('read/today')).toBe('/read/today');
  });
});

describe('isPendingNavigationFresh', () => {
  const now = 1_800_000_000_000;

  it('accepts a tap from moments ago', () => {
    expect(isPendingNavigationFresh(now - 5_000, now)).toBe(true);
  });

  it('rejects one left behind by an earlier session', () => {
    // A parked destination is a statement about what someone just did, not a standing
    // instruction — otherwise a failed launch hijacks the next open days later.
    expect(isPendingNavigationFresh(now - 6 * 60_000, now)).toBe(false);
  });

  it('rejects a timestamp from the future or a missing one', () => {
    expect(isPendingNavigationFresh(now + 60_000, now)).toBe(false);
    expect(isPendingNavigationFresh(undefined, now)).toBe(false);
    expect(isPendingNavigationFresh('yesterday', now)).toBe(false);
  });
});

describe('consumePendingNavigation', () => {
  it('returns a fresh destination and clears it', async () => {
    const store = installCacheStorage({ url: 'https://app.harvous.com/read/today', at: Date.now() });
    await expect(consumePendingNavigation()).resolves.toBe('/read/today');
    // Cleared, so a second launch does not follow the same tap again.
    expect(store.has(PENDING_NAV_KEY)).toBe(false);
  });

  it('clears a stale destination without acting on it', async () => {
    const store = installCacheStorage({
      url: 'https://app.harvous.com/read/today',
      at: Date.now() - 10 * 60_000,
    });
    await expect(consumePendingNavigation()).resolves.toBeNull();
    expect(store.has(PENDING_NAV_KEY)).toBe(false);
  });

  it('is quiet when nothing is parked', async () => {
    installCacheStorage();
    await expect(consumePendingNavigation()).resolves.toBeNull();
  });
});

describe('initNotificationNavigation', () => {
  function stubServiceWorker() {
    const listeners: Array<(event: MessageEvent) => void> = [];
    vi.stubGlobal('navigator', {
      serviceWorker: {
        addEventListener: (_: string, fn: (event: MessageEvent) => void) => listeners.push(fn),
        removeEventListener: () => {},
      },
    });
    vi.stubGlobal('document', {
      visibilityState: 'visible',
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    return listeners;
  }

  it('routes a message from a worker while the app is running', async () => {
    installCacheStorage();
    const listeners = stubServiceWorker();
    initNotificationNavigation();

    listeners[0]!({
      data: { type: 'HARVOUS_NOTIFICATION_NAVIGATE', url: 'https://app.harvous.com/read/today' },
    } as MessageEvent);

    expect(navigateMock).toHaveBeenCalledWith('/read/today');
  });

  it('collects a destination parked before it was listening', async () => {
    // The cold-launch case: the tap that opens the app cannot be received as a message.
    installCacheStorage({ url: 'https://app.harvous.com/read/today', at: Date.now() });
    stubServiceWorker();
    initNotificationNavigation();
    await vi.waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/read/today'));
  });

  it('ignores a message that is not ours', async () => {
    installCacheStorage();
    const listeners = stubServiceWorker();
    initNotificationNavigation();

    listeners[0]!({ data: { type: 'SOMETHING_ELSE', url: '/read/today' } } as MessageEvent);
    listeners[0]!({ data: null } as MessageEvent);

    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('does not navigate when already at the destination', async () => {
    // A tap that opened a new window arrives there on its own; routing again would be a
    // redundant entry in history.
    installCacheStorage({ url: 'https://app.harvous.com/read/today', at: Date.now() });
    vi.stubGlobal('window', {
      location: { origin: 'https://app.harvous.com', pathname: '/read/today', search: '' },
    });
    stubServiceWorker();
    initNotificationNavigation();
    await new Promise((r) => setTimeout(r, 20));
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
