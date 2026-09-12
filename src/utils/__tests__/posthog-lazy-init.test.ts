/**
 * Loading analytics on demand, without losing the identify that arrives first.
 *
 * posthog-js is ~173 KB and was the eager chunk's largest single dependency: a
 * dozen modules import `captureException` from this wrapper, so the whole SDK sat
 * on the critical path for every route. It is fetched inside `initPostHog` now,
 * which took 57.6 KB gzipped off `index.js`.
 *
 * Three things that only break at runtime, so they are asserted here:
 *
 *   - `await import('posthog-js')` hands back a namespace. Reading the wrong key
 *     off it compiles and fails only in a browser.
 *   - The `window.posthog` guard stopped being enough once loading became async —
 *     two mounts can both pass it before either finishes.
 *   - `PostHogBridge` identifies from its own effect and marks the user done
 *     either way, so an identify landing mid-load used to be dropped for the whole
 *     session. The load window is wider now, so it is held and replayed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const init = vi.fn();
const identify = vi.fn();
const capture = vi.fn();

vi.mock('posthog-js', () => ({
  default: {
    init,
    identify,
    capture,
    // `init` reports the instance through `loaded`; the wrapper also assigns the
    // module default straight away, which is the path this exercises.
    __esModule: true,
  },
}));

async function freshModule() {
  vi.resetModules();
  return import('../posthog');
}

beforeEach(() => {
  vi.stubEnv('VITE_ENABLE_POSTHOG_IN_DEV', 'true');
  vi.stubEnv('VITE_PUBLIC_POSTHOG_KEY', 'phc_test_key');
  init.mockClear();
  identify.mockClear();
  capture.mockClear();
  // Assignment, not `delete`: the shared setup defines `window.posthog` as a
  // writable-but-not-configurable mock, so `delete` throws and every test here
  // would start with analytics already "loaded".
  (window as { posthog?: unknown }).posthog = undefined;
});

afterEach(() => {
  vi.unstubAllEnvs();
  (window as { posthog?: unknown }).posthog = undefined;
});

describe('initPostHog', () => {
  it('loads the SDK on demand and publishes it on window', async () => {
    const { initPostHog } = await freshModule();
    expect(window.posthog).toBeFalsy();

    await initPostHog();

    expect(init).toHaveBeenCalledTimes(1);
    expect(init.mock.calls[0][0]).toBe('phc_test_key');
    expect(window.posthog).toBeTruthy();
  });

  it('initialises once across two callers', async () => {
    /*
     * The observable contract — PostHogBridge and PostHogInit both call this on
     * mount — and it holds today.
     *
     * It does **not** prove the `initStarted` guard: with that guard removed both
     * calls still reach the import and `init` is still called once, because under
     * vitest the mocked module resolves without a real await gap. The guard earns
     * its place in a browser, where `await import('posthog-js')` is a network
     * fetch wide enough for two mount effects to pass the `window.posthog` check.
     * Left uncovered rather than asserted falsely.
     */
    const { initPostHog } = await freshModule();
    await Promise.all([initPostHog(), initPostHog()]);
    expect(init).toHaveBeenCalledTimes(1);
  });

  it('replays an identify that arrived while the SDK was loading', async () => {
    const { initPostHog, identifyUser } = await freshModule();

    identifyUser('user_abc', { email: 'reader@example.com' });
    // Nothing to call yet, and nothing thrown.
    expect(identify).not.toHaveBeenCalled();

    await initPostHog();

    expect(identify).toHaveBeenCalledTimes(1);
    expect(identify.mock.calls[0][0]).toBe('user_abc');
    expect(identify.mock.calls[0][1]).toMatchObject({ email: 'reader@example.com' });
  });

  it('drops an event captured before the SDK is there, without throwing', async () => {
    // Events are lossy by design — only the identify is held, because it is the
    // one that would otherwise be lost for the rest of the session.
    const { captureEvent, initPostHog } = await freshModule();
    expect(() => captureEvent('too_early')).not.toThrow();
    expect(capture).not.toHaveBeenCalled();

    await initPostHog();
    captureEvent('after_init');
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls[0][0]).toBe('after_init');
  });
});
