/**
 * The morph timer and the CSS it waits for.
 *
 * Same pairing the expanded sidebar keeps in proto-shell-expanded-sidebar.test.tsx,
 * and the same failure if it drifts: the panel is held mounted by a JS timeout
 * while the collapse is a CSS animation, so a constant that no longer matches
 * the token either cuts the morph off mid-flight or leaves a finished panel
 * sitting on screen with nothing happening.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PROTO_RESOURCE_MORPH_MS } from '../proto-motion';

function read(relative: string): string {
  return readFileSync(resolve(process.cwd(), relative), 'utf8');
}

describe('the resource morph timer matches the CSS it is waiting for', () => {
  it('PROTO_RESOURCE_MORPH_MS equals --pds-duration-morph', () => {
    const declared = /--pds-duration-morph:\s*(\d+)ms/.exec(read('spa/src/styles/prototype-tokens.css'));
    expect(declared).not.toBeNull();
    expect(Number(declared![1])).toBe(PROTO_RESOURCE_MORPH_MS);
  });

  it('every resource-add animation is timed by that token, not a literal', () => {
    const css = read('spa/src/styles/prototype-components.css');
    const lines = css.split('\n').filter((line) => /animation:\s*proto-resource-add-/.test(line));
    // The box, its accent layer, its contents leaving, its contents arriving,
    // and the button label.
    expect(lines).toHaveLength(5);
    for (const line of lines) {
      expect(line).toContain('var(--pds-duration-morph)');
    }
  });

  it('the collapse has its own keyframes rather than a reversed direction', () => {
    // `animation-direction: reverse` would also reverse the easing, and an
    // emphasized curve played backwards decelerates into the gesture.
    const css = read('spa/src/styles/prototype-components.css');
    expect(css).toContain('@keyframes proto-resource-add-morph-in');
    expect(css).toContain('@keyframes proto-resource-add-morph-out');
    expect(css).not.toMatch(/proto-resource-add[^\n]*animation-direction/);
  });

  it('keeps the accent gradient out of the morph keyframes', () => {
    /*
      A gradient and a colour are not interpolable — putting the accent in the
      keyframes made the browser swap them discretely at 50%, which is a flash
      of blue mid-morph. It belongs on the `::before` layer, which fades.
    */
    const css = read('spa/src/styles/prototype-components.css');
    const morphBlocks = /@keyframes proto-resource-add-morph-(?:in|out) \{[^@]*?\n\}/gs;
    const blocks = css.match(morphBlocks) ?? [];
    expect(blocks).toHaveLength(2);
    for (const block of blocks) {
      expect(block).not.toContain('--pds-bg-accent-button');
    }
  });

  it('carries its own reduced-motion guard instead of leaning on the global rule', () => {
    // The blanket 0.01ms rule in src/styles/animations.css still applies a
    // `both`-filled from-frame first, which is the jagged result
    // docs/REDUCE_MOTION_TROUBLESHOOTING.md warns about.
    const css = read('spa/src/styles/prototype-components.css');
    const guarded = css
      .split('@media (prefers-reduced-motion: reduce)')
      .some((block) => block.includes('.proto-resource-add--morphing'));
    expect(guarded).toBe(true);
  });
});
