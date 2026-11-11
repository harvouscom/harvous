import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
vi.mock('@clerk/backend', () => ({ verifyToken: vi.fn(), createClerkClient: vi.fn() }));
vi.mock('../../utils/merge-user-into-live', () => ({ mergeDevUserIntoLive: vi.fn() }));
import { verifyToken } from '@clerk/backend';
import { clerkAuth, getAuth, requireAuth } from '../../middleware/auth';
import { childSecret } from '../policy';
const app = new Hono();
app.use('*', clerkAuth);
app.get('/api/billing', requireAuth, (c) => c.json({ adult: true }));
app.get('/api/child-accounts/status', requireAuth, (c) => c.json({ adult: true }));
app.get('/api/child-accounts/child/notebook', (c) => c.json({ auth: getAuth(c).userId }));
describe('child credentials never become adult credentials', () => {
  it('does not fall back to an adult cookie when a child token calls an adult endpoint', async () => {
    const response = await app.request('/api/billing', { headers: { Cookie: '__session=adult-cookie', Authorization: `Bearer ${childSecret()}` } });
    expect(response.status).toBe(401); expect(verifyToken).not.toHaveBeenCalled();
  });
  it('does not send child requests through Clerk even with an adult cookie', async () => {
    const response = await app.request('/api/child-accounts/child/notebook', { headers: { Cookie: '__session=adult-cookie' } });
    expect(await response.json()).toEqual({ auth: null }); expect(verifyToken).not.toHaveBeenCalled();
  });
  it('does not fall back to an adult cookie for parent management', async () => {
    const response = await app.request('/api/child-accounts/status', { headers: { Cookie: '__session=adult-cookie' } });
    expect(response.status).toBe(401);
    expect(verifyToken).not.toHaveBeenCalled();
  });
});
