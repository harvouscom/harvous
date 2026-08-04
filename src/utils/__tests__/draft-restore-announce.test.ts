import { describe, expect, it } from 'vitest';
import { DRAFT_RESTORE_ANNOUNCE_AFTER_MS, shouldAnnounceDraftRestore } from '../note-draft-store';

/**
 * "Restored unsaved changes" fired on nearly every refresh-mid-typing, because the draft
 * writer runs on a tight debounce and saves take seconds — so the draft is almost always
 * a few seconds newer than the server. That taught users the toast is noise. Announce
 * only recoveries old enough to be a crash or an abandoned tab.
 */
describe('shouldAnnounceDraftRestore', () => {
  const NOW = 1_800_000_000_000;

  it('is silent for a draft written seconds ago (a refresh mid-typing)', () => {
    expect(shouldAnnounceDraftRestore(NOW - 3_000, NOW)).toBe(false);
  });

  it('announces a draft old enough to be a genuine recovery', () => {
    expect(shouldAnnounceDraftRestore(NOW - DRAFT_RESTORE_ANNOUNCE_AFTER_MS, NOW)).toBe(true);
  });

  it('announces when the timestamp is unreadable — silence must be earned', () => {
    expect(shouldAnnounceDraftRestore(Number.NaN, NOW)).toBe(true);
  });
});
