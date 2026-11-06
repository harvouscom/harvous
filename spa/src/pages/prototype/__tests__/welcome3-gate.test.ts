/**
 * The Harvous 3 welcome shows itself once, to an account that has not used 3.0 yet — Derek,
 * Nov 2026. It used to ask the browser instead ("did this device run 2.x?"), which said yes on
 * every old browser of accounts that had been in 3.0 for two months.
 */
import { describe, expect, it } from 'vitest';
import {
  HARVOUS_3_SHIPPED_AT,
  WELCOME_3_SEEN_KEY,
  shouldAutoShowWelcome3,
  type Welcome3GateInput,
} from '../welcome3-gate';

const DAY = 24 * 60 * 60 * 1000;

const eligible: Welcome3GateInput = {
  signedIn: true,
  hydrated: true,
  accountHadState: false,
  accountCreatedAt: HARVOUS_3_SHIPPED_AT - 365 * DAY,
  seen: {},
  dismissedOnDevice: false,
};

describe('shouldAutoShowWelcome3', () => {
  it('greets a pre-3.0 account that has never opened 3.0', () => {
    expect(shouldAutoShowWelcome3(eligible)).toBe(true);
  });

  it.each<[string, Partial<Welcome3GateInput>]>([
    ['a guest', { signedIn: false }],
    ['an account that has not answered yet', { hydrated: false }],
    ['an account whose 3.0 history is unknown', { accountHadState: null }],
    ['an account that has already used 3.0 (stored checklist)', { accountHadState: true }],
    ['an account made after 3.0 shipped', { accountCreatedAt: HARVOUS_3_SHIPPED_AT + DAY }],
    ['an account made the day 3.0 shipped', { accountCreatedAt: HARVOUS_3_SHIPPED_AT }],
    ['an account of unknown age', { accountCreatedAt: undefined }],
    [
      'an account that closed it on another device',
      { seen: { [WELCOME_3_SEEN_KEY]: '2026-09-05T10:00:00.000Z' } },
    ],
    ['a browser that already closed it', { dismissedOnDevice: true }],
  ])('stays away from %s', (_label, change) => {
    expect(shouldAutoShowWelcome3({ ...eligible, ...change })).toBe(false);
  });

  it('is not put off by other cards the account has seen', () => {
    expect(
      shouldAutoShowWelcome3({ ...eligible, seen: { 'whats-new@3.31': '2026-11-01T00:00:00Z' } }),
    ).toBe(true);
  });
});
