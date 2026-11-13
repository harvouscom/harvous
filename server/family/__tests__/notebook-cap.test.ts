import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { CHILD_NOTICE_VERSION } from '../policy';
import { CHILD_NOTEBOOK_MAX_PER_PARENT } from '../../../shared/child-notebook';
import { holdsChildNotebookPlace } from '../retention';

const database = vi.hoisted(() => ({ update: vi.fn(), transaction: vi.fn(), select: vi.fn() }));
const sendKwsVerification = vi.hoisted(() => vi.fn());
vi.mock('../../db/client', () => ({ db: database }));
const isFamilyParent = vi.hoisted(() => vi.fn(async (_userId: string) => true));
vi.mock('../family-membership', () => ({ isFamilyParent }));
vi.mock('../../middleware/auth', () => ({
  requireAuth: async (c: any, next: any) => c.get('auth')?.userId ? next() : c.json({ error: 'Authentication required' }, 401),
  getAuthenticatedAuth: (c: any) => c.get('auth'),
  requireParam: (c: any, name: string) => c.req.param(name)
}));
vi.mock('@clerk/backend', () => ({ createClerkClient: () => ({ users: { getUser: async () => ({
  primaryEmailAddressId: 'email-1', emailAddresses: [{ id: 'email-1', emailAddress: 'parent@example.com', verification: { status: 'verified' } }]
}) } }) }));
vi.mock('../../utils/family-entitlements', () => ({ sponsorFeatureKeys: async () => ['plus'] }));
vi.mock('../../utils/entitlements', () => ({ syncEntitlementsFromProvider: async () => undefined }));
vi.mock('../kws', async (original) => ({ ...await original<typeof import('../kws')>(), sendKwsVerification }));
import family from '../../routes/child-accounts';

const app = new Hono();
app.use('*', async (c, next) => { c.set('auth' as never, { userId: 'parent-a' } as never); await next(); });
app.route('/', family);
const headers = { Authorization: 'Bearer parent-token', 'Content-Type': 'application/json' };
const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  vi.clearAllMocks();
  for (const [key, value] of Object.entries({ KWS_CLIENT_ID: 'client', KWS_API_KEY: 'key',
    KWS_SEND_EMAIL_URL: 'https://api.kidswebservices.com/product/test/send-email', KWS_ORG_ID: 'org',
    KWS_PRODUCT_ID: 'product', KWS_WEBHOOK_SECRET: 'secret', KWS_ENVIRONMENT: 'test',
    HARVOUS_CHILD_APP_URL: 'http://localhost:4322/kids.html', HARVOUS_CHILD_PRIVACY_URL: 'https://example.com/privacy',
    HARVOUS_CHILD_ACCOUNTS_ENABLED: 'true', HARVOUS_CHILD_RETENTION_READY: 'true' })) vi.stubEnv(key, value);
});
afterEach(() => { vi.unstubAllEnvs(); database.transaction.mockReset(); });

const active = () => ({ revokedAt: null });
const withdrawnDaysAgo = (days: number) => ({ revokedAt: new Date(Date.now() - days * DAY) });
const notebooks = (count: number) => Array.from({ length: count }, active);

/** A transaction whose selects answer in order; every `.where()` resolves to the next result. */
function transactionAnswering(...results: unknown[][]) {
  const where = vi.fn();
  for (const result of results) where.mockResolvedValueOnce(result);
  const tx = {
    execute: vi.fn(),
    select: vi.fn(() => ({ from: () => ({ where }) })),
    insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: async () => [{ id: 'child-new', noticeVersion: CHILD_NOTICE_VERSION, consentedAt: new Date() }] })) })),
    update: vi.fn(() => ({ set: () => ({ where: () => ({ returning: async () => [{ id: 'verification-1' }] }) }) })),
  };
  database.transaction.mockImplementationOnce(work => work(tx));
  return tx;
}

describe('which notebooks hold one of the parent’s places', () => {
  const now = new Date();
  it('counts active notebooks', () => expect(holdsChildNotebookPlace(active(), now)).toBe(true));
  it('counts a withdrawn notebook inside its 30-day deletion window', () => {
    expect(holdsChildNotebookPlace({ revokedAt: new Date(now.getTime() - 29 * DAY) }, now)).toBe(true);
  });
  it('frees the place once the deletion window closes, even before the purge runs', () => {
    expect(holdsChildNotebookPlace({ revokedAt: new Date(now.getTime() - 31 * DAY) }, now)).toBe(false);
  });
});

