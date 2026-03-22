import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  checkRateLimit,
  rateLimitMiddleware,
  getClientIP,
  RATE_LIMITS,
} from '../rate-limit';

// We need to reset the in-memory store between tests.
// The store is module-scoped, so we re-import or clear it via rapid calls.

describe('checkRateLimit', () => {
  // Use unique endpoints per test to avoid cross-test contamination
  // (the in-memory store persists within the same vitest worker)
  let testEndpoint: string;

  beforeEach(() => {
    testEndpoint = `/api/test-${Date.now()}-${Math.random()}`;
  });

  it('allows first request', () => {
    const result = checkRateLimit('user-1', testEndpoint, RATE_LIMITS.WRITE);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(RATE_LIMITS.WRITE.maxRequests - 1);
  });

  it('tracks remaining count correctly', () => {
    const config = { maxRequests: 3, windowMs: 60_000 };

    const r1 = checkRateLimit('user-2', testEndpoint, config);
    expect(r1.remaining).toBe(2);

    const r2 = checkRateLimit('user-2', testEndpoint, config);
    expect(r2.remaining).toBe(1);

    const r3 = checkRateLimit('user-2', testEndpoint, config);
    expect(r3.remaining).toBe(0);

    const r4 = checkRateLimit('user-2', testEndpoint, config);
    expect(r4.allowed).toBe(false);
    expect(r4.remaining).toBe(0);
  });

  it('blocks requests after limit is exceeded', () => {
    const config = { maxRequests: 2, windowMs: 60_000 };
    checkRateLimit('user-3', testEndpoint, config);
    checkRateLimit('user-3', testEndpoint, config);
    const result = checkRateLimit('user-3', testEndpoint, config);
    expect(result.allowed).toBe(false);
  });

  it('isolates users from each other', () => {
    const config = { maxRequests: 1, windowMs: 60_000 };
    checkRateLimit('user-a', testEndpoint, config);
    // user-a is exhausted, but user-b should still be allowed
    const result = checkRateLimit('user-b', testEndpoint, config);
    expect(result.allowed).toBe(true);
  });

  it('isolates endpoints from each other', () => {
    const config = { maxRequests: 1, windowMs: 60_000 };
    checkRateLimit('user-x', testEndpoint, config);
    // Same user, different endpoint should still be allowed
    const result = checkRateLimit('user-x', `${testEndpoint}-other`, config);
    expect(result.allowed).toBe(true);
  });

  it('falls back to IP when userId is null', () => {
    const config = { maxRequests: 1, windowMs: 60_000 };
    checkRateLimit(null, testEndpoint, config, '1.2.3.4');
    const result = checkRateLimit(null, testEndpoint, config, '1.2.3.4');
    expect(result.allowed).toBe(false);
  });

  it('uses "anonymous" when both userId and ip are absent', () => {
    const config = { maxRequests: 1, windowMs: 60_000 };
    checkRateLimit(null, testEndpoint, config);
    const result = checkRateLimit(null, testEndpoint, config);
    expect(result.allowed).toBe(false);
  });

  it('resets after window expires', () => {
    vi.useFakeTimers();

    const config = { maxRequests: 1, windowMs: 1_000 };
    checkRateLimit('user-timer', testEndpoint, config);
    const blocked = checkRateLimit('user-timer', testEndpoint, config);
    expect(blocked.allowed).toBe(false);

    // Advance past the window
    vi.advanceTimersByTime(1_100);

    const afterReset = checkRateLimit('user-timer', testEndpoint, config);
    expect(afterReset.allowed).toBe(true);

    vi.useRealTimers();
  });

  it('provides resetTime in the future', () => {
    const result = checkRateLimit('user-time', testEndpoint, RATE_LIMITS.READ);
    expect(result.resetTime).toBeGreaterThan(Date.now() - 1);
  });
});

describe('rateLimitMiddleware', () => {
  let testEndpoint: string;

  beforeEach(() => {
    testEndpoint = `/api/middleware-${Date.now()}-${Math.random()}`;
  });

  it('allows read requests within limit', () => {
    const result = rateLimitMiddleware('user-mw', testEndpoint, 'read');
    expect(result.allowed).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('returns error message when limit exceeded', () => {
    const writeEndpoint = `${testEndpoint}/write`;
    // Exhaust write limit (20 requests)
    for (let i = 0; i < RATE_LIMITS.WRITE.maxRequests; i++) {
      rateLimitMiddleware('user-mw-block', writeEndpoint, 'write');
    }
    const result = rateLimitMiddleware('user-mw-block', writeEndpoint, 'write');
    expect(result.allowed).toBe(false);
    expect(result.error).toContain('Rate limit exceeded');
  });

  it('uses INVITE config for invite endpoints', () => {
    const inviteEndpoint = '/api/spaces/123/members/invite';
    // Should use INVITE limit (60/min) not WRITE limit (20/min)
    for (let i = 0; i < 25; i++) {
      const result = rateLimitMiddleware('user-invite', inviteEndpoint, 'write');
      expect(result.allowed).toBe(true);
    }
  });
});

describe('getClientIP', () => {
  it('extracts IP from x-forwarded-for header', () => {
    const request = new Request('http://localhost', {
      headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
    });
    expect(getClientIP(request)).toBe('1.2.3.4');
  });

  it('extracts IP from x-real-ip header', () => {
    const request = new Request('http://localhost', {
      headers: { 'x-real-ip': '9.8.7.6' },
    });
    expect(getClientIP(request)).toBe('9.8.7.6');
  });

  it('prefers x-forwarded-for over x-real-ip', () => {
    const request = new Request('http://localhost', {
      headers: {
        'x-forwarded-for': '1.1.1.1',
        'x-real-ip': '2.2.2.2',
      },
    });
    expect(getClientIP(request)).toBe('1.1.1.1');
  });

  it('returns undefined when no IP headers present', () => {
    const request = new Request('http://localhost');
    expect(getClientIP(request)).toBeUndefined();
  });
});

describe('RATE_LIMITS config', () => {
  it('has expected tier values', () => {
    expect(RATE_LIMITS.READ.maxRequests).toBe(100);
    expect(RATE_LIMITS.WRITE.maxRequests).toBe(20);
    expect(RATE_LIMITS.INVITE.maxRequests).toBe(60);
  });

  it('all windows are 1 minute', () => {
    expect(RATE_LIMITS.READ.windowMs).toBe(60_000);
    expect(RATE_LIMITS.WRITE.windowMs).toBe(60_000);
    expect(RATE_LIMITS.INVITE.windowMs).toBe(60_000);
  });
});
