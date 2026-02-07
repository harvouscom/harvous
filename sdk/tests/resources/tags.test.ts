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

describe('TagsResource', () => {
  const client = new HarvousClient({
    baseUrl: 'https://api.test',
    token: 'test',
  });

  describe('create', () => {
    it('sends JSON to POST /api/tags/create', async () => {
      mockFetch.mockResolvedValueOnce(ok({ success: true, tag: { id: 'tag_1', name: 'Grace' } }));

      await client.tags.create({ name: 'Grace', color: 'blue' });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.test/api/tags/create');
      expect(options.method).toBe('POST');
      expect(JSON.parse(options.body)).toEqual({ name: 'Grace', color: 'blue' });
    });
  });

  describe('list', () => {
    it('sends GET to /api/tags/list', async () => {
      mockFetch.mockResolvedValueOnce(ok([]));

      await client.tags.list();

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.test/api/tags/list');
      expect(options.method).toBe('GET');
    });
  });

  describe('delete', () => {
    it('sends DELETE to /api/tags/delete', async () => {
      mockFetch.mockResolvedValueOnce(ok({ success: true }));

      await client.tags.delete('tag_1');

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('tagId=tag_1');
      expect(options.method).toBe('DELETE');
    });
  });

  describe('assign', () => {
    it('sends JSON to POST /api/note-tags/assign', async () => {
      mockFetch.mockResolvedValueOnce(ok({ success: true, message: 'ok', relationId: 'r1' }));

      await client.tags.assign({ noteId: 'n1', tagId: 't1' });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.test/api/note-tags/assign');
      expect(JSON.parse(options.body)).toEqual({ noteId: 'n1', tagId: 't1' });
    });
  });

  describe('remove', () => {
    it('sends JSON to POST /api/note-tags/remove', async () => {
      mockFetch.mockResolvedValueOnce(ok({ success: true }));

      await client.tags.remove({ noteId: 'n1', tagId: 't1' });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.test/api/note-tags/remove');
    });
  });
});
