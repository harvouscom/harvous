import { describe, expect, it } from 'vitest';
import { parseNotePenPresence, resolvePenHolder } from '../useNoteEditLease';

function claim(userId: string, claimedAt: number, holding = true) {
  return { userId, displayName: userId, color: 'blue', holding, claimedAt };
}

describe('resolvePenHolder', () => {
  it('reports nobody when no one is claiming', () => {
    expect(resolvePenHolder([])).toBeNull();
    expect(resolvePenHolder([claim('a', 100, false), claim('b', 200, false)])).toBeNull();
  });

  it('gives the pen to the earliest claim', () => {
    expect(resolvePenHolder([claim('b', 200), claim('a', 100)])?.userId).toBe('a');
  });

  it('breaks exact ties by userId so every client agrees', () => {
    // Two people can claim inside one presence round-trip. There is no arbiter —
    // correctness depends on every client sorting to the same winner, in any order.
    const forward = resolvePenHolder([claim('zoe', 500), claim('adam', 500)]);
    const reverse = resolvePenHolder([claim('adam', 500), claim('zoe', 500)]);
    expect(forward?.userId).toBe('adam');
    expect(reverse?.userId).toBe('adam');
  });

  it('ignores non-claimants entirely', () => {
    expect(resolvePenHolder([claim('a', 100, false), claim('b', 900)])?.userId).toBe('b');
  });
});

describe('parseNotePenPresence', () => {
  it('rejects payloads without a user id', () => {
    expect(parseNotePenPresence(null)).toBeNull();
    expect(parseNotePenPresence({})).toBeNull();
    expect(parseNotePenPresence({ displayName: 'Ann' })).toBeNull();
  });

  it('defaults a malformed claim to not holding, never to holding', () => {
    // Fail-closed: a garbled payload must not be able to seize the pen.
    const parsed = parseNotePenPresence({ userId: 'u1', holding: 'yes', claimedAt: 'soon' });
    expect(parsed).toEqual({
      userId: 'u1',
      displayName: 'Member',
      color: 'blue',
      holding: false,
      claimedAt: 0,
    });
  });
});
