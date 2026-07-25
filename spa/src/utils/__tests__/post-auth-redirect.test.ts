import { describe, expect, it, vi, afterEach } from 'vitest';
import { postAuthClerkFallbackUrl, postAuthRedirectPath } from '../post-auth-redirect';

describe('postAuthRedirectPath', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps same-origin upgrade returns for Plus checkout after sign-up', () => {
    vi.stubGlobal('window', { location: { origin: 'https://app.harvous.com' } });
    expect(postAuthRedirectPath('https://app.harvous.com/upgrade?from=pricing')).toBe(
      '/upgrade?from=pricing',
    );
    expect(postAuthRedirectPath('/upgrade')).toBe('/upgrade');
  });

  it('rejects cross-origin redirects', () => {
    vi.stubGlobal('window', { location: { origin: 'https://app.harvous.com' } });
    expect(postAuthRedirectPath('https://evil.example/upgrade')).toBe('/');
  });
});

describe('postAuthClerkFallbackUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds an absolute same-origin fallback for Clerk', () => {
    vi.stubGlobal('window', { location: { origin: 'https://app.harvous.com' } });
    expect(postAuthClerkFallbackUrl('/upgrade?from=pricing')).toBe(
      'https://app.harvous.com/upgrade?from=pricing',
    );
  });
});
