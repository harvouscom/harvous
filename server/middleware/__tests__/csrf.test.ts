import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

/**
 * The check that guards every /api/* write. It ran disabled for months after false 403s, then
 * came back in observe mode; these pin both modes so flipping CSRF_ENFORCE is the only change
 * between them. See docs/CLOUDFLARE_MIGRATION.md (cleanup step 1).
 */

async function makeApp() {
  vi.resetModules(); // the allowlist is cached per module instance
  const { csrfProtection } = await import('../csrf');
  const app = new Hono();
  app.use('/api/*', csrfProtection);
  app.all('/api/*', (c) => c.json({ ok: true }));
  return app;
}

function send(app: Hono, method: string, path: string, headers: Record<string, string> = {}) {
  return app.request(`https://harvous.fly.dev${path}`, {
    method,
    headers: { Host: 'harvous.fly.dev', ...headers },
  });
}

const savedEnv = { ...process.env };

beforeEach(() => {
  delete process.env.ALLOWED_ORIGINS;
  delete process.env.CSRF_ENFORCE;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...savedEnv };
  vi.restoreAllMocks();
});

describe('csrfProtection, enforcing', () => {
  beforeEach(() => {
    process.env.CSRF_ENFORCE = 'true';
  });

  it.each([
    'https://app.harvous.com',
    'https://new.harvous.com',
    'https://status.harvous.com',
    'https://kids.harvous.com',
  ])('allows a write from %s', async (origin) => {
    const res = await send(await makeApp(), 'POST', '/api/notes/create', { Origin: origin });
    expect(res.status).toBe(200);
  });

  it('rejects a write from an unknown origin', async () => {
    const res = await send(await makeApp(), 'POST', '/api/notes/create', { Origin: 'https://evil.example' });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'CSRF_REJECTED' });
  });

  it('rejects Origin: null', async () => {
    const res = await send(await makeApp(), 'POST', '/api/notes/create', { Origin: 'null' });
    expect(res.status).toBe(403);
  });

  it('takes the first value of a proxy-doubled Origin', async () => {
    const res = await send(await makeApp(), 'POST', '/api/notes/create', {
      Origin: 'https://app.harvous.com, https://app.harvous.com',
    });
    expect(res.status).toBe(200);
  });

  it('allows a request whose Origin matches its own host', async () => {
    const res = await send(await makeApp(), 'POST', '/api/notes/create', { Origin: 'https://harvous.fly.dev' });
    expect(res.status).toBe(200);
  });

  it('falls back to Referer when Origin is absent', async () => {
    const app = await makeApp();
    expect((await send(app, 'POST', '/api/x', { Referer: 'https://app.harvous.com/note/abc' })).status).toBe(200);
    expect((await send(app, 'POST', '/api/x', { Referer: 'https://evil.example/page' })).status).toBe(403);
    expect((await send(app, 'POST', '/api/x', { Referer: 'not a url' })).status).toBe(403);
  });

  it('allows a write with neither header (native app, server-to-server)', async () => {
    const res = await send(await makeApp(), 'POST', '/api/notes/create');
    expect(res.status).toBe(200);
  });

  it('never checks safe methods', async () => {
    const app = await makeApp();
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      const res = await send(app, method, '/api/notes', { Origin: 'https://evil.example' });
      expect(res.status, method).not.toBe(403);
    }
  });

  it.each(['/api/webhooks/polar', '/api/admin/backup-exports', '/api/migrations/run'])(
    'exempts %s',
    async (path) => {
      const res = await send(await makeApp(), 'POST', path, { Origin: 'https://evil.example' });
      expect(res.status).toBe(200);
    },
  );

  it('ALLOWED_ORIGINS replaces the built-in list rather than adding to it', async () => {
    process.env.ALLOWED_ORIGINS = 'https://family-test.harvous.com, https://kids-test.harvous.com/';
    const app = await makeApp();
    expect((await send(app, 'POST', '/api/x', { Origin: 'https://kids-test.harvous.com' })).status).toBe(200);
    expect((await send(app, 'POST', '/api/x', { Origin: 'https://app.harvous.com' })).status).toBe(403);
  });
});

describe('csrfProtection, observe mode (CSRF_ENFORCE unset)', () => {
  it('lets a would-be rejection through and logs it', async () => {
    const warn = vi.mocked(console.warn);
    const res = await send(await makeApp(), 'POST', '/api/notes/create', { Origin: 'https://evil.example' });
    expect(res.status).toBe(200);
    expect(warn).toHaveBeenCalledWith('[csrf][observe] WOULD reject origin:', expect.objectContaining({
      origin: 'https://evil.example',
      path: '/api/notes/create',
    }));
  });

  it('only enforces for the exact value "true"', async () => {
    process.env.CSRF_ENFORCE = '1';
    const res = await send(await makeApp(), 'POST', '/api/x', { Origin: 'https://evil.example' });
    expect(res.status).toBe(200);
  });
});
