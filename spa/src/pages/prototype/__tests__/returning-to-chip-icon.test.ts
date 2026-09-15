import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('returning-to chip appearance', () => {
  it('does not dress theme chips as Threads', () => {
    const greeting = readFileSync(
      resolve(process.cwd(), 'spa/src/pages/prototype/PrototypeHomeGreeting.tsx'),
      'utf8',
    );
    const start = greeting.indexOf('const isPassage = trend.kind === \'passage\'');
    expect(start).toBeGreaterThan(-1);
    const body = greeting.slice(start, greeting.indexOf('return (', start));
    expect(body).not.toContain("proto-home-greeting__chip--thread");
    expect(body).toContain('recallKindIcon(trend.kind)');
  });

  it('gives arcs the return glyph instead of the Thread glyph', () => {
    const icons = readFileSync(
      resolve(process.cwd(), 'spa/src/pages/prototype/recall-kind-icons.ts'),
      'utf8',
    );
    expect(icons).toMatch(/arc:\s*'arrow-rotate-left'/);
    expect(icons).toMatch(/subject:\s*'arrow-rotate-left'/);
    expect(icons).toMatch(/reflectThread:\s*'arrow-right-arrow-left'/);
  });
});
