/**
 * Closing the Harvous 3 welcome is remembered on the account, so it never comes back on another
 * device; and a browser that closed it before the account key existed backfills that key.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyOnboardingState, type OnboardingState } from '@/utils/onboarding-state';
import { PROTO_WELCOME_3_DISMISSED_KEY } from '../../../layouts/proto-session-keys';
import { HARVOUS_3_SHIPPED_AT, WELCOME_3_SEEN_KEY } from '../welcome3-gate';

let accountState: OnboardingState = emptyOnboardingState();
let accountHadState: boolean | null = false;
const updates: OnboardingState[] = [];

vi.mock('../useOnboardingState', () => ({
  useOnboardingState: () => ({ state: accountState, hydrated: true, accountHadState }),
}));
vi.mock('../callouts/use-account-created-at', () => ({
  useAccountCreatedAt: () => ({ ready: true, createdAt: HARVOUS_3_SHIPPED_AT - 1000 }),
}));
vi.mock('../../../lib/proto-onboarding-sync', () => ({
  updateOnboardingState: (fn: (s: OnboardingState) => OnboardingState) => {
    accountState = fn(accountState);
    updates.push(accountState);
  },
}));
vi.mock('../PrototypeWelcome3Sheet', () => ({
  default: ({ open, onDismiss }: { open: boolean; onDismiss: () => void }) =>
    open ? (
      <button type="button" onClick={onDismiss}>
        Close welcome
      </button>
    ) : null,
}));

import PrototypeWelcome3 from '../PrototypeWelcome3';

beforeEach(() => {
  localStorage.clear();
  accountState = emptyOnboardingState();
  accountHadState = false;
  updates.length = 0;
});

describe('PrototypeWelcome3', () => {
  it('shows itself to an account new to 3.0, and closing writes welcome@3 to the account', async () => {
    render(<PrototypeWelcome3 enabled />);
    const close = await screen.findByRole('button', { name: 'Close welcome' });
    act(() => {
      fireEvent.click(close);
    });
    expect(screen.queryByRole('button', { name: 'Close welcome' })).toBeNull();
    expect(accountState.calloutsSeen?.[WELCOME_3_SEEN_KEY]).toBeTruthy();
    expect(localStorage.getItem(PROTO_WELCOME_3_DISMISSED_KEY)).toBe('1');
  });

  it('stays away from an account that has already used 3.0', () => {
    accountHadState = true;
    render(<PrototypeWelcome3 enabled />);
    expect(screen.queryByRole('button', { name: 'Close welcome' })).toBeNull();
  });

  it('backfills the account key from a browser that closed it earlier', () => {
    localStorage.setItem(PROTO_WELCOME_3_DISMISSED_KEY, '1');
    render(<PrototypeWelcome3 enabled />);
    expect(screen.queryByRole('button', { name: 'Close welcome' })).toBeNull();
    expect(accountState.calloutsSeen?.[WELCOME_3_SEEN_KEY]).toBeTruthy();
  });

  it('does nothing for a guest', () => {
    render(<PrototypeWelcome3 enabled={false} />);
    expect(screen.queryByRole('button', { name: 'Close welcome' })).toBeNull();
    expect(updates).toHaveLength(0);
  });
});
