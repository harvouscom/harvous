import { describe, it, expect, beforeEach } from 'vitest';
import { RATE_LIMITS, rateLimitMiddleware } from '../rate-limit';
import { MIN_SAVE_INTERVAL_MS } from '../autosave-retry';

/**
 * The 429 this file exists to prevent: the editor's autosave floor used to be exactly the
 * server's write budget, so steady typing sat on the cap and any second write in the same
 * minute produced "Too many changes at once".
 */
describe('note-save budget', () => {
  let user = 0;
  beforeEach(() => {
    // A fresh identity per test — the limiter's store is module-level and per (user, path).
    user += 1;
  });
  const uid = () => `user-${user}`;

  it('allows 60 note saves in a window and rejects the 61st', () => {
    for (let i = 0; i < 60; i++) {
      const r = rateLimitMiddleware(uid(), '/api/notes/update', 'note-save');
      expect(r.allowed, `request ${i + 1} should be allowed`).toBe(true);
    }
    const over = rateLimitMiddleware(uid(), '/api/notes/update', 'note-save');
    expect(over.allowed).toBe(false);
    expect(over.resetTime).toBeTypeOf('number');
  });

  it('leaves the generic write budget at 20 — only note saves get the larger bucket', () => {
    for (let i = 0; i < 20; i++) {
      expect(rateLimitMiddleware(uid(), '/api/notes/delete', 'write').allowed).toBe(true);
    }
    expect(rateLimitMiddleware(uid(), '/api/notes/delete', 'write').allowed).toBe(false);
  });

  it('keeps real headroom between the client floor and the server cap', () => {
    const savesPerWindow = RATE_LIMITS.NOTE_SAVE.windowMs / MIN_SAVE_INTERVAL_MS;
    // The regression: savesPerMinute === maxRequests. Sustained typing must not be able to
    // reach the cap on its own, or the flushes and second surfaces have nowhere to go.
    expect(savesPerWindow).toBeLessThan(RATE_LIMITS.NOTE_SAVE.maxRequests);
    expect(RATE_LIMITS.NOTE_SAVE.maxRequests / savesPerWindow).toBeGreaterThanOrEqual(2);
  });
});
