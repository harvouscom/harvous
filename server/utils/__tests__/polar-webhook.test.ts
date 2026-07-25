import { describe, it, expect } from 'vitest';
import { firstHeaderValue } from '../polar-client';
import {
  polarBillingIntent,
  productIdFromPolarData,
  externalUserIdFromPolarData,
  customerIdFromPolarData,
} from '../polar-webhook';

describe('firstHeaderValue (Netlify duplicate headers)', () => {
  it('takes the first value when Polar Standard-Webhooks headers are duplicated as "v, v"', () => {
    expect(firstHeaderValue('v1,abc, v1,abc')).toBe('v1,abc');
  });
  it('passes a single value through, trimmed', () => {
    expect(firstHeaderValue(' v1,abc ')).toBe('v1,abc');
  });
  it('returns undefined for empty', () => {
    expect(firstHeaderValue(undefined)).toBeUndefined();
    expect(firstHeaderValue('')).toBeUndefined();
  });
});

describe('polarBillingIntent', () => {
  it('enables on activation / creation / uncancel / past_due / one-time order', () => {
    for (const t of [
      'subscription.active',
      'subscription.created',
      'subscription.uncanceled',
      'subscription.past_due',
      'order.paid',
    ]) {
      expect(polarBillingIntent(t)).toBe('enable');
    }
  });

  it('disables on cancel / revoke', () => {
    expect(polarBillingIntent('subscription.canceled')).toBe('disable');
    expect(polarBillingIntent('subscription.revoked')).toBe('disable');
  });

  it('subscription.updated follows the status', () => {
    expect(polarBillingIntent('subscription.updated', 'active')).toBe('enable');
    expect(polarBillingIntent('subscription.updated', 'trialing')).toBe('enable');
    expect(polarBillingIntent('subscription.updated', 'canceled')).toBe('disable');
    expect(polarBillingIntent('subscription.updated', null)).toBe('disable');
  });

  it('ignores unrelated events', () => {
    expect(polarBillingIntent('customer.updated')).toBeNull();
    expect(polarBillingIntent('benefit_grant.created')).toBeNull();
  });
});

describe('id extraction (camel + snake tolerant)', () => {
  it('reads product id from the several shapes Polar can send', () => {
    expect(productIdFromPolarData({ productId: 'prod_1' })).toBe('prod_1');
    expect(productIdFromPolarData({ product_id: 'prod_2' })).toBe('prod_2');
    expect(productIdFromPolarData({ product: { id: 'prod_3' } })).toBe('prod_3');
    expect(productIdFromPolarData({ items: [{ productId: 'prod_4' }] })).toBe('prod_4');
    expect(productIdFromPolarData(null)).toBeNull();
  });

  it('prefers the customer external_id, then metadata.clerkUserId', () => {
    expect(externalUserIdFromPolarData({ customer: { externalId: 'user_1' } })).toBe('user_1');
    expect(externalUserIdFromPolarData({ external_customer_id: 'user_2' })).toBe('user_2');
    expect(externalUserIdFromPolarData({ metadata: { clerkUserId: 'user_3' } })).toBe('user_3');
    expect(externalUserIdFromPolarData({})).toBeNull();
  });

  it('reads the polar customer id for the fallback lookup', () => {
    expect(customerIdFromPolarData({ customerId: 'cus_1' })).toBe('cus_1');
    expect(customerIdFromPolarData({ customer: { id: 'cus_2' } })).toBe('cus_2');
  });
});
