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

describe('SearchResource', () => {
  const client = new HarvousClient({
    baseUrl: 'https://api.test',
    token: 'test',
  });

  describe('query', () => {
    it('sends GET to /api/search with query params', async () => {
      mockFetch.mockResolvedValueOnce(
        ok({ results: [], query: 'grace', type: 'all', total: 0 }),
      );

      await client.search.query({ q: 'grace', type: 'notes', limit: 20 });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/api/search');
      expect(url).toContain('q=grace');
      expect(url).toContain('type=notes');
      expect(url).toContain('limit=20');
      expect(options.method).toBe('GET');
    });

    it('only includes provided params', async () => {
      mockFetch.mockResolvedValueOnce(ok({ results: [], query: 'test', type: 'all', total: 0 }));

      await client.search.query({ q: 'test' });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('q=test');
      expect(url).not.toContain('type=');
      expect(url).not.toContain('limit=');
    });
  });
});
