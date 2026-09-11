/**
 * The planner's form asks what the study is before it asks when it meets.
 *
 * Asserted against the source, in the style of `planner-add-contract`, because
 * both things guarded here fail *silently*. A field order is invisible to types
 * and to every rendering test that queries by label rather than by position,
 * and the one-off time field was accepted by a form and discarded by a route
 * for weeks without anything failing.
 *
 * The ordering is not cosmetic. A room decides what it is going to study; when
 * it meets is an attribute of that, and usually already declared as the room's
 * rhythm. The form used to open with five time controls above the title.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const withoutComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const fields = () =>
  withoutComments(source('spa/src/pages/prototype/PrototypeSermonEditorFields.tsx'));

describe('the study comes before the date', () => {
  it('puts the title and the passage above the When section', () => {
    const text = fields();
    const title = text.indexOf('htmlFor="proto-service-title"');
    const reference = text.indexOf('htmlFor="proto-service-reference"');
    const when = text.indexOf('>\n          When\n        </label>');

    expect(title).toBeGreaterThan(-1);
    expect(reference).toBeGreaterThan(-1);
    expect(when).toBeGreaterThan(-1);
    expect(title).toBeLessThan(when);
    expect(reference).toBeLessThan(when);
  });

  it('keeps the series with the study rather than with the date', () => {
    // A run is what the study *is*, not when it happens.
    const text = fields();
    expect(text.indexOf('htmlFor="proto-service-series"')).toBeLessThan(
      text.indexOf('>\n          When\n        </label>'),
    );
  });

  it('opens When on the church plan and leaves it closed on a room', () => {
    /*
      On the church's plan a sermon really is a slot on a Sunday, and the slot
      checkboxes live inside this section — collapsing it there would hide the
      control that decides which of two Sunday services hears the sermon.
    */
    expect(fields()).toContain('planSpaceId == null || createDefaultDate === null');
  });
});

describe('the one-off time belongs to the church alone', () => {
  it('never offers it on a space plan', () => {
    /*
      Every space lane writes `serviceTime: null` server-side — a room that
      gathers as much as a channel that publishes. The condition used to be
      `planKind !== 'content'`, which caught the channel and missed the room, so
      a room's plan accepted a time and the server dropped it in silence.
    */
    const text = fields();
    expect(text).toContain('whenOpen && !isUnscheduled && isChurchLane && serviceTimeIds.length === 0');
    expect(text).toContain('const isChurchLane = planSpaceId == null');
  });

  it('the space routes really do refuse it, which is why the field is gated', () => {
    // If this ever stops being true the gate above is the thing to revisit.
    const route = withoutComments(source('server/routes/church-space-plan.ts'));
    expect(route).not.toMatch(/normalizeServiceTime\s*\(\s*body\.serviceTime/);
    expect(route).toContain('serviceTime: null');
  });
});

describe('a run can be planned as it is created', () => {
  it('counts weeks inclusively and chains the existing repeat route', () => {
    /*
      Create-then-repeat, deliberately: the repeat route already owns the weekly
      arithmetic, the 12-week cap and the stop-at-first-collision rule. A
      `weeks` field on create would restate all three.
    */
    const text = fields();
    expect(text).toContain("kind: 'repeat',");
    expect(text).toContain('weeks: createWeeks - 1,');
  });

  it('reports a run that stopped short as a partial success, not an error', () => {
    /*
      A four-week study whose third week is taken leaves three real rows. That
      is a short plan, not a failed save, and it must not reach `setError`.
    */
    const text = fields();
    const start = text.indexOf('if (!isEditing && serviceId && createWeeks > 1)');
    expect(start).toBeGreaterThan(-1);
    // Bounded to the block itself — `repeat()` below it reports its own failures
    // through setError, and that is correct there.
    const end = text.indexOf('onDone();', start);
    expect(end).toBeGreaterThan(start);
    const block = text.slice(start, end);
    expect(block).toContain('setNotice(');
    expect(block).not.toContain('setError(');
  });

  it('does not offer a run for an undated idea', () => {
    // The repeat route refuses one outright — there is no first week to count from.
    expect(fields()).toContain('{!isEditing && !isUnscheduled ? (');
  });
});
