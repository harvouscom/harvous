/**
 * The chapter's sub-verse marks are styled by the same rule as the dock's, not a copy of it.
 *
 * D-1 paints a highlighted phrase into the chapter with the same helper that paints the dock's,
 * producing a `<mark>` with the same attributes. The dock's rule was ancestor-scoped, so the
 * chapter matched nothing and fell through to the user-agent default — a raw yellow `<mark>`
 * block, in a product whose highlight language is an accent underline. It shipped that way and
 * was caught by reading the computed style rather than by looking, because a yellow highlight
 * looks deliberate.
 *
 * The fix grew the selector list rather than the rule count. This pins that choice: the failure
 * mode is someone "tidying" the reader's selector into its own block in the reader's sheet,
 * which restores the drift `mark-spotlight.css` was created to prevent — the two would then
 * disagree the first time either changed.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const dock = readFileSync(
  resolve(process.cwd(), 'src/styles/scripture-pill-chrome.css'),
  'utf8',
);
const reader = readFileSync(
  resolve(process.cwd(), 'spa/src/styles/prototype-components.css'),
  'utf8',
);

/** The declaration block whose selector list contains `sel`. */
function blockFor(sel: string): string {
  const i = dock.indexOf(sel);
  expect(i, `selector not found: ${sel}`).toBeGreaterThan(-1);
  const open = dock.indexOf('{', i);
  const close = dock.indexOf('}', open);
  return dock.slice(open, close);
}

describe('the reader shares the dock mark rule', () => {
  it('resets the user-agent yellow for a chapter mark', () => {
    const block = blockFor('.pds-reader__verse-text mark[data-reference]');
    // The whole point: without this the chapter renders `background: yellow` from the UA sheet.
    expect(block).toMatch(/background:\s*transparent\s*!important/);
    expect(block).toMatch(/text-decoration:\s*underline/);
    // Through the variable, so a dim pass has something to override.
    expect(block).toContain('var(--mark-accent');
  });

  it('gives a highlight the scriptureLink weight in the chapter too', () => {
    const block = blockFor('.pds-reader__verse-text mark[data-entry-kind="scriptureLink"]');
    expect(block).toMatch(/text-decoration-thickness:\s*2px/);
    expect(block).toMatch(/text-underline-offset:\s*2px/);
  });

  it('carries every accent colour, so a recoloured phrase is not silently amber', () => {
    for (const c of ['neutral', 'warmAmber', 'skyBlue', 'violet', 'mintGreen', 'coralRose']) {
      expect(dock).toContain(`.pds-reader__verse-text mark[data-color="${c}"]`);
    }
  });

  it('shares the declarations rather than duplicating them into the reader sheet', () => {
    // One rule, two surfaces. A second copy in the reader's own sheet is the regression.
    expect(reader).not.toMatch(/\.pds-reader__verse-text\s+mark\[data-reference\]/);
    const block = blockFor('.pds-reader__verse-text mark[data-reference]');
    expect(dock.slice(dock.indexOf('.pds-reader__verse-text mark[data-reference]') - 200))
      .toContain('.scripture-pill-chrome__passage-html mark[data-reference]');
    expect(block.length).toBeGreaterThan(0);
  });
});
