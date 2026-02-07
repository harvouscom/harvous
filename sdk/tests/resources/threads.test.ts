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

describe('ThreadsResource', () => {
  const client = new HarvousClient({
    baseUrl: 'https://api.test',
    token: 'test',
  });

  describe('create', () => {
    it('sends FormData to POST /api/threads/create', async () => {
      mockFetch.mockResolvedValueOnce(ok({ success: 'Thread created!', thread: { id: 'thread_1' } }));

      await client.threads.create({ title: 'My Thread', color: 'blue' });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.test/api/threads/create');
      expect(options.method).toBe('POST');
      expect(options.body).toBeInstanceOf(FormData);
      expect(options.body.get('title')).toBe('My Thread');
      expect(options.body.get('color')).toBe('blue');
    });

    it('joins selectedNoteIds with commas', async () => {
      mockFetch.mockResolvedValueOnce(ok({ success: 'ok', thread: {} }));

      await client.threads.create({ selectedNoteIds: ['n1', 'n2', 'n3'] });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.body.get('selectedNoteIds')).toBe('n1,n2,n3');
    });
  });

  describe('list', () => {
    it('sends GET to /api/threads/list', async () => {
      mockFetch.mockResolvedValueOnce(ok([]));

      await client.threads.list();

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.test/api/threads/list');
      expect(options.method).toBe('GET');
    });
  });

  describe('update', () => {
    it('sends FormData to POST /api/threads/update', async () => {
      mockFetch.mockResolvedValueOnce(ok({ success: 'ok', thread: {} }));

      await client.threads.update({ id: 'thread_1', title: 'Updated' });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.test/api/threads/update');
      expect(options.method).toBe('POST');
      expect(options.body.get('threadId')).toBe('thread_1');
      expect(options.body.get('title')).toBe('Updated');
    });
  });

  describe('delete', () => {
    it('sends DELETE to /api/threads/delete', async () => {
      mockFetch.mockResolvedValueOnce(ok({ success: 'ok', threadId: 'thread_1' }));

      await client.threads.delete('thread_1');

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/api/threads/delete');
      expect(url).toContain('threadId=thread_1');
      expect(options.method).toBe('DELETE');
    });
  });

  describe('notes', () => {
    it('sends GET with pagination params', async () => {
      mockFetch.mockResolvedValueOnce(ok({ notes: [], hasMore: false, offset: 0, limit: 20 }));

      await client.threads.notes('thread_1', { offset: 10, limit: 20 });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('/api/threads/thread_1/notes');
      expect(url).toContain('offset=10');
      expect(url).toContain('limit=20');
    });
  });
});
