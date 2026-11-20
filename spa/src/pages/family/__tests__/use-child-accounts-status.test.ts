import { describe, expect, it } from 'vitest';
import { pendingVerificationPoll, VERIFICATION_POLL_MS } from '../useChildAccountsStatus';

describe('pendingVerificationPoll', () => {
  it('polls while a Kids Web Services verification is pending', () => {
    expect(pendingVerificationPoll({ verifications: [{ id: 'v1', status: 'pending' }] })).toBe(VERIFICATION_POLL_MS);
  });

  it('stops once the verification is verified', () => {
    expect(pendingVerificationPoll({ verifications: [{ id: 'v1', status: 'verified' }] })).toBe(false);
  });

  it('stops when one verification is verified, even if a newer email is still pending', () => {
    expect(pendingVerificationPoll({ verifications: [
      { id: 'v1', status: 'verified' }, { id: 'v2', status: 'pending' },
    ] })).toBe(false);
  });

  it('does not poll with no verifications or before the first load', () => {
    expect(pendingVerificationPoll({ verifications: [] })).toBe(false);
    expect(pendingVerificationPoll(undefined)).toBe(false);
  });
});
