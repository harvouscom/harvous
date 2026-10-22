import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('returning-to chip appearance', () => {
  it('gives arcs and themes the Thread glyph because the chip opens a Thread suggestion', () => {
    const icons = readFileSync(
      resolve(process.cwd(), 'spa/src/pages/prototype/recall-kind-icons.ts'),
      'utf8',
    );
    expect(icons).toMatch(/arc:\s*'arrow-right-arrow-left'/);
    expect(icons).toMatch(/subject:\s*'arrow-right-arrow-left'/);
    expect(icons).toMatch(/searchGap:\s*'magnifying-glass'/);
    expect(icons).toMatch(/reflectThread:\s*'arrow-right-arrow-left'/);
  });
});
