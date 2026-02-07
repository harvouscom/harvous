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

describe('ScriptureResource', () => {
  const client = new HarvousClient({
    baseUrl: 'https://api.test',
    token: 'test',
  });

  describe('detect', () => {
    it('sends JSON to POST /api/scripture/detect', async () => {
      mockFetch.mockResolvedValueOnce(
        ok({ isScripture: true, references: ['John 3:16'], confidence: 0.95, primaryReference: 'John 3:16', parsedReference: null }),
      );

      const result = await client.scripture.detect('John 3:16 says...');

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.test/api/scripture/detect');
      expect(options.method).toBe('POST');
      expect(JSON.parse(options.body)).toEqual({ text: 'John 3:16 says...' });
      expect(result.isScripture).toBe(true);
    });
  });

  describe('fetchVerse', () => {
    it('sends JSON to POST /api/scripture/fetch-verse', async () => {
      mockFetch.mockResolvedValueOnce(
        ok({ reference: 'John 3:16', book: 'John', chapter: 3, verse: 16, translation: 'NET', text: 'For God so loved...' }),
      );

      await client.scripture.fetchVerse('John 3:16');

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.test/api/scripture/fetch-verse');
      expect(JSON.parse(options.body)).toEqual({ reference: 'John 3:16' });
    });
  });

  describe('checkExisting', () => {
    it('sends JSON to POST /api/scripture/check-existing', async () => {
      mockFetch.mockResolvedValueOnce(
        ok({ exists: false, noteId: null, inThread: false, inUnorganized: false }),
      );

      await client.scripture.checkExisting({ reference: 'Romans 8:28', threadId: 'thread_1' });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.test/api/scripture/check-existing');
      expect(JSON.parse(options.body)).toEqual({ reference: 'Romans 8:28', threadId: 'thread_1' });
    });
  });
});
