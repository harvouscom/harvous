import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HarvousClient } from '../../src/client.js';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function ok(data: unknown) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(data),
    headers: new Headers({ 'content-type': 'application/json' }),
  };
}

describe('UserResource', () => {
  const client = new HarvousClient({
    baseUrl: 'https://api.test',
    token: 'test',
  });

  describe('profile', () => {
    it('sends GET to /api/user/get-profile', async () => {
      mockFetch.mockResolvedValueOnce(
        ok({ firstName: 'John', lastName: 'Doe', userColor: 'blue', email: 'j@e.com', emailVerified: true, churchName: null, churchCity: null, churchState: null, hasLockPinSet: false }),
      );

      const result = await client.user.profile();

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.test/api/user/get-profile');
      expect(options.method).toBe('GET');
      expect(result.firstName).toBe('John');
    });
  });

  describe('xp', () => {
    it('sends GET to /api/user/xp', async () => {
      mockFetch.mockResolvedValueOnce(
        ok({ seasonalXP: 100, lifetimeXP: 500, totalXP: 500, season: '2026-winter', seasonName: 'Winter 2026', breakdown: {}, backfilled: false }),
      );

      await client.user.xp();

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.test/api/user/xp');
    });

    it('passes season and backfill params', async () => {
      mockFetch.mockResolvedValueOnce(ok({ seasonalXP: 0, lifetimeXP: 0, totalXP: 0, season: '', seasonName: '', breakdown: {}, backfilled: true }));

      await client.user.xp({ season: '2026-winter', backfill: true });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('season=2026-winter');
      expect(url).toContain('backfill=true');
    });
  });
});
