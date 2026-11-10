import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  list: vi.fn(), getUser: vi.fn(), updateUserMetadata: vi.fn(), tag: vi.fn(),
}));
vi.mock('@clerk/backend', () => ({ createClerkClient: () => ({ users: mocks }) }));
vi.mock('@/utils/audienceful', () => ({ tagAsAppUser: mocks.tag }));
vi.mock('../polar-client', () => ({
  isPolarConfigured: () => true,
  getPolarClient: () => ({ subscriptions: { list: mocks.list } }),
}));
import { billingContactFields, syncBillingContact, syncBillingContactIfEnabled } from '../billing-contact-sync';

const subscription = (overrides = {}) => ({
  id: 'sub', productId: 'plus-month', status: 'active', createdAt: new Date('2026-01-01'),
  currentPeriodEnd: new Date('2026-12-01'), cancelAtPeriodEnd: false, ...overrides,
});
const user = { id: 'user', emailAddresses: [{ id: 'primary', emailAddress: 'a@example.com' }],
  primaryEmailAddressId: 'primary', privateMetadata: {}, firstName: 'A', lastName: null };

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('POLAR_PLUS_PRODUCT_MONTHLY', 'plus-month');
  vi.stubEnv('POLAR_PLUS_PRODUCT_ANNUAL', 'plus-year');
  vi.stubEnv('POLAR_CHURCH_PRODUCT_MONTHLY', 'church-month');
  vi.stubEnv('CLERK_SECRET_KEY', 'test');
  vi.stubEnv('AUDIENCEFUL_API_KEY', 'test');
  vi.stubEnv('BILLING_CONTACT_SYNC_ENABLED', 'true');
  mocks.getUser.mockResolvedValue(user);
  mocks.list.mockImplementation(async function* () { yield { result: { items: [subscription()] } }; });
});

describe('billing contact reporting', () => {
  it('distinguishes no subscription from canceled, clearing renewal details', () => {
    expect(billingContactFields([])).toMatchObject({ billing_plan: 'free', billing_subscription_status: 'none',
      billing_interval: '', billing_renews_at: '', billing_cancel_at_period_end: false });
    expect(billingContactFields([subscription({ status: 'canceled' })])).toMatchObject({
      billing_plan: 'free', billing_subscription_status: 'canceled', billing_renews_at: '',
    });
  });
  it('keeps scheduled cancellation paid until access ends', () => {
    expect(billingContactFields([subscription({ cancelAtPeriodEnd: true })])).toMatchObject({
      billing_plan: 'plus', billing_subscription_status: 'active', billing_cancel_at_period_end: true,
      billing_renews_at: '', billing_current_period_end: '2026-12-01T00:00:00.000Z',
    });
  });
  it.each(['trialing', 'past_due'])('preserves %s separately from access', (status) => {
    expect(billingContactFields([subscription({ status })])).toMatchObject({
      billing_plan: 'plus', billing_subscription_status: status,
    });
  });
  it('ignores church subscriptions and prefers live Plus over newer canceled history', () => {
    const church = subscription({ productId: 'church-month' });
    expect(billingContactFields([church]).billing_plan).toBe('free');
    const canceled = subscription({ status: 'canceled', createdAt: new Date('2026-11-01') });
    expect(billingContactFields([church, canceled, subscription()]).billing_plan).toBe('plus');
  });
  it('reads every page and forwards annual status to both destinations', async () => {
    mocks.list.mockImplementation(async function* () {
      yield { result: { items: [subscription({ status: 'canceled' })] } };
      yield { result: { items: [subscription({ productId: 'plus-year' })] } };
    });
    await syncBillingContact('user', { apply: true });
    expect(mocks.updateUserMetadata).toHaveBeenCalledWith('user', {
      privateMetadata: { harvous_billing: expect.objectContaining({ billing_interval: 'year', billing_plan: 'plus' }) },
    });
    expect(mocks.tag).toHaveBeenCalledWith('a@example.com', 'user', 'A', undefined, undefined, undefined,
      expect.objectContaining({ billing_interval: 'year' }));
  });
  it('preview performs no writes', async () => {
    await syncBillingContact('user', { apply: false });
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.tag).not.toHaveBeenCalled();
  });
  it('propagates destination failures for webhook retry', async () => {
    mocks.tag.mockRejectedValue(new Error('rate limited'));
    await expect(syncBillingContact('user', { apply: true })).rejects.toThrow('rate limited');
  });
  it('does not downgrade contacts when Polar cannot be read', async () => {
    mocks.list.mockRejectedValue(new Error('Polar unavailable'));
    await expect(syncBillingContact('user', { apply: true })).rejects.toThrow('Polar unavailable');
    expect(mocks.updateUserMetadata).not.toHaveBeenCalled();
  });
  it('does not emit redundant Clerk updates on retry', async () => {
    mocks.getUser.mockResolvedValue({ ...user, privateMetadata: { harvous_billing: billingContactFields([subscription()]) } });
    await syncBillingContact('user', { apply: true });
    expect(mocks.updateUserMetadata).not.toHaveBeenCalled();
    expect(mocks.tag).toHaveBeenCalledOnce();
  });
  it('is disabled until configured', async () => {
    vi.stubEnv('BILLING_CONTACT_SYNC_ENABLED', 'false');
    await syncBillingContactIfEnabled('user');
    expect(mocks.list).not.toHaveBeenCalled();
  });
});
