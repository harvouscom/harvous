import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The check that tells a skew crash from a real one.
 *
 * Every uncertain case must resolve to "not stale": claiming staleness pushes a reload at
 * someone whose actual problem is a bug we should be fixing, and hides it from us while it
 * does so.
 */
describe('isStaleBuild', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  async function load() {
    return (await import('../build-freshness')).isStaleBuild;
  }

  it('is stale when the deployed build id differs from ours', async () => {
    vi.stubGlobal('__BUILD_ID__', 'aaaa1111');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ buildId: 'bbbb2222' }) }),
    );
    expect(await (await load())()).toBe(true);
  });

  it('is not stale when the ids match', async () => {
    vi.stubGlobal('__BUILD_ID__', 'aaaa1111');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ buildId: 'aaaa1111' }) }),
    );
    expect(await (await load())()).toBe(false);
  });

  it('is not stale when this build has no id at all (local build)', async () => {
    vi.stubGlobal('__BUILD_ID__', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await (await load())()).toBe(false);
    // And it does not even ask — there is nothing to compare against.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is not stale when the probe fails, 404s, or answers without an id', async () => {
    vi.stubGlobal('__BUILD_ID__', 'aaaa1111');

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await (await load())()).toBe(false);
    vi.resetModules();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    expect(await (await load())()).toBe(false);
    vi.resetModules();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    expect(await (await load())()).toBe(false);
  });

  it('never lets the probe hang a caller that is holding a crash report open', async () => {
    vi.stubGlobal('__BUILD_ID__', 'aaaa1111');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ buildId: 'a' }) });
    vi.stubGlobal('fetch', fetchMock);
    await (await load())();
    expect(fetchMock.mock.calls[0][1]?.signal).toBeDefined();
  });
});
