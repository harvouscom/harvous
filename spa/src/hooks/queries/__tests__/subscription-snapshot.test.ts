/**
 * The snapshot exists so Review's query can start with every other query rather than behind
 * this one. These pin the part that is not about speed: whose entitlements it is willing to
 * hand back.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  readSubscriptionSnapshot,
  writeSubscriptionSnapshot,
} from '../useSubscriptionStatus';

const A = 'user_aaa';
const B = 'user_bbb';
const paid = { entitlements: ['shared_spaces', 'review'], planKey: 'plus' } as never;

describe('subscription snapshot', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => sessionStorage.clear());

  it('gives the snapshot back to the account that wrote it', () => {
    writeSubscriptionSnapshot(A, paid);
    expect(readSubscriptionSnapshot(A)?.entitlements).toEqual(['shared_spaces', 'review']);
  });

  it('refuses to hand one account the entitlements of another', () => {
    // The reason this is keyed at all: a shared browser, a sign-out, a different person.
    writeSubscriptionSnapshot(A, paid);
    expect(readSubscriptionSnapshot(B)).toBeUndefined();
  });

  it('returns nothing without a user, rather than the last one seen', () => {
    writeSubscriptionSnapshot(A, paid);
    expect(readSubscriptionSnapshot(null)).toBeUndefined();
    expect(readSubscriptionSnapshot(undefined)).toBeUndefined();
  });

  it('ignores a snapshot that is not shaped like an answer', () => {
    // A half-written or older-build value must not read as "no entitlements", which would
    // flash a paywall at a subscriber — it must read as "unknown" so the fetch decides.
    sessionStorage.setItem('harvous-subscription-status-snapshot', JSON.stringify({ userId: A }));
    expect(readSubscriptionSnapshot(A)).toBeUndefined();
    sessionStorage.setItem('harvous-subscription-status-snapshot', 'not json');
    expect(readSubscriptionSnapshot(A)).toBeUndefined();
  });

  it('writes nothing when there is no user to key it to', () => {
    writeSubscriptionSnapshot(null, paid);
    expect(sessionStorage.getItem('harvous-subscription-status-snapshot')).toBeNull();
  });
});
