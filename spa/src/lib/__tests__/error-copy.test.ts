import { beforeEach, describe, expect, it } from 'vitest';
import { APIError } from '../api';
import { presentError, resetErrorScopes } from '../error-copy';

/** Real strings the server returns today, written for developers rather than users. */
const SERVER_PROSE = [
  ['Note not found in space', 'NOT_FOUND', 404],
  ['Only the space owner can pin items', 'FORBIDDEN', 403],
  ['itemId, itemType, and isPinned are required', 'BAD_REQUEST', 400],
  ['Unsupported organization fields: order', 'BAD_REQUEST', 400],
  ['Space not found or access denied', 'NOT_FOUND', 404],
  ['This endpoint has been retired. Use POST /api/spaces/:spaceId/invites.', 'BAD_REQUEST', 400],
] as const;

describe('presentError', () => {
  beforeEach(() => resetErrorScopes());

  it('never surfaces raw server prose', () => {
    // The bug: every call site preferred err.message over its own written-for-humans
    // fallback, so whenever the server responded the user saw the developer string.
    for (const [message, code, status] of SERVER_PROSE) {
      const result = presentError(new APIError(status, message, code), 'Could not update pin');
      expect(result.message).not.toBe(message);
      expect(result.message).not.toMatch(/itemId|endpoint|POST |api\/|organization fields/i);
    }
  });

  it('maps a known code to short human copy', () => {
    expect(presentError(new APIError(403, 'Only the space owner can pin items', 'FORBIDDEN'), 'x').message)
      .toBe("You don't have permission to do that");
  });

  it('falls back to the caller copy for an unmapped code', () => {
    expect(presentError(new APIError(418, 'teapot', 'WEIRD'), 'Could not update pin').message)
      .toBe('Could not update pin');
  });

  it('surfaces allow-listed codes verbatim, because that copy is written for users', () => {
    const message = 'You have reached your note limit for the free plan';
    expect(presentError(new APIError(403, message, 'NOTE_LIMIT_EXCEEDED'), 'x').message).toBe(message);
  });

  it('does not use err.message for a plain Error either', () => {
    expect(presentError(new Error('Cannot read properties of undefined'), 'Could not delete note').message)
      .not.toMatch(/Cannot read properties/);
  });

  it('recognizes a network failure as offline', () => {
    expect(presentError(new TypeError('Failed to fetch'), 'Could not delete note').message)
      .toMatch(/offline/i);
  });

  describe('persistence', () => {
    it('auto-dismisses an ordinary failure', () => {
      // Every error toast used to be duration: Infinity with a Support button, which is
      // what made a one-off blip feel like a crash.
      expect(presentError(new APIError(404, 'Note not found in space', 'NOT_FOUND'), 'x').persistent)
        .toBe(false);
    });

    it('escalates only after repeated failures of the same operation', () => {
      const fail = () => presentError(new APIError(500, 'boom'), 'Could not save', { scope: 'pin' });
      expect(fail().persistent).toBe(false);
      expect(fail().persistent).toBe(false);
      const third = fail();
      expect(third.persistent).toBe(true);
      expect(third.action).toBe('support');
    });

    it('keeps unrelated operations on separate streaks', () => {
      presentError(new APIError(500, 'boom'), 'x', { scope: 'pin' });
      presentError(new APIError(500, 'boom'), 'x', { scope: 'pin' });
      expect(presentError(new APIError(500, 'boom'), 'x', { scope: 'delete' }).persistent).toBe(false);
    });

    it('never escalates rate limiting, which clears on its own', () => {
      const fail = () =>
        presentError(new APIError(429, 'Rate limit exceeded', 'RATE_LIMIT_EXCEEDED'), 'x', {
          scope: 'save',
        });
      fail();
      fail();
      expect(fail().persistent).toBe(false);
    });

    it('starts a fresh streak once the window lapses', () => {
      const at = (now: number) =>
        presentError(new APIError(500, 'boom'), 'x', { scope: 'pin' }, now);
      at(0);
      at(1_000);
      expect(at(90_000).persistent).toBe(false);
    });
  });
});
