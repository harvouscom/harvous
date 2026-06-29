import { describe, expect, it, beforeEach } from 'vitest';
import {
  activeCooldownIds,
  recordRecallOpened,
  recordRecallSnoozed,
  recordRecallSectionEngaged,
  recentRecallSectionCounts,
  RECALL_COOLDOWN_DAYS,
} from '../proto-recall-cooldown';

const SPACE = 'space_home';

describe('proto-recall-cooldown', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('marks an opened item as active within the window', () => {
    recordRecallOpened(SPACE, 'note_a', 100);
    expect(activeCooldownIds(SPACE, 100).has('note_a')).toBe(true);
    expect(activeCooldownIds(SPACE, 100 + RECALL_COOLDOWN_DAYS - 1).has('note_a')).toBe(true);
  });

  it('expires items once the window has passed', () => {
    recordRecallOpened(SPACE, 'note_a', 100);
    expect(activeCooldownIds(SPACE, 100 + RECALL_COOLDOWN_DAYS).has('note_a')).toBe(false);
  });

  it('prunes stale entries on write to keep storage bounded', () => {
    recordRecallOpened(SPACE, 'old', 0);
    recordRecallOpened(SPACE, 'fresh', RECALL_COOLDOWN_DAYS + 1);
    const raw = localStorage.getItem(`harvous.prototype.recallCooldown.${SPACE}`)!;
    const map = JSON.parse(raw);
    expect(Object.keys(map)).toEqual(['fresh']);
  });

  it('refreshes the day on re-open', () => {
    recordRecallOpened(SPACE, 'note_a', 100);
    recordRecallOpened(SPACE, 'note_a', 200);
    expect(activeCooldownIds(SPACE, 200).has('note_a')).toBe(true);
    expect(activeCooldownIds(SPACE, 110).has('note_a')).toBe(true);
  });

  it('is space-scoped and tolerates missing inputs', () => {
    recordRecallOpened(SPACE, 'note_a', 100);
    expect(activeCooldownIds('space_other', 100).size).toBe(0);
    expect(activeCooldownIds(undefined, 100).size).toBe(0);
    recordRecallOpened(undefined, 'note_b', 100); // no-op, no throw
    recordRecallOpened(SPACE, '', 100); // no-op, no throw
    expect(activeCooldownIds(SPACE, 100).has('')).toBe(false);
  });

  it('snoozes synthetic trend opportunity ids', () => {
    recordRecallSnoozed(SPACE, 'arc:grace', 100);
    recordRecallSnoozed(SPACE, 'passage:John 3:16', 100);
    const active = activeCooldownIds(SPACE, 105);
    expect(active.has('arc:grace')).toBe(true);
    expect(active.has('passage:John 3:16')).toBe(true);
    // A different theme is a different opportunity — not suppressed by snoozing 'arc:grace'.
    expect(active.has('arc:hope')).toBe(false);
  });

  it('tracks recent recall section history for diversity', () => {
    recordRecallSectionEngaged(SPACE, 'paul');
    recordRecallSectionEngaged(SPACE, 'paul');
    recordRecallSectionEngaged(SPACE, 'gospels');
    expect(recentRecallSectionCounts(SPACE)).toEqual({ paul: 2, gospels: 1 });
  });
});
