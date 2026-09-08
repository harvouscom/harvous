import { afterEach, describe, expect, it, vi } from 'vitest';
import { cachedAdminDashboard, clearAdminDashboardCache } from '../admin-dashboard-cache';

describe('cachedAdminDashboard', () => {
  afterEach(() => {
    clearAdminDashboardCache();
  });

  it('computes once for a fresh key', async () => {
    let calls = 0;
    const load = async () => {
      calls += 1;
      return { n: calls };
    };

    await expect(cachedAdminDashboard('pulse:7', load, 10_000)).resolves.toEqual({ n: 1 });
    await expect(cachedAdminDashboard('pulse:7', load, 10_000)).resolves.toEqual({ n: 1 });
    expect(calls).toBe(1);
  });

  it('coalesces concurrent misses onto one load', async () => {
    let calls = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const load = async () => {
      calls += 1;
      await gate;
      return { n: calls };
    };

    const first = cachedAdminDashboard('usage:14', load, 10_000);
    const second = cachedAdminDashboard('usage:14', load, 10_000);
    release();
    await expect(Promise.all([first, second])).resolves.toEqual([{ n: 1 }, { n: 1 }]);
    expect(calls).toBe(1);
  });

  it('serves stale data while a refresh is in flight', async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const load = async () => {
        calls += 1;
        return { n: calls };
      };

      await expect(cachedAdminDashboard('pulse:30', load, 1_000)).resolves.toEqual({ n: 1 });
      await vi.advanceTimersByTimeAsync(1_001);
      await expect(cachedAdminDashboard('pulse:30', load, 1_000)).resolves.toEqual({ n: 1 });
      await Promise.resolve();
      await Promise.resolve();
      expect(calls).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
