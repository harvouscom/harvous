import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpClient } from '../src/http.js';
import {
  HarvousAuthError,
  HarvousNotFoundError,
  HarvousRateLimitError,
  HarvousValidationError,
  HarvousNetworkError,
  HarvousError,
} from '../src/errors.js';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  mockFetch.mockReset();
  vi.unstubAllGlobals();
});

function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    text: async () => JSON.stringify(data),
    json: async () => data,
    headers: new Headers({ 'content-type': 'application/json', ...headers }),
  };
}

describe('HttpClient', () => {
  describe('authentication', () => {
    it('sends Bearer token in Authorization header', async () => {
      const http = new HttpClient({ token: 'test-token', baseUrl: 'https://api.test' });
      mockFetch.mockResolvedValueOnce(jsonResponse([]));

      await http.get('/api/test');

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Authorization']).toBe('Bearer test-token');
    });

    it('calls getToken for dynamic token', async () => {
      const getToken = vi.fn().mockResolvedValue('dynamic-token');
      const http = new HttpClient({ getToken, baseUrl: 'https://api.test' });
      mockFetch.mockResolvedValueOnce(jsonResponse([]));

      await http.get('/api/test');

      expect(getToken).toHaveBeenCalled();
      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Authorization']).toBe('Bearer dynamic-token');
    });

    it('omits Authorization header when no token', async () => {
      const http = new HttpClient({ baseUrl: 'https://api.test' });
      mockFetch.mockResolvedValueOnce(jsonResponse([]));

      await http.get('/api/test');

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Authorization']).toBeUndefined();
    });

    it('setToken updates the static token', async () => {
      const http = new HttpClient({ token: 'old', baseUrl: 'https://api.test' });
      http.setToken('new-token');
      mockFetch.mockResolvedValueOnce(jsonResponse([]));

      await http.get('/api/test');

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Authorization']).toBe('Bearer new-token');
    });
  });

  describe('URL construction', () => {
    it('builds URL from base and path', async () => {
      const http = new HttpClient({ baseUrl: 'https://api.test' });
      mockFetch.mockResolvedValueOnce(jsonResponse([]));

      await http.get('/api/notes/recent');

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.test/api/notes/recent');
    });

    it('appends query params', async () => {
      const http = new HttpClient({ baseUrl: 'https://api.test' });
      mockFetch.mockResolvedValueOnce(jsonResponse([]));

      await http.get('/api/notes/recent', { limit: 10, type: 'all' });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('limit=10');
      expect(url).toContain('type=all');
    });

    it('skips undefined query params', async () => {
      const http = new HttpClient({ baseUrl: 'https://api.test' });
      mockFetch.mockResolvedValueOnce(jsonResponse([]));

      await http.get('/api/test', { a: 'yes', b: undefined });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('a=yes');
      expect(url).not.toContain('b=');
    });

    it('strips trailing slash from baseUrl', async () => {
      const http = new HttpClient({ baseUrl: 'https://api.test/' });
      mockFetch.mockResolvedValueOnce(jsonResponse([]));

      await http.get('/api/test');

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.test/api/test');
    });
  });

  describe('HTTP methods', () => {
    it('sends GET requests', async () => {
      const http = new HttpClient({ baseUrl: 'https://api.test' });
      mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

      await http.get('/api/test');

      const [, options] = mockFetch.mock.calls[0];
      expect(options.method).toBe('GET');
    });

    it('sends POST with JSON body', async () => {
      const http = new HttpClient({ baseUrl: 'https://api.test' });
      mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

      await http.post('/api/test', { name: 'test' });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(options.body).toBe('{"name":"test"}');
    });

    it('sends POST with FormData', async () => {
      const http = new HttpClient({ baseUrl: 'https://api.test' });
      mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

      await http.postFormData('/api/test', { title: 'hello', empty: undefined });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.method).toBe('POST');
      expect(options.body).toBeInstanceOf(FormData);
      expect(options.body.get('title')).toBe('hello');
      expect(options.body.has('empty')).toBe(false);
    });

    it('sends DELETE requests', async () => {
      const http = new HttpClient({ baseUrl: 'https://api.test' });
      mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

      await http.del('/api/test', { id: 'abc' });

      const [url, options] = mockFetch.mock.calls[0];
      expect(options.method).toBe('DELETE');
      expect(url).toContain('id=abc');
    });

    it('sends PUT with JSON body', async () => {
      const http = new HttpClient({ baseUrl: 'https://api.test' });
      mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

      await http.put('/api/test', { content: 'updated' });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.method).toBe('PUT');
      expect(options.headers['Content-Type']).toBe('application/json');
    });
  });

  describe('error mapping', () => {
    it('throws HarvousAuthError on 401', async () => {
      const http = new HttpClient({ baseUrl: 'https://api.test' });
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ error: 'Auth required' }, 401),
      );

      await expect(http.get('/api/test')).rejects.toThrow(HarvousAuthError);
    });

    it('throws HarvousNotFoundError on 404', async () => {
      const http = new HttpClient({ baseUrl: 'https://api.test' });
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ error: 'Not found' }, 404),
      );

      await expect(http.get('/api/test')).rejects.toThrow(HarvousNotFoundError);
    });

    it('throws HarvousRateLimitError on 429 with reset time', async () => {
      const http = new HttpClient({ baseUrl: 'https://api.test' });
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ error: 'Rate limited', code: 'RATE_LIMIT_EXCEEDED' }, 429, {
          'x-ratelimit-reset': '1700000000',
        }),
      );

      try {
        await http.get('/api/test');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(HarvousRateLimitError);
        expect((err as HarvousRateLimitError).resetTime).toBe(1700000000);
      }
    });

    it('throws HarvousValidationError on 400', async () => {
      const http = new HttpClient({ baseUrl: 'https://api.test' });
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ error: 'Title too long', code: 'TITLE_TOO_LONG' }, 400),
      );

      try {
        await http.post('/api/test', {});
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(HarvousValidationError);
        expect((err as HarvousValidationError).code).toBe('TITLE_TOO_LONG');
      }
    });

    it('throws HarvousError on 403', async () => {
      const http = new HttpClient({ baseUrl: 'https://api.test' });
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ error: 'Forbidden', code: 'NOTE_LIMIT_EXCEEDED' }, 403),
      );

      try {
        await http.post('/api/test', {});
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(HarvousError);
        expect((err as HarvousError).status).toBe(403);
        expect((err as HarvousError).code).toBe('NOTE_LIMIT_EXCEEDED');
      }
    });
  });

  describe('retry on 5xx', () => {
    it('retries server errors and succeeds', async () => {
      const http = new HttpClient({ baseUrl: 'https://api.test', retries: 2, timeout: 5000 });
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ error: 'Internal' }, 500))
        .mockResolvedValueOnce(jsonResponse({ data: 'ok' }));

      const result = await http.get('/api/test');

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ data: 'ok' });
    });

    it('throws after exhausting retries', async () => {
      const http = new HttpClient({ baseUrl: 'https://api.test', retries: 1, timeout: 5000 });
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ error: 'Down' }, 503))
        .mockResolvedValueOnce(jsonResponse({ error: 'Still down' }, 503));

      await expect(http.get('/api/test')).rejects.toThrow(HarvousError);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('does not retry 4xx errors', async () => {
      const http = new HttpClient({ baseUrl: 'https://api.test', retries: 2 });
      mockFetch.mockResolvedValueOnce(jsonResponse({ error: 'Bad' }, 400));

      await expect(http.post('/api/test', {})).rejects.toThrow(
        HarvousValidationError,
      );
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('timeout', () => {
    it('uses AbortController for timeout', async () => {
      const http = new HttpClient({ baseUrl: 'https://api.test', timeout: 100, retries: 0 });
      mockFetch.mockImplementation(
        () => new Promise((_, reject) => {
          const err = new DOMException('The operation was aborted.', 'AbortError');
          setTimeout(() => reject(err), 50);
        }),
      );

      await expect(http.get('/api/test')).rejects.toThrow(HarvousNetworkError);
    });
  });

  describe('defaults', () => {
    it('uses https://harvous.com as default base URL', async () => {
      const http = new HttpClient({});
      mockFetch.mockResolvedValueOnce(jsonResponse([]));

      await http.get('/api/test');

      const [url] = mockFetch.mock.calls[0];
      expect(url).toStartWith('https://harvous.com');
    });
  });
});
