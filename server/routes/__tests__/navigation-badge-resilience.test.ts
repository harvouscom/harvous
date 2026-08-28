/**
 * Source-contract test for the one thing navigation must never do: fail over a badge.
 *
 * `/api/navigation/data` carries the sidebar — threads, spaces, the inbox count. The
 * per-space "new since you were here" counts ride along with it and are decorative. The
 * route used to rethrow any badge-count failure that was not one of two specific
 * "schema not pushed yet" errors, which made every other failure fatal to the whole
 * payload: one `count(*)` erroring took the entire sidebar with it and handed the client a
 * 500 naming a query it never asked for.
 *
 * Observed for real when the database connection pool was briefly exhausted — nothing was
 * wrong with the badge query, it was just the one in flight when connections ran out.
 *
 * `getSharedSpaceCountsForNotesBatch` states the same rule for the notes list ("Never fail
 * a notes list over a decorative count"), so this is the asymmetry closing, not a new idea.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

/** Prose mentioning `throw` is not a throw — assert against code only. */
const withoutComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/** The `try` around the badge counts, up to the end of its catch arm. */
const badgeCountBlock = () => {
  const text = source('server/routes/navigation.ts');
  const start = text.indexOf('newNoteCounts = await getNewNoteCountsForUser(userId);');
  expect(start).toBeGreaterThan(-1);
  const end = text.indexOf('// Ensure threads and spaces have backgroundGradient', start);
  expect(end).toBeGreaterThan(start);
  return text.slice(start, end);
};

describe('GET /api/navigation/data — badge counts are decorative', () => {
  it('never rethrows a badge-count failure', () => {
    // The regression in one line: a `throw` here is the entire sidebar going down with a
    // count nobody would miss for a minute.
    expect(withoutComments(badgeCountBlock())).not.toContain('throw');
  });

  it('does not narrow its tolerance to specific schema errors', () => {
    // The old guard admitted exactly two failures and rethrew the rest. Any predicate
    // gating this catch arm re-creates that: pool exhaustion, a timeout and a transient
    // network blip are all as fatal as a missing table, and none of them should be.
    const block = withoutComments(badgeCountBlock());
    expect(block).not.toContain('isSpaceMembershipsTableMissing');
    expect(block).not.toContain('isSpaceMembershipsLastVisitedColumnMissing');
  });

  it('logs the failure rather than swallowing it in silence', () => {
    // Where this parts company with the notes-list sibling. Navigation is load-bearing, so
    // a badge that has quietly stopped counting still has to be findable in the log.
    expect(badgeCountBlock()).toMatch(/console\.(warn|error)\(/);
  });

  it('catches only the badge call, leaving the payload’s own failures fatal', () => {
    // A catch drawn any wider would return an empty sidebar as though it were a real one.
    const text = source('server/routes/navigation.ts');
    const tryStart = text.indexOf('    try {\n      newNoteCounts');
    expect(tryStart).toBeGreaterThan(-1);
    const guarded = text.slice(tryStart, text.indexOf('} catch (badgeError)', tryStart));
    expect(guarded).toContain('getNewNoteCountsForUser');
    for (const loadBearing of [
      'getAllThreadsWithCounts',
      'getSpacesWithCounts',
      'getInboxDisplayCount',
      'getMemberOfSpaces',
    ]) {
      expect(guarded, loadBearing).not.toContain(loadBearing);
    }
  });
});
