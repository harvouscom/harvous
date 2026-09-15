/**
 * "lately returning to X" is a study-arc theme. There is often no Thread with
 * that name, so the chip must call the arc handler (propose a grouping) rather
 * than opening Threads or seeding a Library search with the label.
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

  it('proposes the arc when no Thread has that title, and never searches the name', () => {
    const hook = readFileSync(
      resolve(process.cwd(), 'spa/src/pages/prototype/use-home-surface-data.ts'),
      'utf8',
    );
    const start = hook.indexOf('const openStudyArc = useCallback');
    expect(start).toBeGreaterThan(-1);
    const body = hook.slice(start, hook.indexOf('}, [', start));
    expect(body).toContain('openExistingThreadByTitle(subject)');
    expect(body).toContain('proposeThread');
    expect(body).not.toContain('searchLibraryFor');
    expect(body).not.toContain('querySeed');
  });
});
