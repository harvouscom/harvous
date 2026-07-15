import { describe, expect, it } from 'vitest';
import {
  computePrototypeShouldShowShell,
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
