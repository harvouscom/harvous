/**
 * The dashboard enter window and the CSS it has to outlast.
 *
 * Same pairing the morph and expanded-sidebar tests keep, with a sharper failure. The
 * `--enter` class is *removed* by a JS timeout while the animations it started are CSS, so
 * a window shorter than the cascade cuts rows off mid-fade: they snap from part-way to
 * fully opaque, which is precisely the "settles twice" artefact the single-settle gate
 * exists to prevent. Three numbers feed the window here rather than one, so it can drift
 * from any of them.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PROTO_HOME_ENTER_WINDOW_MS } from '../proto-motion';

function read(relative: string): string {
  return readFileSync(resolve(process.cwd(), relative), 'utf8');
}

function durationMs(css: string, token: string): number {
  const declared = new RegExp(`${token}:\\s*(\\d+)ms`).exec(css);
  expect(declared, `${token} should be declared in prototype-tokens.css`).not.toBeNull();
  return Number(declared![1]);
}

/** The cascade stops stepping after this many rows — keep in step with the `nth-child` rules. */
const CASCADE_ROW_CAP = 6;

describe('the home enter window matches the CSS it waits for', () => {
  it('outlasts the section fade, the row fade, and the full cascade', () => {
    const tokens = read('spa/src/styles/prototype-tokens.css');
    const section = durationMs(tokens, '--pds-duration-home-section');
    const row = durationMs(tokens, '--pds-duration-home-row');
    const step = durationMs(tokens, '--pds-duration-home-row-step');

    const lastRowEnds = row + step * (CASCADE_ROW_CAP - 1);
    expect(PROTO_HOME_ENTER_WINDOW_MS).toBeGreaterThanOrEqual(Math.max(section, lastRowEnds));

    // Slack, not a second animation's worth. A window far past the last frame leaves an
    // inert class on the view; one far short of it is the snap this test exists to catch.
    expect(PROTO_HOME_ENTER_WINDOW_MS).toBeLessThan(Math.max(section, lastRowEnds) + 400);
  });

  it('the cascade steps exactly as many rows as the window budgets for', () => {
    const css = read('spa/src/styles/prototype-components.css');
    const indices = [...css.matchAll(/\.proto-home-cascade > :nth-child\(([^)]+)\)\s*\{\s*--proto-home-row-i: (\d+);/g)];
    // Five explicit positions plus the `n + 6` catch-all that pins every later row.
    expect(indices).toHaveLength(CASCADE_ROW_CAP);
    expect(indices[indices.length - 1]![1]).toContain('n + 6');
    expect(Number(indices[indices.length - 1]![2])).toBe(CASCADE_ROW_CAP - 1);
  });

  it('both home animations are timed by tokens, not literals', () => {
    const css = read('spa/src/styles/prototype-components.css');
    const lines = css
      .split('\n')
      .filter((line) => /animation:\s*proto-home-(section|row)-in/.test(line));
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(line).toMatch(/var\(--pds-duration-home-(section|row)\)/);
      expect(line).not.toMatch(/\d+(\.\d+)?s/);
    }
  });

  it('the row cascade is honoured by reduced motion', () => {
    const css = read('spa/src/styles/prototype-components.css');
    const blocks = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g)]
      .map((m) => m[1]!)
      .filter((body) => body.includes('.proto-home-cascade > *'));
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatch(/animation:\s*none/);
  });

  it('every space dashboard opts its row panels into the cascade', () => {
    // The cascade is a named opt-in, which means a dashboard can lose it by omission: add a
    // panel, forget the class, and that one section arrives as a block while the rest fill
    // in. Nothing about the page looks broken, so nobody reports it. These three are the
    // surfaces that present as a dashboard and are expected to cascade together.
    const views = [
      // Home builds every shelf from this one component.
      'spa/src/pages/prototype/PrototypeHomeSection.tsx',
      'spa/src/pages/prototype/PrototypeSpaceHub.tsx',
      'spa/src/pages/prototype/PrototypeChurchHub.tsx',
      // Lanes those two views delegate whole sections to. Each renders its own panel, so
      // each has to opt in on its own — and a lane that does not is the visible bug: it
      // arrives as a block between two lanes that are filling in.
      'spa/src/pages/prototype/PrototypeChannelPairingSection.tsx',
      'spa/src/pages/prototype/PrototypeSpaceComingUp.tsx',
    ];
    for (const view of views) {
      const src = read(view);
      const optsIn = src.includes('proto-home-cascade') || /<ProtoToolsRowList[^>]*\scascade\b/.test(src);
      expect(optsIn, `${view} should opt its row panels into proto-home-cascade`).toBe(true);
    }
  });

  it('the shared row panel keeps the cascade off by default', () => {
    // ProtoToolsRowList is also inside sheets that animate themselves and inside note search,
    // whose rows are replaced on every keystroke. Defaulting it on would cascade there too.
    const src = read('spa/src/pages/prototype/proto-tools-registry.tsx');
    expect(src).toMatch(/cascade = false/);
  });

  it('the loading dots are honoured by reduced motion', () => {
    // No guard existed at all: the one mark on screen for every wait, repeating forever,
    // was the one piece of motion the setting could not switch off.
    const css = read('src/styles/global.css');
    const blocks = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g)]
      .map((m) => m[1]!)
      .filter((body) => body.includes('.load-more-indicator__dot'));
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatch(/animation:\s*none/);
  });
});
