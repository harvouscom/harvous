import { describe, expect, it, beforeEach } from 'vitest';
import {
  activeCooldownIds,
  mergeServerRecallHistoryIntoCooldowns,
  recordRecallOpened,
  recordRecallSnoozed,
  recordRecallSectionEngaged,
  recentRecallSectionCounts,
  recallRestoredAt,
  restoreRecallOpportunity,
  RECALL_COOLDOWN_DAYS,
  RECALL_COMPLETED_COOLDOWN_DAYS,
  RECALL_OPENED_COOLDOWN_DAYS,
  RECALL_SNOOZE_LADDER_DAYS,
  recallSnoozeCount,
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

  /*
   * "Remind me later" is one answer; how long it lasts is inferred from how often the reader
   * has already said it about this card. Saying it repeatedly is a soft "not interested" they
   * never have to spell out, so each repeat backs off further.
   */
  it('lengthens the rest each time the same card is deferred', () => {
    const [first, second, third] = RECALL_SNOOZE_LADDER_DAYS;

    expect(recordRecallSnoozed(SPACE, 'note_a', 100)).toBe(first);
    // Deferred again the day it comes back.
    expect(recordRecallSnoozed(SPACE, 'note_a', 100 + first)).toBe(second);
    expect(recordRecallSnoozed(SPACE, 'note_a', 100 + first + second)).toBe(third);
    // And it stops there — only an explicit dismissal is allowed to mean never.
    expect(recordRecallSnoozed(SPACE, 'note_a', 400)).toBe(third);
  });

  it('climbs the ladder per card, not across the shelf', () => {
    const [first] = RECALL_SNOOZE_LADDER_DAYS;
    recordRecallSnoozed(SPACE, 'note_a', 100);
    recordRecallSnoozed(SPACE, 'note_a', 120);

    expect(recordRecallSnoozed(SPACE, 'note_b', 120)).toBe(first);
  });

  it('rests each entry for the window it climbed to', () => {
    const [first, second] = RECALL_SNOOZE_LADDER_DAYS;
    recordRecallSnoozed(SPACE, 'once', 100);
    recordRecallSnoozed(SPACE, 'twice', 100);
    recordRecallSnoozed(SPACE, 'twice', 100);

    expect(activeCooldownIds(SPACE, 100 + first).has('once')).toBe(false);
    // The longer rest is untouched by the shorter one having expired.
    expect(activeCooldownIds(SPACE, 100 + first).has('twice')).toBe(true);
    expect(activeCooldownIds(SPACE, 100 + second).has('twice')).toBe(false);
  });

  /* A short rest recorded later used to prune longer ones that still had time to run. */
  it('does not let a short rest evict a longer one still running', () => {
    recordRecallSnoozed(SPACE, 'rested', 100);
    recordRecallSnoozed(SPACE, 'rested', 100);
    recordRecallOpened(SPACE, 'opened', 110, RECALL_OPENED_COOLDOWN_DAYS);

    expect(activeCooldownIds(SPACE, 110).has('rested')).toBe(true);
  });

  /* Undoing a deferral means it did not happen — the ladder must not keep the credit. */
  it('resets the ladder when a deferral is undone', () => {
    const [first] = RECALL_SNOOZE_LADDER_DAYS;
    recordRecallSnoozed(SPACE, 'note_a', 100);
    restoreRecallOpportunity(SPACE, 'note_a');

    expect(recordRecallSnoozed(SPACE, 'note_a', 101)).toBe(first);
  });

  /* A card put off long ago and unseen since is the reader having changed, not persisting. */
  it('forgets the count after a year of silence', () => {
    const [first] = RECALL_SNOOZE_LADDER_DAYS;
    recordRecallSnoozed(SPACE, 'note_a', 100);

    expect(recallSnoozeCount(SPACE, 'note_a', 100 + 364)).toBe(1);
    expect(recallSnoozeCount(SPACE, 'note_a', 100 + 365)).toBe(0);
    expect(recordRecallSnoozed(SPACE, 'note_a', 100 + 365)).toBe(first);
  });

  /* Entries written before rests carried a window are bare day numbers; they read as the default. */
  it('reads pre-existing entries as the default window', () => {
    localStorage.setItem(
      `harvous.prototype.recallCooldown.${SPACE}`,
      JSON.stringify({ legacy: 100 }),
    );

    expect(activeCooldownIds(SPACE, 100 + RECALL_COOLDOWN_DAYS - 1).has('legacy')).toBe(true);
    expect(activeCooldownIds(SPACE, 100 + RECALL_COOLDOWN_DAYS).has('legacy')).toBe(false);
  });

  /* And a default-window rest is still written as a bare number, so an older tab can read it. */
  it('keeps the compact shape for default-window rests', () => {
    recordRecallOpened(SPACE, 'plain', 100);
    recordRecallOpened(SPACE, 'custom', 100, 7);

    const map = JSON.parse(localStorage.getItem(`harvous.prototype.recallCooldown.${SPACE}`)!);
    expect(map.plain).toBe(100);
    expect(map.custom).toEqual([100, 7]);
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

/**
 * "Nevermind" — the undo for having taken a suggestion you did not mean to.
 *
 * The local delete is the easy half. The half worth a test is that the server's own record
 * of the open, which the merge unions back in, stops counting — otherwise the row returns to
 * the shelf and vanishes again on the next render, which is worse than not offering the
 * action at all.
 */
describe('restoreRecallOpportunity', () => {
  const SPACE_R = 'space_restore';
  const NOW = new Date('2026-08-03T12:00:00.000Z');
  const daysAgo = (n: number) =>
    new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

  beforeEach(() => {
    localStorage.clear();
  });

  it('drops the local rest and records when it was put back', () => {
    recordRecallOpened(SPACE_R, 'hl:7', 100);
    expect(activeCooldownIds(SPACE_R, 100).has('hl:7')).toBe(true);

    restoreRecallOpportunity(SPACE_R, 'hl:7', NOW.getTime());

    expect(activeCooldownIds(SPACE_R, 100).has('hl:7')).toBe(false);
    expect(recallRestoredAt(SPACE_R)['hl:7']).toBe(NOW.getTime());
  });

  it('stops an already-written server open from bringing it back', () => {
    const merged = mergeServerRecallHistoryIntoCooldowns(
      new Set(),
      [{ opportunityId: 'hl:7', action: 'open', createdAt: daysAgo(1) }],
      NOW,
      undefined,
      { 'hl:7': NOW.getTime() },
    );
    expect(merged.has('hl:7')).toBe(false);
  });

  it('still rests it if you act on it again afterwards', () => {
    const restoredAt = NOW.getTime() - 3 * 24 * 60 * 60 * 1000;
    const merged = mergeServerRecallHistoryIntoCooldowns(
      new Set(),
      [{ opportunityId: 'hl:7', action: 'snooze', createdAt: daysAgo(1) }],
      NOW,
      undefined,
      { 'hl:7': restoredAt },
    );
    expect(merged.has('hl:7')).toBe(true);
  });
});

describe('a suggestion that was actually carried out', () => {
  const NOW = new Date('2026-08-03T12:00:00.000Z');
  const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

  it('rests far longer than one that was merely opened', () => {
    // Opening and abandoning the create-thread sheet should let the card come back. A thread
    // that exists should not be proposed again — it is no longer a suggestion.
    expect(RECALL_COMPLETED_COOLDOWN_DAYS).toBeGreaterThan(RECALL_OPENED_COOLDOWN_DAYS);

    const opened = mergeServerRecallHistoryIntoCooldowns(
      new Set(),
      [{ opportunityId: 'connect:a|b', action: 'open', createdAt: daysAgo(14) }],
      NOW,
    );
    const completed = mergeServerRecallHistoryIntoCooldowns(
      new Set(),
      [{ opportunityId: 'connect:a|b', action: 'complete', createdAt: daysAgo(14) }],
      NOW,
    );

    // Two weeks on, the open has expired and the completion has not.
    expect(opened.has('connect:a|b')).toBe(false);
    expect(completed.has('connect:a|b')).toBe(true);
  });

  it('lets the material come back round eventually', () => {
    const merged = mergeServerRecallHistoryIntoCooldowns(
      new Set(),
      [{ opportunityId: 'connect:a|b', action: 'complete', createdAt: daysAgo(45) }],
      NOW,
    );
    expect(merged.has('connect:a|b')).toBe(false);
  });

  it('is undone by putting the suggestion back, like any other event', () => {
    const at = daysAgo(2);
    const merged = mergeServerRecallHistoryIntoCooldowns(
      new Set(),
      [{ opportunityId: 'connect:a|b', action: 'complete', createdAt: at }],
      NOW,
      undefined,
      { 'connect:a|b': Date.parse(daysAgo(1)) },
    );
    expect(merged.has('connect:a|b')).toBe(false);
  });
});
