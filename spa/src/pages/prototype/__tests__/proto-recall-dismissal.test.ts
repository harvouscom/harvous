import { describe, expect, it, beforeEach } from 'vitest';
import {
  activeCooldownIds,
  dismissedRecallIds,
  mergeServerRecallHistoryIntoCooldowns,
  recallRestoredAt,
  recordRecallDismissed,
  recordRecallSnoozed,
  restoreRecallOpportunity,
  RECALL_COOLDOWN_DAYS,
  type ServerRecallHistoryEntry,
} from '../proto-recall-cooldown';
import { RECALL_DISMISS_COPY, RECALL_SNOOZE_COPY } from '../proto-recall-copy';

/**
 * "Not interested" — the one answer with no expiry.
 *
 * Worth stating what these tests are guarding, because the defect they exist for was not a
 * crash. The control that promised permanence posted an ordinary snooze, so the promise was
 * broken silently, every time, for as long as the control existed — and nothing failed. The
 * only thing that could have caught it is a test that asserts the *absence* of an expiry, so
 * that is mostly what these are.
 */

const SPACE = 'space_home';
const DAY_MS = 24 * 60 * 60 * 1000;

describe('a permanent dismissal', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('is remembered', () => {
    recordRecallDismissed(SPACE, 'hl:7', 1_000);
    expect(dismissedRecallIds(SPACE).has('hl:7')).toBe(true);
  });

  /**
   * The reason it needs a store of its own.
   *
   * `recordRecallOpened` prunes every entry older than the window on each write, so a
   * permanent entry parked in that map would delete itself the first time anything else was
   * snoozed three weeks later.
   */
  it('is not held in the cooldown map, which prunes itself', () => {
    recordRecallDismissed(SPACE, 'hl:7', 1_000);
    recordRecallSnoozed(SPACE, 'other', 100);
    recordRecallSnoozed(SPACE, 'later', 100 + RECALL_COOLDOWN_DAYS + 1);

    expect(activeCooldownIds(SPACE, 100 + RECALL_COOLDOWN_DAYS + 1).has('hl:7')).toBe(false);
    expect(dismissedRecallIds(SPACE).has('hl:7')).toBe(true);
  });

  it('outlives every window there is', () => {
    recordRecallDismissed(SPACE, 'hl:7', 1_000);
    // A decade on. Any window-based storage would have dropped this long ago.
    expect(dismissedRecallIds(SPACE).has('hl:7')).toBe(true);
    expect(activeCooldownIds(SPACE, 3650).has('hl:7')).toBe(false);
  });

  it('is undone by a restore, which a snooze would have survived by expiring anyway', () => {
    recordRecallDismissed(SPACE, 'hl:7', 1_000);
    restoreRecallOpportunity(SPACE, 'hl:7', 2_000);

    expect(dismissedRecallIds(SPACE).has('hl:7')).toBe(false);
    expect(recallRestoredAt(SPACE)['hl:7']).toBe(2_000);
  });
});

describe('server history, merged', () => {
  const now = new Date('2026-08-21T12:00:00.000Z');
  const nowMs = now.getTime();
  const at = (daysAgo: number) => new Date(nowMs - daysAgo * DAY_MS).toISOString();

  const merge = (events: ServerRecallHistoryEntry[], restoredAt: Record<string, number> = {}) =>
    mergeServerRecallHistoryIntoCooldowns(new Set<string>(), events, now, undefined, restoredAt);

  it('suppresses a dismissal from years ago', () => {
    const merged = merge([{ opportunityId: 'hl:7', action: 'dismissed', createdAt: at(900) }]);
    expect(merged.has('hl:7')).toBe(true);
  });

  it('still expires a snooze from years ago, so the two are genuinely different', () => {
    const merged = merge([{ opportunityId: 'hl:7', action: 'snooze', createdAt: at(900) }]);
    expect(merged.has('hl:7')).toBe(false);
  });

  /**
   * The cross-device undo, and the reason it is a server action rather than a local flag.
   *
   * Dismiss on a phone, change your mind on a laptop. Without a `restored` row the laptop has
   * no way to say so, and because a dismissal never expires the mistake would stand forever.
   */
  it('lets a later restore from another device cancel a dismissal', () => {
    const merged = merge([
      { opportunityId: 'hl:7', action: 'dismissed', createdAt: at(10) },
      { opportunityId: 'hl:7', action: 'restored', createdAt: at(9) },
    ]);
    expect(merged.has('hl:7')).toBe(false);
  });

  /** Order in the response is not guaranteed; the restore has to win on timestamp, not position. */
  it('cancels regardless of the order the rows arrive in', () => {
    const merged = merge([
      { opportunityId: 'hl:7', action: 'restored', createdAt: at(9) },
      { opportunityId: 'hl:7', action: 'dismissed', createdAt: at(10) },
    ]);
    expect(merged.has('hl:7')).toBe(false);
  });

  it('does not let an old restore cancel a dismissal made after it', () => {
    const merged = merge([
      { opportunityId: 'hl:7', action: 'restored', createdAt: at(10) },
      { opportunityId: 'hl:7', action: 'dismissed', createdAt: at(9) },
    ]);
    expect(merged.has('hl:7')).toBe(true);
  });

  it('keeps a local restore working when the server knows nothing about it', () => {
    const merged = merge([{ opportunityId: 'hl:7', action: 'dismissed', createdAt: at(10) }], {
      'hl:7': nowMs - 9 * DAY_MS,
    });
    expect(merged.has('hl:7')).toBe(false);
  });

  it('leaves other suggestions alone', () => {
    const merged = merge([{ opportunityId: 'hl:7', action: 'dismissed', createdAt: at(1) }]);
    expect(merged.has('hl:8')).toBe(false);
  });
});

/**
 * The copy and the behaviour, asserted together.
 *
 * This is the pairing that came apart: the label said "again" while the handler wrote a
 * three-week window. Neither half is wrong on its own, which is why only a test that reads
 * both can catch the next drift.
 */
describe('what the controls promise', () => {
  it('offers two answers that do not describe the same thing', () => {
    expect(RECALL_SNOOZE_COPY.label).not.toBe(RECALL_DISMISS_COPY.label);
    expect(RECALL_SNOOZE_COPY.hint).toMatch(new RegExp(`${RECALL_COOLDOWN_DAYS / 7}\\s*weeks`));
    expect(RECALL_DISMISS_COPY.hint).toMatch(/never/i);
  });

  it('names the row in every aria label, so two suggestions are told apart', () => {
    expect(RECALL_SNOOZE_COPY.ariaFor('Genesis 1')).toContain('Genesis 1');
    expect(RECALL_DISMISS_COPY.ariaFor('Genesis 1')).toContain('Genesis 1');
  });
});
