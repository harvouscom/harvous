/**
 * The panel's morph, in the parts a test can actually hold.
 *
 * Whether it *feels* right is a browser judgement. What can be asserted is the set of
 * properties it is allowed to animate, the curve it leaves on, and that reduced motion
 * softens rather than cuts — and each of those is a rule the first version broke, so each
 * gets a guard rather than a comment.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(
  resolve(process.cwd(), 'spa/src/styles/prototype-shell.css'),
  'utf8',
);

/** CSS with comments removed, so prose can mention braces without ending a rule. */
const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * The `.proto-library-panel { … }` rule body, base state only.
 *
 * Read from the comment-stripped copy: a docblock in that rule explains the panel is
 * `tabIndex={-1}`, and a naive scan for the next `}` stopped at the one inside that inline
 * code — silently slicing the rule short and passing the assertions on an empty tail.
 */
function panelRule(): string {
  const start = bare.indexOf('.proto-library-panel {');
  expect(start).toBeGreaterThan(-1);
  return bare.slice(start, bare.indexOf('}', start));
}

describe('the morph animates compositor properties only', () => {
  it('transitions nothing but transform and opacity', () => {
    /*
     * The finding that caused the rewrite. The first version animated `width` and
     * `grid-template-rows`, which is a layout pass per frame. If a layout property ever
     * reappears in this transition, that regression is back.
     */
    const body = panelRule();
    const transition = /transition:\s*([^;]+);/.exec(body);
    expect(transition).not.toBeNull();
    const properties = transition![1]
      .split(',')
      .map((part) => part.trim().split(/\s+/)[0])
      .filter(Boolean);
    expect(properties.sort()).toEqual(['opacity', 'transform']);
  });

  it('does not animate width, height or grid-template-rows anywhere in the panel', () => {
    const scoped = bare.slice(
      bare.indexOf('.proto-library-panel {'),
      bare.indexOf('.proto-library-sheet {'),
    );
    for (const layoutProp of ['width', 'height', 'grid-template-rows', 'border-radius']) {
      expect(scoped).not.toMatch(new RegExp(`transition:[^;]*\\b${layoutProp}\\b`));
    }
  });

  it('grows from the chip’s line, not the panel’s middle', () => {
    expect(panelRule()).toContain('transform-origin: top center');
  });
});

describe('the exit does not ease in', () => {
  it('leaves on --pds-ease-standard', () => {
    /*
     * On a dismissal the start is the moment being watched — you just asked for this to go
     * away. `--pds-ease-morph-exit` eases in, which reads as the panel hesitating.
     */
    const start = bare.indexOf('.proto-library-panel--exiting {');
    expect(start).toBeGreaterThan(-1);
    const rule = bare.slice(start, bare.indexOf('}', start));
    expect(rule).toContain('var(--pds-ease-standard)');
    expect(rule).not.toContain('var(--pds-ease-morph-exit)');
  });
});

describe('reduced motion is gentler, not absent', () => {
  /* The panel's own block, not the first one in the file — the stylesheet has several. */
  const block = (() => {
    const panelStart = css.indexOf('.proto-library-panel {');
    expect(panelStart).toBeGreaterThan(-1);
    const marker = css.indexOf('@media (prefers-reduced-motion: reduce) {', panelStart);
    expect(marker).toBeGreaterThan(-1);
    /* Comments stripped: this file explains what the old version did, and a prose mention
       of `display: none` should not read as a declaration of it. */
    return css.slice(marker, css.indexOf('\n}\n', marker)).replace(/\/\*[\s\S]*?\*\//g, '');
  })();

  it('still fades the panel rather than cutting it', () => {
    // The previous version set `display: none` on the exiting panel, which made a
    // dismissal a hard cut — the surface was simply gone between one frame and the next.
    expect(block).toContain('transition: opacity');
    expect(block).not.toContain('display: none');
  });

  it('drops the transform and the row stagger', () => {
    expect(block).toContain('transform: none');
    expect(block).toContain('animation: none');
  });
});

describe('the row stagger stays inside the perceptible band', () => {
  it('steps by 40ms', () => {
    // 30–80ms is where a stagger is felt rather than counted; below it reads as one
    // arrival, above it reads as a queue.
    const delays = [...css.matchAll(/animation-delay:\s*(\d+)ms/g)]
      .map((m) => Number(m[1]))
      .filter((ms) => ms > 0 && ms <= 200);
    expect(delays.length).toBeGreaterThan(0);
    for (const [i, ms] of delays.slice(0, 4).entries()) {
      expect(ms).toBe(40 * (i + 1));
    }
  });
});

describe('the close is the open, run backwards', () => {
  /*
   * All three of these were broken together, and they all made the same complaint: the
   * panel vanished where it stood and the chip appeared afterwards, so a close that was
   * meant to read as the panel *becoming* the pill read as the pill popping in.
   */

  it('fades the chip from the base rule, so the fade plays in both directions', () => {
    /*
     * The regression itself. The transition used to be declared only on
     * `.proto-library-chip--hidden`, and a transition is read from the *destination's*
     * computed style — so un-hiding had no rule to read and the chip snapped back. The
     * exit is the half of a dismissal you actually watch, and it was the half with no
     * animation at all.
     */
    const start = bare.indexOf('.proto-library-chip {');
    expect(start).toBeGreaterThan(-1);
    const rule = bare.slice(start, bare.indexOf('}', start));
    expect(rule).toMatch(/transition:[^;]*opacity/);
  });

  it('empties the panel before it retracts', () => {
    /*
     * This one had a comment and no rule for a while — the prose promised that contents
     * leave before the box closes, and nothing implemented it, so every row was still
     * fully opaque while the box scaled down onto the chip. Text being squashed is the
     * exact thing the counter-scale discussion elsewhere in this file exists to avoid.
     */
    const start = bare.indexOf('.proto-library-panel--exiting.proto-library-panel > *');
    expect(start).toBeGreaterThan(-1);
    const rule = bare.slice(start, bare.indexOf('}', start));
    expect(rule).toMatch(/opacity:\s*0/);
    expect(rule).toMatch(/transition:[^;]*opacity/);
  });

  it('gives the exit a transform to travel on, not just a transition for one', () => {
    /*
     * `--exiting` declares a `transform` transition. For a long time nothing ever set a
     * transform value, so the declaration was inert and the panel faded at full size. The
     * value now comes from the hook (it is measured, so it cannot live in CSS) — this
     * asserts the CSS half is still asking for it.
     */
    const start = bare.indexOf('.proto-library-panel--exiting {');
    expect(start).toBeGreaterThan(-1);
    const rule = bare.slice(start, bare.indexOf('}', start));
    expect(rule).toMatch(/transition:[^;]*transform/);
  });
});
