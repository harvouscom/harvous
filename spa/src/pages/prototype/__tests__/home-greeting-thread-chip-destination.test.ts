/**
 * "lately returning to X" is a study-arc theme, not a Thread title.
 * The greeting chip must run `trend.onOpen` (openStudyArc → propose the grouping)
 * rather than opening the Threads list or seeding a Library search with the label.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('greeting returning-to chip', () => {
  it('lets the trend handler run instead of opening the Threads list', () => {
    const greeting = readFileSync(
      resolve(process.cwd(), 'spa/src/pages/prototype/PrototypeHomeGreeting.tsx'),
      'utf8',
    );
    const start = greeting.indexOf('aria-label={`Open ${label}`}');
    expect(start).toBeGreaterThan(-1);
    const body = greeting.slice(start, start + 400);
    expect(body).toContain('onClick={trend.onOpen}');
    expect(body).not.toContain("nav.openList('threads')");
    expect(body).not.toContain('querySeed');
  });

  it('wires the returning-to clause to openStudyArc', () => {
    const hook = readFileSync(
      resolve(process.cwd(), 'spa/src/pages/prototype/use-home-surface-data.ts'),
      'utf8',
    );
    expect(hook).toContain("kind: 'arc'");
    expect(hook).toContain('onOpen: openStudyArc');
    const start = hook.indexOf('const openStudyArc = useCallback');
    expect(start).toBeGreaterThan(-1);
    const body = hook.slice(start, hook.indexOf('}, [', start));
    expect(body).toContain('proposeThread');
  });
});
