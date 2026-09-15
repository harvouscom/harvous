/**
 * Thread-styled chips in the Home/Activity greeting must not seed a Library search.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = () =>
  readFileSync(resolve(process.cwd(), 'spa/src/pages/prototype/PrototypeHomeGreeting.tsx'), 'utf8');

describe('greeting Thread-styled chips', () => {
  it('open the Threads list instead of calling the search-fallback handler', () => {
    const text = source();
    expect(text).toContain("nav.openList('threads')");
    const start = text.indexOf('aria-label={`Open ${label}`}');
    expect(start).toBeGreaterThan(-1);
    const body = text.slice(start, start + 800);
    expect(body).toContain("nav.openList('threads')");
    expect(body).not.toContain('querySeed');
  });
});
