import { describe, expect, it, beforeEach } from 'vitest';
import {
  activeCooldownIds,
  mergeServerRecallHistoryIntoCooldowns,
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

describe('mergeServerRecallHistoryIntoCooldowns', () => {
  const NOW = new Date('2026-08-03T12:00:00.000Z');
  const daysAgo = (n: number) =>
    new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

  it('keeps every local id', () => {
    const merged = mergeServerRecallHistoryIntoCooldowns(new Set(['local_a']), [], NOW);
    expect(merged.has('local_a')).toBe(true);
  });

  it('suppresses a card another device recently acted on', () => {
    // The cross-device half: acting on a phone should rest it on the desktop too.
    const merged = mergeServerRecallHistoryIntoCooldowns(
      new Set(),
      [{ opportunityId: 'book:John:4', action: 'open', createdAt: daysAgo(2) }],
      NOW,
    );
    expect(merged.has('book:John:4')).toBe(true);
  });

  it('lets an acted-on card return once its shorter window passes', () => {
    // Acting rests a card for 7 days, not the 21 an explicit dismissal earns.
    const merged = mergeServerRecallHistoryIntoCooldowns(
      new Set(),
      [{ opportunityId: 'book:John:4', action: 'open', createdAt: daysAgo(10) }],
      NOW,
    );
    expect(merged.has('book:John:4')).toBe(false);
  });

  it('holds a snoozed card for the full dismissal window', () => {
    const merged = mergeServerRecallHistoryIntoCooldowns(
      new Set(),
      [{ opportunityId: 'reflection:season:advent', action: 'snooze', createdAt: daysAgo(10) }],
      NOW,
    );
    expect(merged.has('reflection:season:advent')).toBe(true);
  });

  it('releases a snoozed card after its window', () => {
    const merged = mergeServerRecallHistoryIntoCooldowns(
      new Set(),
      [{ opportunityId: 'reflection:season:advent', action: 'snooze', createdAt: daysAgo(30) }],
      NOW,
    );
    expect(merged.has('reflection:season:advent')).toBe(false);
  });

  it('suppresses generative ids, which have no note behind them', () => {
    // These were the worst offenders: no noteId means no server stability bump, and
    // their ids are deterministic, so the identical card regenerated every render.
    const merged = mergeServerRecallHistoryIntoCooldowns(
      new Set(),
      [
        { opportunityId: 'crossref-gap:Rom 8:28|Gen 50:20', action: 'open', createdAt: daysAgo(1) },
        { opportunityId: 'reflection:season:advent', action: 'open', createdAt: daysAgo(1) },
      ],
      NOW,
    );
    expect(merged.has('crossref-gap:Rom 8:28|Gen 50:20')).toBe(true);
    expect(merged.has('reflection:season:advent')).toBe(true);
  });

  it('degrades to local-only when the server list is missing (offline)', () => {
    const merged = mergeServerRecallHistoryIntoCooldowns(new Set(['local_a']), undefined, NOW);
    expect([...merged]).toEqual(['local_a']);
  });

  it('ignores unparseable or future timestamps', () => {
    const merged = mergeServerRecallHistoryIntoCooldowns(
      new Set(),
      [
        { opportunityId: 'bad', action: 'open', createdAt: 'not-a-date' },
        { opportunityId: 'future', action: 'open', createdAt: daysAgo(-5) },
      ],
      NOW,
    );
    expect(merged.size).toBe(0);
  });
});
