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

describe('ResourcesResource', () => {
  const client = new HarvousClient({
    baseUrl: 'https://api.test',
    token: 'test',
  });

  describe('metadata', () => {
    it('sends JSON to POST /api/resource/metadata', async () => {
      mockFetch.mockResolvedValueOnce(
        ok({ success: true, metadata: { title: 'Article', description: 'Desc', image: '', url: 'https://example.com', siteName: null } }),
      );

      await client.resources.metadata('https://example.com/article');

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.test/api/resource/metadata');
      expect(JSON.parse(options.body)).toEqual({ url: 'https://example.com/article' });
    });
  });

  describe('checkDuplicate', () => {
    it('sends JSON to POST /api/resource/check-duplicate', async () => {
      mockFetch.mockResolvedValueOnce(ok({ exists: false }));

      await client.resources.checkDuplicate('https://example.com');

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.test/api/resource/check-duplicate');
      expect(JSON.parse(options.body)).toEqual({ url: 'https://example.com' });
    });
  });
});
