/**
 * Source-contract test for GET /api/scripture/passage-context.
 *
 * Cross-references, themes and people/places are the public knowledge layer; only the related
 * notes belong to someone. Behind `requireAuth` a guest's "Show cross-references" toggle got a
 * 401 and showed nothing, so the route is open — and the one per-user read must stay keyed on
 * the caller and skipped when there is none.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const routeLine = () => {
  const text = read('server/routes/tags-scripture.ts');
  const start = text.indexOf("app.get('/api/scripture/passage-context'");
  expect(start).toBeGreaterThan(-1);
  return { text, start, line: text.slice(start, text.indexOf('\n', start)) };
};

describe('GET /api/scripture/passage-context', () => {
  it('answers a visitor with no session', () => {
    const { line } = routeLine();
    expect(line).not.toContain('requireAuth');
  });

  it('passes the caller, or null, and never a user id from the request', () => {
    const { text, start } = routeLine();
    const body = text.slice(start, text.indexOf('\n});', start));
    expect(body).toContain('getAuth(c).userId ?? null');
    expect(body).not.toContain('getAuthenticatedAuth');
    expect(body).not.toMatch(/c\.req\.query\(\s*'userId'\s*\)/);
    expect(body).toContain('getPassageContext(userId,');
  });

  it('reads related notes only for a signed-in caller', () => {
    const lib = read('server/utils/scripture-knowledge.ts');
    const fn = lib.slice(lib.indexOf('export async function getPassageContext('));
    expect(fn).toMatch(/userId: string \| null/);
    const guarded = fn.indexOf('userId\n    ? await getRelatedNotesForPassages(userId');
    expect(guarded).toBeGreaterThan(-1);
  });
});
