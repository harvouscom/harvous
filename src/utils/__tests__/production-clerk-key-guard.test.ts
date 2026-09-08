import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The guard reads `import.meta.env.VITE_CLERK_PUBLISHABLE_KEY`, which Vite inlines at build
 * time, and `window.location.hostname`. Both are stubbed per case, and the module is
 * re-imported each time so the inlined read happens against the current stub.
 */

const RECOVERY_FLAG = 'harvous_dev_clerk_recovery_attempted';
const DEV_KEY = 'pk_test_bXV0dWFsLXNwaWRlci0xOC5jbGVyay5hY2NvdW50cy5kZXYk';
const LIVE_KEY = 'pk_live_Y2xlcmsuaGFydm91cy5jb20k';

let reload: ReturnType<typeof vi.fn>;
let unregister: ReturnType<typeof vi.fn>;
let cacheDelete: ReturnType<typeof vi.fn>;

function setHost(hostname: string) {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { hostname, reload },
  });
}

function setKey(key: string) {
  vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', key);
}

async function runGuard() {
  const mod = await import('../production-clerk-key-guard');
  return mod.enforceProductionClerkKey();
}

/** The guard's purge is async; let the microtask chain settle before asserting. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  vi.resetModules();
  reload = vi.fn();
  unregister = vi.fn().mockResolvedValue(true);
  cacheDelete = vi.fn().mockResolvedValue(true);
  sessionStorage.clear();
  document.body.innerHTML = '<div id="root"></div>';

  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { getRegistrations: vi.fn().mockResolvedValue([{ unregister }]) },
  });
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: { keys: vi.fn().mockResolvedValue(['harvous-cache-v1']), delete: cacheDelete },
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('enforceProductionClerkKey', () => {
  it('lets a live-key bundle boot on a production host', async () => {
    setHost('app.harvous.com');
    setKey(LIVE_KEY);
    expect(await runGuard()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('lets a dev-key bundle boot on staging and localhost', async () => {
    for (const host of ['new.harvous.com', 'localhost', 'harvous-app-staging.harvous.workers.dev']) {
      vi.resetModules();
      setHost(host);
      setKey(DEV_KEY);
      expect(await runGuard()).toBe(false);
    }
    expect(reload).not.toHaveBeenCalled();
  });

  it('purges the worker and caches, then reloads once, for a dev key on a production host', async () => {
    setHost('app.harvous.com');
    setKey(DEV_KEY);

    expect(await runGuard()).toBe(true);
    await settle();

    expect(unregister).toHaveBeenCalledTimes(1);
    expect(cacheDelete).toHaveBeenCalledWith('harvous-cache-v1');
    expect(reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(RECOVERY_FLAG)).not.toBeNull();
  });

  it('guards status.harvous.com too — same Worker, same build', async () => {
    setHost('status.harvous.com');
    setKey(DEV_KEY);
    expect(await runGuard()).toBe(true);
    await settle();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('shows the recovery screen instead of reloading again after one failed attempt', async () => {
    sessionStorage.setItem(RECOVERY_FLAG, '1');
    setHost('app.harvous.com');
    setKey(DEV_KEY);

    expect(await runGuard()).toBe(true);
    await settle();

    expect(reload).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('out-of-date copy');
    expect(document.getElementById('harvous-dev-key-reload')).not.toBeNull();
  });

  it('re-arms the one-shot recovery once a good bundle runs', async () => {
    sessionStorage.setItem(RECOVERY_FLAG, '1');
    setHost('app.harvous.com');
    setKey(LIVE_KEY);

    expect(await runGuard()).toBe(false);
    expect(sessionStorage.getItem(RECOVERY_FLAG)).toBeNull();
  });

  it('does not reload when attempts cannot be tracked, so storage failure cannot loop', async () => {
    // jsdom's sessionStorage does not dispatch through Storage.prototype, so replace the
    // object itself — this is what a browser in private mode with storage blocked looks like.
    const realStorage = Object.getOwnPropertyDescriptor(window, 'sessionStorage');
    const blocked = () => {
      throw new Error('storage blocked');
    };
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: { getItem: blocked, setItem: blocked, removeItem: blocked },
    });
    setHost('app.harvous.com');
    setKey(DEV_KEY);

    expect(await runGuard()).toBe(true);
    await settle();

    expect(reload).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('out-of-date copy');
    if (realStorage) Object.defineProperty(window, 'sessionStorage', realStorage);
  });

  it('purges and reloads when the recovery screen button is pressed', async () => {
    sessionStorage.setItem(RECOVERY_FLAG, '1');
    setHost('app.harvous.com');
    setKey(DEV_KEY);
    await runGuard();

    document.getElementById('harvous-dev-key-reload')!.click();
    await settle();

    expect(sessionStorage.getItem(RECOVERY_FLAG)).toBeNull();
    expect(unregister).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
