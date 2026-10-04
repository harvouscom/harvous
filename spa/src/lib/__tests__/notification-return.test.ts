/**
 * A notification tapped while signed out must still land after sign-in, even when the
 * `redirect_url` that normally carries it is lost on the way.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../shims/app-navigate', () => ({ navigate: vi.fn() }));
vi.mock('@/utils/diagnostics-client', () => ({ reportDiagnosticEvent: vi.fn() }));

const {
  NOTIFICATION_RETURN_MAX_AGE_MS,
  clearNotificationReturn,
  notificationReturnDecision,
  peekNotificationReturn,
  postAuthDestination,
  rememberNotificationReturn,
} = await import('../notification-return');
const { rememberIfNotificationTap, resetNotificationNavigationForTests } = await import(
  '../notification-navigation'
);

afterEach(() => {
  clearNotificationReturn();
  resetNotificationNavigationForTests();
});

describe('notification return stash', () => {
  it('keeps path, query and hash until it expires', () => {
    const now = 1_000_000;
    rememberNotificationReturn('/read/john/3?t=NET&v=16#x', now);
    expect(peekNotificationReturn(now + 1000)).toBe('/read/john/3?t=NET&v=16#x');
    expect(peekNotificationReturn(now + NOTIFICATION_RETURN_MAX_AGE_MS + 1)).toBeNull();
    // Expired entries are cleared, not just ignored.
    expect(peekNotificationReturn(now)).toBeNull();
  });

  it('refuses another origin and has nothing to say about Home', () => {
    rememberNotificationReturn('https://evil.example/phish');
    expect(peekNotificationReturn()).toBeNull();
    rememberNotificationReturn('/');
    expect(peekNotificationReturn()).toBeNull();
  });

  it('postAuthDestination: explicit redirect beats the stash, the stash beats Home', () => {
    expect(postAuthDestination(null)).toBe('/');
    rememberNotificationReturn('/?enterSpace=abc');
    expect(postAuthDestination(null)).toBe('/?enterSpace=abc');
    expect(postAuthDestination('/')).toBe('/?enterSpace=abc');
    expect(postAuthDestination('/note/n1')).toBe('/note/n1');
  });
});

describe('rememberIfNotificationTap', () => {
  it('does nothing without a recent tap to the page being left', () => {
    rememberIfNotificationTap('/read/john/3');
    expect(peekNotificationReturn()).toBeNull();
  });
});

describe('notificationReturnDecision', () => {
  const base = {
    current: '/',
    pathname: '/',
    isHome: true,
    hasExplicitRedirect: false,
    remembered: '/read/john/3?v=16',
  };

  it('navigates from Home or a bare auth page', () => {
    expect(notificationReturnDecision(base)).toBe('navigate');
    expect(
      notificationReturnDecision({ ...base, current: '/sign-in', pathname: '/sign-in', isHome: false }),
    ).toBe('navigate');
  });

  it('waits while an explicit redirect is about to run', () => {
    expect(
      notificationReturnDecision({
        ...base,
        current: '/sign-in?redirect_url=x',
        pathname: '/sign-in',
        isHome: false,
        hasExplicitRedirect: true,
      }),
    ).toBe('wait');
  });

  it('clears once arrived, or when they went somewhere else on purpose', () => {
    expect(
      notificationReturnDecision({ ...base, current: base.remembered, pathname: '/read/john/3', isHome: false }),
    ).toBe('clear');
    expect(
      notificationReturnDecision({ ...base, current: '/settings', pathname: '/settings', isHome: false }),
    ).toBe('clear');
    expect(notificationReturnDecision({ ...base, remembered: null })).toBe('clear');
  });
});
