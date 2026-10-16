import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('returning-to chip appearance', () => {
  it('gives arcs the search glyph because the chip opens search', () => {
    const icons = readFileSync(
      resolve(process.cwd(), 'spa/src/pages/prototype/recall-kind-icons.ts'),
      'utf8',
    );
    expect(icons).toMatch(/arc:\s*'magnifying-glass'/);
    expect(icons).toMatch(/subject:\s*'magnifying-glass'/);
    expect(icons).toMatch(/reflectThread:\s*'arrow-right-arrow-left'/);
  });
});
