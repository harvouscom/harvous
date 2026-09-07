/**
 * A suggestion row's trailing controls: one pair, one weight, above the rows below it.
 *
 * Three defects with one shape — the overflow trigger sits inside `.proto-recall-row__more`,
 * a wrapper that exists only to anchor the popover, so every `>` combinator aimed at the
 * trailing span reached the ✕ and missed the ⋮ standing right beside it.
 *
 * Read as stylesheet text rather than rendered, because what must not regress is the shape of
 * the selectors. The dangerous "fix" for all of this is a descendant selector, which looks
 * identical in a screenshot and quietly dims every item of the open menu.
 *
 * Matched by regex where the arm may or may not be last in its selector list: pinning a
 * literal `"<selector> {"` asserts the *ordering* of the arms as much as their presence, and
 * broke the moment two more wrappers with the same shape were added beside this one.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const components = readFileSync(
  resolve(process.cwd(), 'spa/src/styles/prototype-components.css'),
  'utf8',
);
const overrides = readFileSync(
  resolve(process.cwd(), 'spa/src/styles/prototype-route-overrides.css'),
  'utf8',
);

/*
 * Comments stripped before anything is asserted about *absence*.
 *
 * These stylesheets explain themselves at length, and a note recording that a rule was removed
 * quotes the selector it removed. A bare `toContain` cannot tell a declaration from a sentence
 * about one — which is how the row-lift test below passed for months against the paragraph
 * describing its own deletion.
 */
const rules = components.replace(/\/\*[\s\S]*?\*\//g, '');

const WRAPPED = '.proto-list-panel__row-trailing > .proto-recall-row__more > button';

/** `selector` as an arm of a rule — followed by another arm, or by the block itself. */
function arm(selector: string): RegExp {
  return new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*[,{]');
}

describe('the kebab is weighted like the dismiss glyph next to it', () => {
  it('dims the wrapped trigger at rest, hover, and focus', () => {
    expect(components).toMatch(arm(WRAPPED));
    expect(components).toContain(`${WRAPPED}:hover`);
    expect(components).toContain(`${WRAPPED}:focus-visible`);
    expect(components).toContain(
      '.proto-list-panel__row:hover .proto-list-panel__row-trailing > .proto-recall-row__more > button',
    );
  });

  it('lets the control the pointer is on outrank the row it sits in', () => {
    /*
     * A row-hover arm carries three classes and a pseudo-class; the reach-for-it arm carries
     * one and one. Left to fight, the row wins and its own control never reaches full — which
     * is what happened for as long as the two rules stood side by side. So every row-hover arm
     * has to stand down for the control being reached for, rather than the `:hover` rule being
     * expected to win on its own.
     */
    const STOOD_DOWN = ":not(:hover):not(:focus-visible):not([aria-expanded='true'])";
    const rowHoverArms = components
      .split('\n')
      .filter((line) => line.includes('.proto-list-panel__row:hover .proto-list-panel__row-trailing'));

    expect(rowHoverArms.length).toBeGreaterThan(0);
    for (const line of rowHoverArms) {
      expect(line).toContain(`button${STOOD_DOWN}`);
    }
  });

  it('never dims by descendant, which would take the open menu with it', () => {
    // `trailing button` (no `>`) reaches every `.proto-menu-item` inside the popover.
    expect(components).not.toMatch(/\.proto-list-panel__row-trailing\s+button\s*[,{]/);
    expect(overrides).not.toMatch(/\.proto-list-panel__row-trailing\s+button\s*[,{]/);
  });

  it('keeps the trigger lit while its own menu is open', () => {
    expect(components).toMatch(arm(`${WRAPPED}[aria-expanded='true']`));
  });

  it('does not ask `:has()` where the menu is, because it is not in the anchor', () => {
    /*
     * This was `.proto-recall-row__more:has(.proto-recall-row__menu) > button`, and that
     * condition stopped being satisfiable the day the popover was portaled to `document.body`:
     * React keeps it a child of its own tree, but `:has()` reads the DOM. The rule was dead for
     * as long as it stood, and the ⋮ dimmed under the panel it had just opened. `aria-expanded`
     * is on the trigger itself and cannot drift from where the menu is rendered.
     */
    expect(rules).not.toContain(':has(.proto-recall-row__menu)');
    expect(rules).not.toContain(':has(.proto-review-row__menu)');
  });

  it('paints the wrapped trigger the same colour as the direct one', () => {
    expect(overrides).toContain(`html.harvous-prototype-route ${WRAPPED}`);
  });
});

describe('an open menu outranks the rows beneath it', () => {
  /*
   * The row-lift this once guarded is gone, and correctly so: the popover is portaled to
   * `document.body`, so it has no ancestor stacking context left to escape and there is
   * nothing for a `z-index` on the row to do. What is asserted now is that it stays gone —
   * the old test looked for the selector in the file and found it in the very comment that
   * records its removal, so it went on passing against a rule that no longer existed.
   */
  it('does not lift the row, now that the menu is not inside it', () => {
    expect(rules).not.toContain('.proto-list-panel__row:has(.proto-recall-row__menu)');
  });
});

describe('the row text is not inset on one side only', () => {
  it('gives the title column the width the asymmetric padding was holding', () => {
    const i = components.indexOf('.proto-list-panel__row-main {');
    expect(i).toBeGreaterThan(-1);
    const block = components.slice(i, components.indexOf('}', i));
    // Right padding is 0: the negative margin cancels top/bottom/left into hit area, and the
    // right had no margin to cancel it, so it stacked with the row's padding and the flex gap.
    expect(block).toMatch(/padding:\s*11px\s+0\s+11px\s+13px/);
    // The margin must NOT gain a right value — the hit area would slide under the dismiss glyph.
    expect(block).toMatch(/margin:\s*-11px\s+0\s+-11px\s+-13px/);
  });
});
