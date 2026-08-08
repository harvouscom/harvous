import { describe, expect, it } from 'vitest';
import {
  classifySaveFailure,
  MAX_SAVE_ATTEMPTS,
  nextBackoffDelayMs,
  saveFailureMessage,
  saveSignature,
  shouldRetrySave,
} from '../autosave-retry';

/** Stand-in for spa/src/lib/api's APIError — same shape the classifier reads. */
function apiError(status: number, retryAfterSec?: number) {
  return Object.assign(new Error(`HTTP ${status}`), { status, retryAfterSec });
}

describe('classifySaveFailure', () => {
  it('treats a version conflict as non-retryable', () => {
    // A 409 is deterministic: the retry reuses the same stale expectedVersion, so
    // retrying always fails. Auto-retrying this is what produced the save storm.
    expect(classifySaveFailure(apiError(409))).toEqual({ kind: 'conflict', retryable: false });
  });

  it('treats permission failures as non-retryable', () => {
    expect(classifySaveFailure(apiError(403))).toEqual({ kind: 'forbidden', retryable: false });
    expect(classifySaveFailure(apiError(404))).toEqual({ kind: 'forbidden', retryable: false });
  });

  it('treats rate limiting as retryable and carries Retry-After through', () => {
    expect(classifySaveFailure(apiError(429, 12))).toEqual({
      kind: 'rateLimited',
      retryable: true,
      retryAfterMs: 12_000,
    });
  });

  it('treats a 429 without Retry-After as retryable with no server-directed wait', () => {
    expect(classifySaveFailure(apiError(429))).toEqual({
      kind: 'rateLimited',
      retryable: true,
      retryAfterMs: undefined,
    });
  });

  it('treats server errors as transient', () => {
    expect(classifySaveFailure(apiError(500)).kind).toBe('transient');
    expect(classifySaveFailure(apiError(503)).retryable).toBe(true);
  });

  it('treats a response-less failure (offline, aborted) as transient', () => {
    expect(classifySaveFailure(new Error('Failed to fetch'))).toEqual({
      kind: 'transient',
      retryable: true,
    });
  });

  it('treats unmodelled 4xx as fatal', () => {
    expect(classifySaveFailure(apiError(400))).toEqual({ kind: 'fatal', retryable: false });
  });

  it('never throws on non-Error throws', () => {
    expect(classifySaveFailure(undefined).retryable).toBe(true);
    expect(classifySaveFailure('nope').kind).toBe('transient');
  });
});

describe('nextBackoffDelayMs', () => {
  it('grows exponentially and never returns zero', () => {
    const noJitter = () => 1; // full jitter factor -> 1.0
    expect(nextBackoffDelayMs(1, undefined, noJitter)).toBe(1_000);
    expect(nextBackoffDelayMs(2, undefined, noJitter)).toBe(2_000);
    expect(nextBackoffDelayMs(3, undefined, noJitter)).toBe(4_000);
    expect(nextBackoffDelayMs(4, undefined, noJitter)).toBe(8_000);
  });

  it('caps the exponential growth', () => {
    const noJitter = () => 1;
    expect(nextBackoffDelayMs(20, undefined, noJitter)).toBe(16_000);
  });

  it('jitters within the back half of the window, never below half', () => {
    expect(nextBackoffDelayMs(3, undefined, () => 0)).toBe(2_000);
    expect(nextBackoffDelayMs(3, undefined, () => 1)).toBe(4_000);
  });

  it('lets a server-sent Retry-After win over the exponential schedule', () => {
    // Retrying before the rate-limit window closes is guaranteed to 429 again.
    expect(nextBackoffDelayMs(1, 30_000, () => 0)).toBe(30_000);
    expect(nextBackoffDelayMs(9, 5_000, () => 1)).toBe(5_000);
  });

  it('ignores a nonsensical Retry-After', () => {
    expect(nextBackoffDelayMs(1, 0, () => 1)).toBe(1_000);
    expect(nextBackoffDelayMs(1, Number.NaN, () => 1)).toBe(1_000);
  });
});

describe('shouldRetrySave', () => {
  const transient = classifySaveFailure(apiError(500));

  it('stops at the attempt cap', () => {
    expect(shouldRetrySave(transient, MAX_SAVE_ATTEMPTS - 1)).toBe(true);
    expect(shouldRetrySave(transient, MAX_SAVE_ATTEMPTS)).toBe(false);
    expect(shouldRetrySave(transient, MAX_SAVE_ATTEMPTS + 1)).toBe(false);
  });

  it('never retries a non-retryable failure, even on the first attempt', () => {
    expect(shouldRetrySave(classifySaveFailure(apiError(409)), 1)).toBe(false);
    expect(shouldRetrySave(classifySaveFailure(apiError(403)), 1)).toBe(false);
    expect(shouldRetrySave(classifySaveFailure(apiError(400)), 1)).toBe(false);
  });
});

describe('saveSignature', () => {
  it('distinguishes payloads so further typing resets the retry count', () => {
    expect(saveSignature('t', 'a', '')).toBe(saveSignature('t', 'a', ''));
    expect(saveSignature('t', 'a', '')).not.toBe(saveSignature('t', 'ab', ''));
    expect(saveSignature('t', 'a', '')).not.toBe(saveSignature('t2', 'a', ''));
  });

  it('does not collide across the field boundary', () => {
    // Without a separator, ('ab','c') and ('a','bc') would hash the same.
    expect(saveSignature('ab', 'c', '')).not.toBe(saveSignature('a', 'bc', ''));
  });
});

describe('saveFailureMessage', () => {
  it('is short, human, and free of status codes or jargon', () => {
    const kinds = ['conflict', 'forbidden', 'rateLimited', 'transient', 'fatal'] as const;
    for (const kind of kinds) {
      for (const gaveUp of [true, false]) {
        const message = saveFailureMessage(kind, gaveUp);
        expect(message.length).toBeGreaterThan(0);
        expect(message).not.toMatch(/\b(409|429|4\d\d|5\d\d|HTTP|null|undefined)\b/);
        expect(message).not.toMatch(/canonical|payload|mutation|expectedVersion/i);
      }
    }
  });

  it('reassures that work is kept when we are still retrying', () => {
    expect(saveFailureMessage('transient', false)).toMatch(/safe on this device/i);
  });

  it('says something different once we have stopped retrying', () => {
    expect(saveFailureMessage('transient', true)).not.toBe(saveFailureMessage('transient', false));
  });
});

describe('declared failure kinds', () => {
  it('honors an error that names its own kind over the status guess', () => {
    // MissingExpectedNoteVersionError never reaches the network, so it has no status.
    // Treated as status-less it looked transient and bought five pointless retries.
    const declared = Object.assign(new Error('version unavailable'), {
      saveFailureKind: 'fatal' as const,
    });
    expect(classifySaveFailure(declared)).toEqual({ kind: 'fatal', retryable: false });
    expect(saveFailureMessage('fatal', false)).toMatch(/reload the note/i);
  });

  it('still treats a genuinely status-less network error as transient', () => {
    expect(classifySaveFailure(new Error('offline'))).toEqual({
      kind: 'transient',
      retryable: true,
    });
  });
});
