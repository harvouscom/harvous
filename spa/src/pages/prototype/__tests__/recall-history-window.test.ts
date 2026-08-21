import { describe, expect, it } from 'vitest';
import { RECALL_HISTORY_WINDOW_DAYS } from '../../../../../server/routes/recall';
import { collapseRecallHistory } from '../../../../../server/utils/record-recall-event';
import { RECALL_UNBOUNDED_ACTIONS } from '@/utils/recall-opportunity-kinds';
import {
  mergeServerRecallHistoryIntoCooldowns,
  RECALL_COMPLETED_COOLDOWN_DAYS,
  RECALL_COOLDOWN_DAYS,
  RECALL_OPENED_COOLDOWN_DAYS,
} from '../proto-recall-cooldown';

/**
 * The server only returns recall events from the last N days, and the client suppresses
 * suggestions using windows of its own. If N is shorter than the longest client window, events in
 * the gap are never sent — so a suggestion answered on one device keeps appearing on another, and
 * nothing anywhere reports an error.
 *
 * That is exactly what happened: the server window was 21, correct while the longest client window
 * was `RECALL_COOLDOWN_DAYS`, and silently wrong once `RECALL_COMPLETED_COOLDOWN_DAYS` arrived at
 * 30. This test compares the constants rather than asserting a number, so the next window added on
 * the client fails here instead of leaking quietly.
 */
describe('the server history window covers every client cooldown', () => {
  const clientWindows = {
    open: RECALL_OPENED_COOLDOWN_DAYS,
    snooze: RECALL_COOLDOWN_DAYS,
    complete: RECALL_COMPLETED_COOLDOWN_DAYS,
  };

  it.each(Object.entries(clientWindows))(
    'reaches back far enough for a %s (%i days)',
    (_name, windowDays) => {
      expect(RECALL_HISTORY_WINDOW_DAYS).toBeGreaterThanOrEqual(windowDays as number);
    },
  );

  it('keeps headroom past the longest one, so a boundary day is not lost to clock skew', () => {
    const longest = Math.max(...Object.values(clientWindows));
    expect(RECALL_HISTORY_WINDOW_DAYS).toBeGreaterThan(longest);
  });
});

/**
 * ...and the actions the window must not be applied to at all.
 *
 * `dismissed` says never. Fetching it through the window above would hand the suggestion back
 * on day 32 — the same class of silent failure the window test guards, but with a worse
 * result: a completion leaking early costs a few days, a dismissal leaking breaks a promise
 * the reader was given in as many words. `restored` travels with it because it is the undo,
 * and an undo that expired before the thing it undoes is not one.
 *
 * There is no number to assert here, which is the point — these tests check that the pieces
 * still agree that no number applies.
 */
describe('the actions with no window', () => {
  const now = new Date('2026-08-21T12:00:00.000Z');
  const ancient = new Date(now.getTime() - 900 * 24 * 60 * 60 * 1000).toISOString();

  it('declares exactly the two that never expire', () => {
    expect([...RECALL_UNBOUNDED_ACTIONS].sort()).toEqual(['dismissed', 'restored']);
  });

  it('carries them through the server collapse', () => {
    const collapsed = collapseRecallHistory([
      { opportunityId: 'hl:7', action: 'dismissed', createdAt: ancient },
      { opportunityId: 'hl:8', action: 'restored', createdAt: ancient },
      { opportunityId: 'hl:9', action: 'impression', createdAt: ancient },
    ]);
    expect(collapsed.map((e) => e.action).sort()).toEqual(['dismissed', 'restored']);
  });

  it('suppresses on the client at an age no window would reach', () => {
    const merged = mergeServerRecallHistoryIntoCooldowns(
      new Set<string>(),
      [{ opportunityId: 'hl:7', action: 'dismissed', createdAt: ancient }],
      now,
    );
    expect(merged.has('hl:7')).toBe(true);
    // Far outside the server's own fetch window, which is why the route reads these separately.
    expect(900).toBeGreaterThan(RECALL_HISTORY_WINDOW_DAYS);
  });
});