describe('the per-parent child notebook cap', () => {
  it('is six, separate from Family’s six people', () => expect(CHILD_NOTEBOOK_MAX_PER_PARENT).toBe(6));

  describe('starting a verification', () => {
    const start = () => app.request('/api/child-accounts/verification', { method: 'POST', headers, body: JSON.stringify({ location: 'US' }) });
    // Selects in order: deletion in progress, unused verified requests, the parent's notebooks, recent starts.
    it('refuses with CHILD_NOTEBOOK_LIMIT when six notebooks hold places, before sending any KWS email', async () => {
      const tx = transactionAnswering([], [], notebooks(6));
      const response = await start();
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: 'You can have up to six child notebooks.', code: 'CHILD_NOTEBOOK_LIMIT', max: 6 });
      expect(tx.insert).not.toHaveBeenCalled();
      expect(sendKwsVerification).not.toHaveBeenCalled();
    });
    it('counts a withdrawn notebook still in its deletion window', async () => {
      transactionAnswering([], [], [...notebooks(5), withdrawnDaysAgo(3)]);
      expect((await start()).status).toBe(409);
      expect(sendKwsVerification).not.toHaveBeenCalled();
    });
    it('counts a completed verification that hasn’t been used yet', async () => {
      transactionAnswering([], [{ id: 'verified-unused' }], notebooks(5));
      expect((await start()).status).toBe(409);
    });
    it('lets a parent with five notebooks and an old withdrawal start the sixth', async () => {
      const tx = transactionAnswering([], [], [...notebooks(5), withdrawnDaysAgo(40)], []);
      const response = await start();
      expect(response.status).toBe(202);
      expect(tx.insert).toHaveBeenCalledTimes(1);
      expect(sendKwsVerification).toHaveBeenCalledTimes(1);
    });
  });

  describe('outside a family', () => {
    afterEach(() => isFamilyParent.mockResolvedValue(true));
    it('refuses to start a verification before any KWS email or database work', async () => {
      isFamilyParent.mockResolvedValue(false);
      const response = await app.request('/api/child-accounts/verification', { method: 'POST', headers, body: JSON.stringify({ location: 'US' }) });
      expect(response.status).toBe(409);
      expect((await response.json()).code).toBe('CHILD_NOTEBOOK_NEEDS_FAMILY');
      expect(database.transaction).not.toHaveBeenCalled();
      expect(sendKwsVerification).not.toHaveBeenCalled();
    });
    it('refuses to create a notebook without consuming the verification', async () => {
      isFamilyParent.mockResolvedValue(false);
      const response = await app.request('/api/child-accounts/children', { method: 'POST', headers, body: JSON.stringify({
        verificationId: 'b7bd3862-d943-46d3-9e4a-9cd301375e23', displayName: 'Sam', noticeVersion: CHILD_NOTICE_VERSION, isGuardian: true, consent: true }) });
      expect(response.status).toBe(409);
      expect(database.transaction).not.toHaveBeenCalled();
    });
  });

  describe('creating the notebook', () => {
    const create = () => app.request('/api/child-accounts/children', { method: 'POST', headers, body: JSON.stringify({
      verificationId: 'b7bd3862-d943-46d3-9e4a-9cd301375e23', displayName: 'Sam', noticeVersion: CHILD_NOTICE_VERSION, isGuardian: true, consent: true }) });
    it('refuses inside the locked transaction without consuming the verification', async () => {
      const tx = transactionAnswering([...notebooks(4), withdrawnDaysAgo(10), withdrawnDaysAgo(29)]);
      const response = await create();
      expect(response.status).toBe(409);
      expect((await response.json()).code).toBe('CHILD_NOTEBOOK_LIMIT');
      // The per-parent advisory lock is taken before counting, so a concurrent request waits and then sees this row.
      expect(tx.execute).toHaveBeenCalledTimes(1);
      expect(tx.execute.mock.invocationCallOrder[0]).toBeLessThan(tx.select.mock.invocationCallOrder[0]);
      expect(tx.update).not.toHaveBeenCalled();
      expect(tx.insert).not.toHaveBeenCalled();
    });
    const createWith = (extra: Record<string, unknown>) => app.request('/api/child-accounts/children', { method: 'POST', headers, body: JSON.stringify({
      verificationId: 'b7bd3862-d943-46d3-9e4a-9cd301375e23', displayName: 'Sam', noticeVersion: CHILD_NOTICE_VERSION, isGuardian: true, consent: true, ...extra }) });
    const childValues = (tx: ReturnType<typeof transactionAnswering>) =>
      (tx.insert.mock.results[1].value as { values: ReturnType<typeof vi.fn> }).values.mock.calls[0][0];
    it('starts the notebook with the cover the parent picked, and the child’s initial on it', async () => {
      const tx = transactionAnswering([]);
      const response = await createWith({ cover: { coverColor: 'purple', coverPattern: 'dots', coverBinding: 'spiral' } });
      expect(response.status).toBe(201);
      expect(childValues(tx).notebookPreferences).toMatchObject({ coverColor: 'purple', coverPattern: 'dots', coverBinding: 'spiral', coverSymbol: 'initial' });
    });
    it('leaves the defaults when the parent picked nothing', async () => {
      const tx = transactionAnswering([]);
      expect((await createWith({})).status).toBe(201);
      expect(childValues(tx).notebookPreferences).toBeNull();
    });
    it('doesn’t let the parent choose the sticker: that’s the child’s', async () => {
      const response = await createWith({ cover: { coverColor: 'purple', coverPattern: 'dots', coverBinding: 'spiral', coverSymbol: 'dove' } });
      expect(response.status).toBe(400);
      expect(database.transaction).not.toHaveBeenCalled();
    });
    it('creates the sixth notebook', async () => {
      const tx = transactionAnswering(notebooks(5));
      const response = await create();
      expect(response.status).toBe(201);
      expect(tx.update).toHaveBeenCalledTimes(1);
    });
  });
});
