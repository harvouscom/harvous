import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Source contract, in the style of review-routes.test.ts.
 *
 * The writer runs one upsert against a real Postgres table, so exercising it would need a
 * database; what actually breaks in review is the *shape* of that statement and whether the
 * activity paths remember to call it at all. Both are readable from source.
 */

const repoRoot = join(__dirname, '..', '..', '..');
const read = (path: string) => readFileSync(join(repoRoot, path), 'utf8');

const layer = read('server/utils/study-bible-layer.ts');

describe('touchNodes upsert', () => {
  it('accumulates counters rather than overwriting them', () => {
    for (const column of [
      'exposureCount',
      'revisitCount',
      'explicitConnectionCount',
      'expansionCount',
      'synthesisCount',
      'reviewCount',
    ]) {
      expect(layer).toContain(`+ excluded."${column}"`);
    }
  });

  it('takes the extremes for the timestamps, so a replayed backfill stays correct', () => {
    // The backfill replays events in query order, not chronological order.
    expect(layer).toMatch(/LEAST\(.*firstStudiedAt.*excluded\."firstStudiedAt"\)/);
    expect(layer).toMatch(/GREATEST\(.*lastSeenAt.*excluded\."lastSeenAt"\)/);
  });

  it('never lets a touch un-archive what the note cascade retired', () => {
    const setBlock = layer.slice(layer.indexOf('set: {'), layer.indexOf('        });'));
    expect(setBlock).not.toMatch(/^\s*status:/m);
  });

  it('folds duplicate keys before inserting', () => {
    // Postgres refuses an ON CONFLICT batch that names the same row twice.
    expect(layer).toContain('function foldTouches');
    expect(layer).toContain('cannot affect row a second time');
  });

  it('swallows a missing table and never throws to its caller', () => {
    expect(layer).toContain('isUserNodeStatesTableMissing');
    expect(layer).toMatch(/export async function touchNodes[\s\S]*?try \{/);
    expect(layer).toContain("console.error('[study-bible-layer] touchNodes failed:'");
  });
});

describe('activity paths write to the layer', () => {
  const paths = [
    'server/utils/record-reading-event.ts',
    'server/utils/record-note-visit.ts',
    'server/utils/record-recall-event.ts',
    'server/utils/process-scripture-references.ts',
    'server/routes/study-threads.ts',
    'server/routes/notes.ts',
    'server/utils/review-service.ts',
    'server/utils/challenge-service.ts',
    'server/routes/sync.ts',
  ];

  for (const path of paths) {
    it(`${path} records what the reader did`, () => {
      expect(read(path)).toContain('touchNodes(');
    });
  }
});

describe('note deletion', () => {
  const cascade = read('server/utils/delete-note-cascade.ts');

  it('takes note-owned nodes with the note', () => {
    expect(cascade).toContain("'UserNodeStates'");
    expect(cascade).toMatch(/delete\(UserNodeStates\)[\s\S]*?inArray\(UserNodeStates\.noteId/);
  });

  it('archives a connection whose far end survives instead of deleting it', () => {
    expect(cascade).toMatch(/update\(UserNodeStates\)[\s\S]*?status: 'archived'/);
    expect(cascade).toMatch(/inArray\(UserNodeStates\.secondaryNoteId/);
  });
});

describe('source copy', () => {
  const copy = read('src/utils/study-bible-source-copy.ts');
  // Every quoted string in the file except the import specifiers at the top.
  const strings = [...copy.matchAll(/'([^']{4,})'|`([^`]{4,})`/g)]
    .map((m) => m[1] ?? m[2])
    .filter((value) => !value.startsWith('@/'));

  it('never names a queue, an inbox or a count of what is left', () => {
    for (const line of strings) {
      expect(line.toLowerCase()).not.toContain('inbox');
      expect(line.toLowerCase()).not.toContain('due');
      expect(line.toLowerCase()).not.toContain('remaining');
    }
  });

  it('capitalizes Thread', () => {
    expect(copy).not.toMatch(/'[^']*\bthread\b[^']*'/);
  });
});
