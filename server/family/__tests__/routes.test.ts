import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { createHmac } from 'node:crypto';
import type { SQL } from 'drizzle-orm';
import { CHILD_NOTICE_VERSION } from '../policy';
const database = vi.hoisted(() => ({ update: vi.fn(), transaction: vi.fn() }));
vi.mock('../../db/client', () => ({ db: database }));
vi.mock('../../middleware/auth', () => ({
  requireAuth: async (c: any, next: any) => c.get('auth')?.userId ? next() : c.json({ error: 'Authentication required' }, 401),
  getAuthenticatedAuth: (c: any) => c.get('auth'),
  requireParam: (c: any, name: string) => c.req.param(name)
}));
import family from '../../routes/child-accounts';
const app = new Hono();
app.use('*', async (c, next) => { c.set('auth' as never, { userId: c.req.header('Authorization') === 'Bearer parent-token' ? 'parent-a' : null } as never); await next(); });
app.route('/', family);
function configured() {
  for (const [key, value] of Object.entries({ KWS_CLIENT_ID: 'client', KWS_API_KEY: 'key',
    KWS_SEND_EMAIL_URL: 'https://api.kidswebservices.com/product/test/send-email', KWS_ORG_ID: 'org',
    KWS_PRODUCT_ID: 'product', KWS_WEBHOOK_SECRET: 'secret', KWS_ENVIRONMENT: 'test',
    HARVOUS_CHILD_APP_URL: 'http://localhost:4322/kids.html', HARVOUS_CHILD_PRIVACY_URL: 'https://example.com/privacy' })) vi.stubEnv(key, value);
}
beforeEach(() => { vi.clearAllMocks(); configured(); });
afterEach(() => vi.unstubAllEnvs());
describe('family route boundaries', () => {
  it.each([
    ['GET', '/api/child-accounts/status'],
    ['GET', '/api/child-accounts/children/child-a/export'],
    ['POST', '/api/child-accounts/child/redeem'],
    ['GET', '/api/child-accounts/child/notebook'],
    ['POST', '/api/webhooks/kws'],
    ['POST', '/api/admin/child-account-retention']
  ])('pauses %s %s during a database recovery', async (method, path) => {
    vi.stubEnv('HARVOUS_CHILD_RECOVERY_PAUSED', 'true');
    const response = await app.request(path, { method, headers: { Authorization: 'Bearer parent-token' } });
    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(database.transaction).not.toHaveBeenCalled();
    expect(database.update).not.toHaveBeenCalled();
  });
  it.each(['/api/child-accounts/children/other', '/api/child-accounts/children/other/export', '/api/child-accounts/status'])('requires parent authentication for %s', async (path) => {
    const response = await app.request(path); expect(response.status).toBe(401); expect(database.transaction).not.toHaveBeenCalled();
  });
  it('checks notebook ownership before reading export data', async () => {
    const where = vi.fn((_condition: SQL) => ({ for: vi.fn().mockResolvedValue([]) }));
    const select = vi.fn(() => ({ from: () => ({ where }) }));
    database.transaction.mockImplementationOnce(work => work({ execute: vi.fn(), select }));
    const response = await app.request('/api/child-accounts/children/other/export', { headers: { Authorization: 'Bearer parent-token' } });
    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(select).toHaveBeenCalledTimes(1);
    const { PgDialect } = await import('drizzle-orm/pg-core');
    expect(new PgDialect().sqlToQuery(where.mock.calls[0][0]).params).toEqual(['other', 'parent-a']);
  });
  it('does not accept child details while enrollment is disabled', async () => {
    const response = await app.request('/api/child-accounts/children', { method: 'POST', headers: { Authorization: 'Bearer parent-token', 'Content-Type': 'application/json' }, body: '{}' });
    expect(response.status).toBe(503); expect(database.transaction).not.toHaveBeenCalled();
  });
  it.each([
    { requested: ['ERV', 'CEV', 'NLV'], status: 200 },
    { requested: ['BSB', 'ERV', 'CEV', 'NLV'], status: 200 },
    { requested: ['NIV', 'ERV'], status: 400 },
    { requested: ['NIV', 'ERV'], status: 200, shared: [{ translation: 'NIV' }] }
  ])('applies child translation choices $requested to an existing notebook', async ({ requested, status, shared = [] }) => {
    const child = { id: 'child-a', status: 'active', noticeVersion: CHILD_NOTICE_VERSION, consentedAt: new Date(), revokedAt: null, bibleTranslations: ['BSB'] };
    const select = vi.fn(() => ({ from: () => ({ where: () => ({
      for: async () => [child], orderBy: async () => shared
    }) }) }));
    const set = vi.fn(() => ({ where: async () => undefined }));
    database.transaction.mockImplementationOnce(work => work({ select, update: () => ({ set }) }));
    const response = await app.request('/api/child-accounts/children/child-a/bible/translations', {
      method: 'PUT',
      headers: { Authorization: 'Bearer parent-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ translations: requested })
    });
    expect(response.status).toBe(status);
    if (status === 200) {
      expect(set).toHaveBeenCalledWith({ bibleTranslations: requested });
    } else {
      expect(set).not.toHaveBeenCalled();
    }
  });
  it('keeps the original withdrawal date when a parent retries', async () => {
    const revokedAt = new Date('2026-01-01T00:00:00Z');
    const child = { id: 'child-a', revokedAt };
    const select = vi.fn(() => ({ from: () => ({ where: () => ({ for: async () => [child] }) }) }));
    const set = vi.fn(() => ({ where: async () => undefined }));
    const remove = vi.fn(() => ({ where: async () => undefined }));
    database.transaction.mockImplementationOnce(work => work({ select, update: () => ({ set }), delete: remove }));
    const response = await app.request('/api/child-accounts/children/child-a/revoke', {
      method: 'POST', headers: { Authorization: 'Bearer parent-token' }
    });
    expect(response.status).toBe(200);
    expect(set).toHaveBeenCalledWith({ status: 'revoked', revokedAt });
    expect(remove).toHaveBeenCalledTimes(2);
  });
  it('does not accept Clerk credentials as a child session', async () => {
    const response = await app.request('/api/child-accounts/child/notebook', { headers: { Authorization: 'Bearer parent-token' } });
    expect(response.status).toBe(401); expect(database.transaction).not.toHaveBeenCalled();
  });
  it('rejects a verse sticker outside the set before opening a child session', async () => {
    const response = await app.request('/api/child-accounts/child/bible/stickers', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ book: 'Psalms', chapter: 23, verse: 1, sticker: 'initial' })
    });
    expect(response.status).toBe(400); expect(database.transaction).not.toHaveBeenCalled();
  });
  it('rejects child app requests from the adult origin', async () => {
    const response = await app.request('/api/child-accounts/child/notebook', { headers: { Origin: 'https://app.harvous.com' } });
    expect(response.status).toBe(403);
  });
  it('serves the public child privacy URL without a session or database access', async () => {
    const response = await app.request('/api/child-accounts/child/privacy', { headers: { Origin: 'http://localhost:4322' } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ privacyUrl: 'https://example.com/privacy' });
    expect(database.transaction).not.toHaveBeenCalled();
  });
  it('rejects forged callbacks without touching the database', async () => {
    const response = await app.request('/api/webhooks/kws', { method: 'POST', body: '{}' });
    expect(response.status).toBe(401); expect(database.update).not.toHaveBeenCalled();
  });
  it('rejects authentic callbacks for another product', async () => {
    const raw = JSON.stringify({ name: 'parent-verified', orgId: 'org', productId: 'other', payload: { parentEmail: 'p@example.com', externalPayload: 'b7bd3862-d943-46d3-9e4a-9cd301375e23', status: { verified: true, transactionId: 'transaction' } } });
    const now = Date.now(); const digest = createHmac('sha256', 'secret').update(`${now}.${raw}`).digest('hex');
    const response = await app.request('/api/webhooks/kws', { method: 'POST', headers: { 'x-kws-signature': `t=${now},v1=${digest}` }, body: raw });
    expect(response.status).toBe(403); expect(database.update).not.toHaveBeenCalled();
  });
  it('accepts signed callbacks but only updates pending, unexpired, matching verification rows', async () => {
    const where = vi.fn().mockResolvedValue([]); const set = vi.fn(() => ({ where })); database.update.mockReturnValue({ set });
    const raw = JSON.stringify({ name: 'parent-verified', orgId: 'org', productId: 'product', payload: { parentEmail: 'p@example.com', externalPayload: 'b7bd3862-d943-46d3-9e4a-9cd301375e23', status: { verified: true, transactionId: 'transaction' } } });
    const now = Date.now(); const digest = createHmac('sha256', 'secret').update(`${now}.${raw}`).digest('hex');
    const response = await app.request('/api/webhooks/kws', { method: 'POST', headers: { 'x-kws-signature': `t=${now},v1=${digest}` }, body: raw });
    expect(response.status).toBe(200); expect(set).toHaveBeenCalledWith(expect.objectContaining({ status: 'verified' }));
    const { PgDialect } = await import('drizzle-orm/pg-core'); const query = new PgDialect().sqlToQuery(where.mock.calls[0][0]);
    expect(query.params).toContain('pending'); expect(query.params).toContain('test');
    expect(query.sql).toContain('"expiresAt" >'); expect(query.sql).toContain('"parentEmailHash" =');
    expect(database.transaction).not.toHaveBeenCalled(); // verification never creates a child
  });
});
