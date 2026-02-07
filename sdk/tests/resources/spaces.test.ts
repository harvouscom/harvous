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

describe('SpacesResource', () => {
  const client = new HarvousClient({
    baseUrl: 'https://api.test',
    token: 'test',
  });

  describe('create', () => {
    it('sends FormData to POST /api/spaces/create', async () => {
      mockFetch.mockResolvedValueOnce(
        ok({ success: 'Space created!', space: { id: 'space_1' }, addedNotes: 0, addedThreads: 0 }),
      );

      await client.spaces.create({ title: 'My Space', color: 'blue' });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.test/api/spaces/create');
      expect(options.method).toBe('POST');
      expect(options.body).toBeInstanceOf(FormData);
      expect(options.body.get('title')).toBe('My Space');
    });
  });

  describe('delete', () => {
    it('sends DELETE to /api/spaces/delete', async () => {
      mockFetch.mockResolvedValueOnce(ok({ success: 'ok', spaceId: 'space_1' }));

      await client.spaces.delete('space_1');

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/api/spaces/delete');
      expect(url).toContain('spaceId=space_1');
      expect(options.method).toBe('DELETE');
    });
  });

  describe('addItems', () => {
    it('sends JSON to POST /api/spaces/{id}/add-items', async () => {
      mockFetch.mockResolvedValueOnce(
        ok({ success: true, message: 'ok', updatedNotes: ['n1'], updatedThreads: [] }),
      );

      await client.spaces.addItems('space_1', {
        noteIds: ['n1'],
        threadIds: [],
      });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.test/api/spaces/space_1/add-items');
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');
    });
  });

  describe('removeItems', () => {
    it('sends JSON to POST /api/spaces/{id}/remove-items', async () => {
      mockFetch.mockResolvedValueOnce(
        ok({ success: true, message: 'ok', removedNotes: ['n1'], removedThreads: [] }),
      );

      await client.spaces.removeItems('space_1', { noteIds: ['n1'] });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.test/api/spaces/space_1/remove-items');
      expect(options.method).toBe('POST');
    });
  });
});
