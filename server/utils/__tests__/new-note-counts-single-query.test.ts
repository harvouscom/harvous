/**
 * Source-contract test for the badge counts staying one query.
 *
 * `getNewNoteCountsForUser` used to read the membership list and then fire
 * `countNewNotesInSpaceSince` once per space, all at once through `Promise.all`. The width of
 * that fan-out is however many shared spaces you belong to; the pool it draws from is ten
 * connections wide (`server/db/client.ts`) against a session-mode pooler that caps at fifteen
 * clients. A member of a dozen rooms could exhaust it alone, on every navigation load — and
 * because the pool is shared, the query that then failed was whichever one lost the race, not
 * the one at fault. Unbounded concurrency against a fixed pool is not parallelism.
 *
 * What made it look like N queries were unavoidable is the per-space watermark, and it is not:
 * `lastVisitedAt ?? joinedAt` lives on the membership row already being joined, so `coalesce`
 * in the join condition answers for every space in one grouped query.
 *
 * These assertions are about shape, not results — equivalence of the two forms rests on
 * `SpaceMemberships_space_user_unique` (one membership row per space+user, so the join cannot
 * multiply a note) and `joinedAt` being NOT NULL (so the coalesce is total).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

/** The body of `getNewNoteCountsForUser`, comments stripped — prose is not code. */
const fn = () => {
  const text = source('server/utils/shared-space-visit.ts');
  const start = text.indexOf('export async function getNewNoteCountsForUser');
  expect(start).toBeGreaterThan(-1);
  const end = text.indexOf('\nexport ', start + 1);
  return text
    .slice(start, end > start ? end : undefined)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
};

describe('getNewNoteCountsForUser', () => {
  it('never fans out one query per membership', () => {
    const body = fn();
    // The exact shape that exhausted the pool: a map of awaits handed to Promise.all.
    expect(body).not.toContain('Promise.all');
    expect(body).not.toContain('countNewNotesInSpaceSince');
  });

  it('answers every space in a single grouped query', () => {
    const body = fn();
    expect(body).toContain('.groupBy(');
    // One `await db` and no more — a second would be the fan-out growing back by another route.
    expect(body.match(/await db/g) ?? []).toHaveLength(1);
  });

  it('keeps the per-space watermark, as coalesce in the join', () => {
    const body = fn();
    // `visitWatermark` in SQL: last visit, falling back to when you joined.
    expect(body).toMatch(/coalesce\(\$\{SpaceMemberships\.lastVisitedAt\},\s*\$\{SpaceMemberships\.joinedAt\}\)/);
    expect(body).toContain('gt(');
  });

  it('still says what the badge means: others’ notes, in rooms you are in, not deleted', () => {
    const body = fn();
    // Dropping any of these silently changes the number rather than breaking anything.
    expect(body).toContain('ne(Notes.userId, userId)'); // not your own edits
    expect(body).toContain('eq(SpaceMemberships.userId, userId)'); // rooms you belong to
    expect(body).toContain('isNull(SpaceNotes.removedAt)');
    expect(body).toContain('isNull(Spaces.deletedAt)');
    expect(body).toContain("ne(Spaces.type, 'personal')");
    expect(body).toContain('eq(Notes.contentEncrypted, false)');
  });

  it('joins membership on space AND user, which is what makes the count per-viewer', () => {
    // Joining on spaceId alone would count every member's watermark against every note.
    expect(fn()).toMatch(
      /eq\(SpaceMemberships\.spaceId,\s*SpaceNotes\.spaceId\),\s*eq\(SpaceMemberships\.userId,\s*userId\)/,
    );
  });
});
