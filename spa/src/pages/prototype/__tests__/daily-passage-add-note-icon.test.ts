/**
 * Today's passage "make a note" control wears the same glyph as New note.
 *
 * The trailing slot used a plus, which is how every other "add something" control in the
 * app draws itself — add a person, add a gathering, add a space. Making a note is not
 * adding an item to a list; it is composing, and the toolbar already has a glyph for that.
 *
 * Source-inspected because the seam is JSX, not a value. The regression this exists for is
 * the plus coming back, which would look correct in isolation and wrong next to the
 * toolbar's New note button.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

function addNoteBranch(): string {
  const file = source('spa/src/pages/prototype/PrototypeDailyPassagePill.tsx');
  const start = file.indexOf('aria-label="Add passage to notes"');
  expect(start).toBeGreaterThan(-1);
  return file.slice(start, start + 400);
}

describe("today's passage add-note glyph", () => {
  it('uses the same icon the toolbar uses for New note', () => {
    const branch = addNoteBranch();
    expect(branch).toContain('name="pen-to-square"');
    expect(branch).not.toContain('name="plus"');
  });

  it('is the glyph ShellModeSegmented draws for compose', () => {
    const toolbar = source('spa/src/pages/prototype/ShellModeSegmented.tsx');
    expect(toolbar).toContain('<Icon name="pen-to-square"');
  });
});
