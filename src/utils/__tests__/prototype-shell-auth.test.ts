import { describe, expect, it } from 'vitest';
import {
  computePrototypeShouldShowShell,
  resolvePrototypeShellMode,
  shouldRedirectPrototypeToSignIn,
} from '../prototype-shell-auth';

describe('computePrototypeShouldShowShell', () => {
  it('shows shell from cookie hint while Clerk is still loading', () => {
    expect(computePrototypeShouldShowShell(false, false, true)).toBe(true);
    expect(computePrototypeShouldShowShell(false, undefined, true)).toBe(true);
  });

  it('hides shell while loading when there is no cookie hint', () => {
    expect(computePrototypeShouldShowShell(false, false, false)).toBe(false);
  });

  it('shows shell after load only when signed in (ignores stale cookie hint)', () => {
    expect(computePrototypeShouldShowShell(true, true, true)).toBe(true);
    expect(computePrototypeShouldShowShell(true, true, false)).toBe(true);
    // Regression: stale cookie + signed out must NOT keep the shell
    expect(computePrototypeShouldShowShell(true, false, true)).toBe(false);
  });
});

describe('shouldRedirectPrototypeToSignIn', () => {
  it('does not redirect while Clerk is loading', () => {
    expect(shouldRedirectPrototypeToSignIn(false, false)).toBe(false);
  });

  it('redirects after load when signed out even if cookies remain', () => {
    expect(shouldRedirectPrototypeToSignIn(true, false)).toBe(true);
  });

  it('does not redirect when signed in', () => {
    expect(shouldRedirectPrototypeToSignIn(true, true)).toBe(false);
  });
});

describe('resolvePrototypeShellMode', () => {
  it('reports an account whenever the shell would paint for a member', () => {
    expect(resolvePrototypeShellMode(true, true, false, false)).toBe('account');
    // Cookie hint during cold start keeps its old meaning.
    expect(resolvePrototypeShellMode(false, undefined, true, false)).toBe('account');
  });

  it('lets a real session outrank a leftover guest marker', () => {
    expect(resolvePrototypeShellMode(true, true, false, true)).toBe('account');
    // ...including during cold start, so a returning member never flashes the guest row.
    expect(resolvePrototypeShellMode(false, undefined, true, true)).toBe('account');
  });

  it('is a guest only when signed out with a marker', () => {
    expect(resolvePrototypeShellMode(true, false, false, true)).toBe('guest');
    expect(resolvePrototypeShellMode(false, undefined, false, true)).toBe('guest');
    // Regression, same shape as the cookie-hint one above: a stale cookie plus a guest
    // marker must not resolve to account once Clerk has spoken.
    expect(resolvePrototypeShellMode(true, false, true, true)).toBe('guest');
  });

  it('is signed-out with neither a session nor a marker', () => {
    expect(resolvePrototypeShellMode(true, false, false, false)).toBe('signed-out');
    expect(resolvePrototypeShellMode(false, undefined, false, false)).toBe('signed-out');
  });
});
