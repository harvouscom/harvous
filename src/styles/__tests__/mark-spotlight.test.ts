/**
 * The spotlight contract, asserted against the stylesheet itself.
 *
 * There were three mechanisms for one idea and the dock could not join any of them. What makes
 * this one mechanism is not a selector — the surfaces genuinely draw different elements — it is
 * that they share an attribute, a dim colour and a restore rule. Those are the things that can
 * drift apart silently, so those are what this pins.
 *
 * Read as text rather than rendered: the failure mode is a rule being narrowed back to one
 * surface (which is what it was before), and that is visible in the source and invisible in a
 * screenshot.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sheet = readFileSync(resolve(process.cwd(), 'src/styles/mark-spotlight.css'), 'utf8');
const editor = readFileSync(
  resolve(process.cwd(), 'src/components/react/TiptapEditor.tsx'),
  'utf8',
);

describe('the spotlight is one contract, not one selector', () => {
  it('dims by attribute alone, with no surface prefix', () => {
    // `.proto-editor-surface .ProseMirror[data-dim-highlights]` is what this replaced. A prefix
    // creeping back is the regression: it would silently exclude the dock again.
    const dimBlock = sheet.slice(sheet.indexOf('[data-dim-highlights] mark'));
    expect(dimBlock).not.toMatch(/\.proto-editor-surface[^\n]*\[data-dim-highlights\]/);
    expect(sheet).toContain('[data-dim-highlights] mark');
  });

  it('covers the mark surfaces and the reader, which draws no marks at all', () => {
    // The note body and dock use <mark>; a highlighted verse is a decorated span and a saved
    // reference is `.reference-suggestion`. One idea, three element shapes.
    expect(sheet).toContain('[data-dim-highlights] mark');
    expect(sheet).toContain('[data-dim-highlights] .pds-reader__verse-text');
    expect(sheet).toContain('[data-dim-highlights] .reference-suggestion');
  });

  it('dims to tertiary and kills the accent glow', () => {
    expect(sheet).toMatch(/text-decoration-color:\s*var\(--pds-text-tertiary\)\s*!important/);
    // A dimmed mark keeping its dark-mode glow would leave the one thing meant to stand out as
    // the only thing not glowing.
    expect(sheet).toMatch(/text-shadow:\s*none\s*!important/);
  });

  it('injects a restore rule with no surface prefix either', () => {
    // The dim and the restore must be weighted the same, or which wins depends on sheet order.
    expect(editor).toContain('`[data-dim-highlights="${esc}"] [data-study-thread-id="${esc}"]`');
    expect(editor).toContain('{text-decoration-color:var(--mark-accent)!important}');
  });

  /**
   * The dock's accents had to stop being written straight onto `text-decoration-color` before any
   * of this could work — there was no variable to override. If that regresses, the dock silently
   * stops dimming and nothing else fails.
   */
  it('leaves the dock with a variable to override', () => {
    const dock = readFileSync(
      resolve(process.cwd(), 'src/styles/scripture-pill-chrome.css'),
      'utf8',
    );
    expect(dock).not.toMatch(
      /mark\[data-color="[a-zA-Z]+"\]\s*\{\s*text-decoration-color:\s*var\(--pds-highlight/,
    );
    expect(dock).toMatch(/mark\[data-color="violet"\]\s*\{\s*--mark-accent:/);
  });
});
