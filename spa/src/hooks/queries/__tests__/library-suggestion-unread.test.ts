/**
 * The unread count on the Suggestions chip.
 *
 * Unread means "waiting, and staff have not looked" — not "waiting". Before the
 * mark-read route existed, `staffReadAt` was written only by a review, so a
 * count of nulls was the queue's own length and a badge built on it could never
 * reach zero without someone approving or declining every last row.
 */
import { describe, expect, it } from 'vitest';
import { unreadLibrarySuggestionCount } from '../useChurchLibrary';

describe('unreadLibrarySuggestionCount', () => {
  it('counts only waiting suggestions nobody has looked at', () => {
    expect(
      unreadLibrarySuggestionCount([
        { status: 'open', staffReadAt: null },
        { status: 'open', staffReadAt: null },
        { status: 'open', staffReadAt: '2026-09-06T00:00:00Z' },
      ]),
    ).toBe(2);
  });

  it('does not count what has already been decided', () => {
    // A reviewed row carries the time it was decided, which is not a "read"
    // signal — and it is answered either way, so it is not waiting on anyone.
    expect(
      unreadLibrarySuggestionCount([
        { status: 'approved', staffReadAt: null },
        { status: 'declined', staffReadAt: null },
      ]),
    ).toBe(0);
  });

  it('is zero for an empty queue and for one that has not loaded', () => {
    expect(unreadLibrarySuggestionCount([])).toBe(0);
    expect(unreadLibrarySuggestionCount(undefined)).toBe(0);
  });
});
