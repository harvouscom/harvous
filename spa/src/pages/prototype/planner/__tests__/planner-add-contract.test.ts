/**
 * What the Planner's primary action makes, and why it may not claim it cannot
 * be used when it can.
 *
 * Source contracts rather than renders: the planner is a 700-line panel behind
 * a church-capability hook, and what must not happen here is a line quietly
 * reverting — the button going back to creating an undated row, or the church's
 * read-only reason being handed to a room again.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');
const withoutComments = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const planner = () =>
  withoutComments(source('spa/src/pages/prototype/planner/PrototypeExpandedPlanner.tsx'));
const compact = () =>
  withoutComments(source('spa/src/pages/prototype/PrototypeChurchTeachingPlanSection.tsx'));

describe('the primary action makes a dated row', () => {
  it('never opens the editor with no date', () => {
    /*
      The bug this replaces: a button reading "New gathering" called
      `setSelection({ mode: 'create', date: null })`. An undated row is backlog
      — `coming-up` never returns one — so the label named a thing the click
      could not produce, and the pane it opened was headed "New idea".
    */
    const text = planner();
    expect(text).not.toContain("{ mode: 'create', date: null }");
    expect(text).toContain("{ mode: 'create', date: nextPlanDate }");
  });

  it('takes the date from the plan’s own rhythm, with today as the floor', () => {
    // Not a hardcoded weekday. `nextOccurrenceOfDay(0)` — next Sunday — is the
    // mistake the note inspector already makes; the room's meeting day is the
    // answer, and a room that declared none still gets a real date.
    expect(planner()).toContain('rhythmDates({ ...rhythm, count: 1 })[0] ?? localTodayIso()');
  });

  it('the compact pane hands off the same date, not a null one', () => {
    const text = compact();
    expect(text).toContain("{ mode: 'create', date: nextPlanDate }");
    expect(text).not.toContain("{ mode: 'create', date: null }");
  });

  it('leaves the Ideas paths alone — they are how an undated row is made now', () => {
    // The board column and the calendar rail still pass null; that is the point.
    const board = withoutComments(
      source('spa/src/pages/prototype/planner/PrototypePlannerBoard.tsx'),
    );
    const calendar = withoutComments(
      source('spa/src/pages/prototype/planner/PrototypePlannerCalendar.tsx'),
    );
    expect(board + calendar).toContain('date: null');
  });
});

describe('read-only explains the room, not someone else’s church', () => {
  it('never hands a space entry the church’s reason', () => {
    /*
      The bug: `readOnlyReason` came from `useChurchPlannerAccess`, where
      `lapsed` is the *church's* sponsorship. A viewer whose church had lapsed
      was told "read-only while the church pilot is paused" in rooms with no
      church at all — while the add buttons stayed live, because `canWrite`
      disagreed with the banner.
    */
    const text = planner();
    expect(text).toContain('const effectiveReadOnlyReason');
    expect(text).toContain("? (effectiveCanWrite ? null : 'role')");
    // Views get the resolved sentence, never the raw church code.
    expect(text).not.toContain('readOnlyReason={readOnlyReason}');
  });

  it('a lapsed church still says so on its own plan', () => {
    // The fix must not swallow a true reason: the church lane is untouched.
    expect(planner()).toContain("'This plan is read-only while the church pilot is paused.'");
  });

  it('every view is given the reason, including the two that never were', () => {
    // Board, Calendar, List, Series, and the editor rail. Calendar and Series
    // are the two that were never passed it, so a read-only viewer on those
    // tabs watched every control vanish with nothing on screen saying why.
    const hits = planner().match(/readOnlyMessage=\{readOnlyMessage\}/g) ?? [];
    expect(hits).toHaveLength(5);
  });

  it('the role sentence is the plan’s own words', () => {
    // "A pastor or admin" is a church's answer; a book club has neither.
    const vocab = source('spa/src/lib/church-services.ts');
    expect(vocab).toContain("readOnlyRole: 'Whoever leads this space arranges its plan.'");
    expect(vocab).toContain("readOnlyRole: 'A pastor or admin changes what is planned here.'");
  });
});
