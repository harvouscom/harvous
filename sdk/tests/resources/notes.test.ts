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

describe('NotesResource', () => {
  const client = new HarvousClient({
    baseUrl: 'https://api.test',
    token: 'test',
  });

  describe('create', () => {
    it('sends FormData to POST /api/notes/create', async () => {
      mockFetch.mockResolvedValueOnce(
        ok({ success: 'Note created!', note: { id: 'note_1' }, scriptureResults: [] }),
      );

      await client.notes.create({ content: 'Hello', title: 'Test', threadId: 'thread_1' });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.test/api/notes/create');
      expect(options.method).toBe('POST');
      expect(options.body).toBeInstanceOf(FormData);
      expect(options.body.get('content')).toBe('Hello');
      expect(options.body.get('title')).toBe('Test');
      expect(options.body.get('threadId')).toBe('thread_1');
    });

    it('omits undefined optional fields from FormData', async () => {
      mockFetch.mockResolvedValueOnce(ok({ success: 'Note created!', note: {}, scriptureResults: [] }));

      await client.notes.create({ content: 'Minimal' });

      const [, options] = mockFetch.mock.calls[0];
      const body = options.body as FormData;
      expect(body.get('content')).toBe('Minimal');
      expect(body.has('title')).toBe(false);
      expect(body.has('noteType')).toBe(false);
    });
  });

  describe('get', () => {
    it('sends GET to /api/notes/{id}/details', async () => {
      mockFetch.mockResolvedValueOnce(
        ok({ success: true, note: { id: 'note_1' }, threads: [], allUserThreads: [], comments: [], tags: [], referencingNotes: [] }),
      );

      const result = await client.notes.get('note_1');

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.test/api/notes/note_1/details');
      expect(options.method).toBe('GET');
      expect(result.success).toBe(true);
    });
  });

  describe('recent', () => {
    it('sends GET to /api/notes/recent', async () => {
      mockFetch.mockResolvedValueOnce(ok([]));

      await client.notes.recent();

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.test/api/notes/recent');
    });

    it('passes limit parameter', async () => {
      mockFetch.mockResolvedValueOnce(ok([]));

      await client.notes.recent(10);

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('limit=10');
    });
  });

  describe('updateContent', () => {
    it('sends POST with JSON to /api/notes/{id}/update-content', async () => {
      mockFetch.mockResolvedValueOnce(ok({ success: true, message: 'Updated' }));

      await client.notes.updateContent('note_1', { content: 'New content' });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.test/api/notes/note_1/update-content');
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(JSON.parse(options.body)).toEqual({ content: 'New content' });
    });
  });

  describe('delete', () => {
    it('sends DELETE to /api/notes/delete with noteId param', async () => {
      mockFetch.mockResolvedValueOnce(
        ok({ success: 'Note erased!', noteId: 'note_1', threadId: 'thread_1' }),
      );

      await client.notes.delete('note_1');

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/api/notes/delete');
      expect(url).toContain('noteId=note_1');
      expect(options.method).toBe('DELETE');
    });
  });

  describe('nextId', () => {
    it('sends GET to /api/notes/next-id', async () => {
      mockFetch.mockResolvedValueOnce(ok({ nextNoteId: 42, formattedId: 'N042' }));

      const result = await client.notes.nextId();

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.test/api/notes/next-id');
      expect(result.nextNoteId).toBe(42);
      expect(result.formattedId).toBe('N042');
    });
  });
});
