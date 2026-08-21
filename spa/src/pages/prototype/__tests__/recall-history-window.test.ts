import { describe, expect, it } from 'vitest';
import { RECALL_HISTORY_WINDOW_DAYS } from '../../../../../server/routes/recall';
import {
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
