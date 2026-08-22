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

const WRAPPED = '.proto-list-panel__row-trailing > .proto-recall-row__more > button';

describe('the kebab is weighted like the dismiss glyph next to it', () => {
  it('dims the wrapped trigger at rest, hover, and focus', () => {
    expect(components).toContain(`${WRAPPED} {`);
    expect(components).toContain(`${WRAPPED}:hover`);
    expect(components).toContain(`${WRAPPED}:focus-visible`);
    expect(components).toContain(
      '.proto-list-panel__row:hover .proto-list-panel__row-trailing > .proto-recall-row__more > button',
    );
  });

  it('never dims by descendant, which would take the open menu with it', () => {
    // `trailing button` (no `>`) reaches every `.proto-menu-item` inside the popover.
    expect(components).not.toMatch(/\.proto-list-panel__row-trailing\s+button\s*[,{]/);
    expect(overrides).not.toMatch(/\.proto-list-panel__row-trailing\s+button\s*[,{]/);
  });

  it('keeps the trigger lit while its own menu is open', () => {
    expect(components).toContain(
      '.proto-list-panel__row-trailing > .proto-recall-row__more:has(.proto-recall-row__menu) > button',
    );
  });

  it('paints the wrapped trigger the same colour as the direct one', () => {
    expect(overrides).toContain(`html.harvous-prototype-route ${WRAPPED}`);
  });
});

describe('an open menu outranks the rows beneath it', () => {
  it('lifts the row, since the menu cannot escape its row stacking context', () => {
    // The row is `position: relative; z-index: 1`, so the menu's own 5000 only ever ranked it
    // inside its own row. Raising the menu again would change nothing.
    const sel = '.proto-list-panel__row:has(.proto-recall-row__menu)';
    const i = components.indexOf(sel);
    expect(i).toBeGreaterThan(-1);
    const block = components.slice(components.indexOf('{', i), components.indexOf('}', i));
    expect(block).toMatch(/z-index:\s*3/);
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
