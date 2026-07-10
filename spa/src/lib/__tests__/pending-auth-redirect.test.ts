import { describe, expect, it } from 'vitest';
import {
  PENDING_AUTH_REDIRECT_KEY,
  consumePendingAuthRedirect,
  peekPendingAuthRedirect,
  pendingAuthRedirectDecision,
  validatePendingAuthDestination,
  writePendingAuthRedirect,
} from '../pending-auth-redirect';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

const origin = 'https://app.harvous.com';

describe('pending auth redirect validation', () => {
  it('allows same-origin join, invitation, and public-share paths with query and hash intact', () => {
    expect(validatePendingAuthDestination(`${origin}/spaces/join/AbC123?from=email#accept`, origin)).toBe(
      '/spaces/join/AbC123?from=email#accept',
    );
    expect(validatePendingAuthDestination('/invitations/invite_123', origin)).toBe('/invitations/invite_123');
    expect(validatePendingAuthDestination('/shared/note/AbC123', origin)).toBe('/shared/note/AbC123');
    expect(validatePendingAuthDestination('/shared/thread/AbC123', origin)).toBe('/shared/thread/AbC123');
  });

  it.each([
    'https://example.com/spaces/join/AbC123',
    'javascript:alert(1)',
    '/sign-in',
    '/sign-up?redirect_url=/shared/note/AbC123',
    '/',
    '/settings',
    '/spaces/join/',
  ])('rejects unsafe or looping destination %s', (destination) => {
    expect(validatePendingAuthDestination(destination, origin)).toBeNull();
  });
});

describe('pending auth redirect storage', () => {
  it('stores a timestamped path rather than a full href', () => {
    const storage = memoryStorage();
    expect(
      writePendingAuthRedirect(`${origin}/spaces/join/AbC123?from=email`, {
        storage,
        origin,
        now: 1_000,
      }),
    ).toBe(true);
    expect(JSON.parse(storage.getItem(PENDING_AUTH_REDIRECT_KEY)!)).toEqual({
      path: '/spaces/join/AbC123?from=email',
      timestamp: 1_000,
    });
  });

  it('rejects expired and future records', () => {
    const storage = memoryStorage();
    writePendingAuthRedirect('/invitations/invite_123', { storage, origin, now: 1_000 });
    expect(peekPendingAuthRedirect({ storage, origin, now: 1_501, maxAgeMs: 500 })).toBeNull();

    storage.setItem(
      PENDING_AUTH_REDIRECT_KEY,
      JSON.stringify({ path: '/invitations/invite_123', timestamp: 2_000 }),
    );
    expect(peekPendingAuthRedirect({ storage, origin, now: 1_999 })).toBeNull();
  });

  it('consumes a valid destination exactly once', () => {
    const storage = memoryStorage();
    writePendingAuthRedirect('/shared/thread/AbC123', { storage, origin, now: 1_000 });
    expect(consumePendingAuthRedirect({ storage, origin, now: 1_001 })).toBe('/shared/thread/AbC123');
    expect(consumePendingAuthRedirect({ storage, origin, now: 1_002 })).toBeNull();
  });
});

describe('pending auth redirect bridge decisions', () => {
  const base = {
    currentDestination: `${origin}/`,
    pendingDestination: '/shared/note/AbC123',
    origin,
  };

  it('waits for Clerk and prefers an explicit redirect_url', () => {
    expect(
      pendingAuthRedirectDecision({ ...base, isLoaded: false, isSignedIn: false, hasExplicitRedirect: false }),
    ).toBe('wait');
    expect(
      pendingAuthRedirectDecision({ ...base, isLoaded: true, isSignedIn: true, hasExplicitRedirect: true }),
    ).toBe('explicit');
  });

  it('navigates once without looping at the destination', () => {
    expect(
      pendingAuthRedirectDecision({ ...base, isLoaded: true, isSignedIn: true, hasExplicitRedirect: false }),
    ).toBe('navigate');
    expect(
      pendingAuthRedirectDecision({
        ...base,
        isLoaded: true,
        isSignedIn: true,
        hasExplicitRedirect: false,
        currentDestination: `${origin}/shared/note/AbC123`,
      }),
    ).toBe('at-target');
  });
});
