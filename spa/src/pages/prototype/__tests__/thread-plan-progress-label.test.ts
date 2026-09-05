/**
 * The member's own progress line.
 *
 * The counterpart to `pulseLabel`, and the failure it guards is a denominator:
 * the drilldown pages a Thread twenty notes at a time, so counting against the
 * loaded rows would report "3 of 20" on a twenty-five step plan. Both numbers
 * have to come off the server's view of the whole plan, and the shape of this
 * function — a count and a total, never a list of rendered rows — is what keeps
 * a caller from reaching for the page it happens to be holding.
 */
import { describe, expect, it } from 'vitest';
import { pulseLabel, viewerProgressLabel } from '../../../hooks/queries/useThreadNotes';

describe('viewerProgressLabel', () => {
  it('counts the viewer’s opened steps against the whole plan', () => {
    expect(viewerProgressLabel(['a', 'b', 'c'], 8)).toBe('3 of 8 steps opened');
  });

  it('says nothing on a plan the viewer has not begun', () => {
    // "0 of 8" is noise on the surface trying to get you to begin it — the
    // caller renders "Not started" instead.
    expect(viewerProgressLabel([], 8)).toBeNull();
  });

  it('says nothing on a plan with no steps yet', () => {
    expect(viewerProgressLabel([], 0)).toBeNull();
    expect(viewerProgressLabel(['a'], 0)).toBeNull();
  });

  it('counts one step once, however many times it was recorded', () => {
    expect(viewerProgressLabel(['a', 'a', 'b'], 4)).toBe('2 of 4 steps opened');
  });

  it('never claims more steps than the plan has', () => {
    /*
      The ids are narrowed server-side against the same live list `total` is
      counted from, so this cannot happen from a fresh payload. It can from one
      cached across the plan being shortened, and "9 of 8" is worse than a
      rounded truth.
    */
    expect(viewerProgressLabel(['a', 'b', 'c'], 2)).toBe('2 of 2 steps opened');
  });

  it('reads as the same kind of sentence as the leader’s line', () => {
    /*
      An owner sees both. Two phrasings for one idea would make them look like
      two different measurements rather than the room's answer and their own.
    */
    const mine = viewerProgressLabel(['a', 'b', 'c'], 8);
    const theirs = pulseLabel(
      { memberCount: 8, openedCountByNoteId: { a: 3 }, completedCount: 0 },
      'a',
    );
    expect(mine).toBe('3 of 8 steps opened');
    expect(theirs).toBe('3 of 8 opened');
  });
});
