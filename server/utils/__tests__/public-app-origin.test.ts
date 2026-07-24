import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { getPublicAppOrigin } from '../public-app-origin';

function mockContext(url: string, headers: Record<string, string> = {}) {
  const app = new Hono();
  let captured = '';
  app.get('/test', (c) => {
    captured = getPublicAppOrigin(c);
    return c.text('ok');
  });
  return {
    async run() {
      const req = new Request(new URL('/test', url).toString(), { headers });
      await app.fetch(req);
      return captured;
    },
  };
}

describe('getPublicAppOrigin', () => {
  it('uses Origin header over API port in dev', async () => {
    const origin = await mockContext('http://localhost:3001/api/spaces/x/invites', {
      Origin: 'http://localhost:4322',
    }).run();
    expect(origin).toBe('http://localhost:4322');
  });

  it('falls back from API port to SPA port when headers are missing', async () => {
    const origin = await mockContext('http://localhost:3001/api/spaces/x/invites').run();
    expect(origin).toBe('http://localhost:4322');
  });

  it('ignores Vite proxy Origin (API port) and falls back to SPA port', async () => {
    const origin = await mockContext('http://localhost:3001/api/spaces/x/invites', {
      Origin: 'http://localhost:3001',
    }).run();
    expect(origin).toBe('http://localhost:4322');
  });

  it('uses Referer when Vite proxy rewrites Origin to the API port', async () => {
    const origin = await mockContext('http://localhost:3001/api/spaces/x/invites', {
      Origin: 'http://localhost:3001',
      Referer: 'http://localhost:4322/',
    }).run();
    expect(origin).toBe('http://localhost:4322');
  });

  it('uses Referer when Origin is absent', async () => {
    const origin = await mockContext('http://localhost:3001/api/spaces/x/invites', {
      Referer: 'http://localhost:4322/settings',
    }).run();
    expect(origin).toBe('http://localhost:4322');
  });
});
