import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { noteWrittenTouches } from '../study-bible-layer';
import { NOTE_WRITTEN_SOURCE } from '@/utils/study-bible-source-copy';

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

describe('a note the reader wrote', () => {
  /*
   * Behavioural, not source-inspection: `noteWrittenTouches` is pure, so it can be run.
   *
   * The rest of this file reads source because the writer needs a database. This one does not,
   * and it is the piece that decides whether someone's own writing is ever askable — the reason
   * Review saw 1 of 31 substantial notes on a real account was that nothing wrote the node.
   */
  const authored = {
    id: 'n1',
    title: 'Covenant and kingship',
    createdAt: new Date('2026-06-01T09:00:00Z'),
    noteType: 'default',
    addedBy: 'user' as string | null,
    threadId: 'thread_abc',
    primaryCollection: null as string | null,
  };
  const NOW = new Date('2026-09-01T12:00:00Z');

  it('records it as written, dated when it was written', () => {
    const [touch] = noteWrittenTouches(authored, NOW);
    expect(touch.kind).toBe('note');
    expect(touch.signal).toBe('exposure');
    expect(touch.noteId).toBe('n1');
    expect(touch.sourceLabel).toBe(NOTE_WRITTEN_SOURCE);
    /*
     * `createdAt`, not now. `firstStudiedAt` folds with LEAST, so this is what keeps a note
     * written two years ago from being three days short of reviewable; and `lastSourceLabel`
     * only moves when `lastSourceAt` does, so backdating is what stops "You wrote this" racing
     * the "You added to this" that `/api/notes/update` fires on the very same request.
     */
    expect(touch.at).toBe(authored.createdAt);
  });

  it('clamps a client clock that is ahead of ours', () => {
    // Offline sync carries the device's own time; a future date would park the label permanently
    // in front of every real event.
    const [touch] = noteWrittenTouches({ ...authored, createdAt: new Date('2027-01-01T00:00:00Z') }, NOW);
    expect(touch.at).toBe(NOW);
  });

  it('says nothing about writing the reader did not do', () => {
    // A scripture child note is the app's text pasted in beside theirs.
    expect(noteWrittenTouches({ ...authored, noteType: 'scripture' }, NOW)).toEqual([]);
    /*
     * Installed and shared content. Both run the same enrichment pass as a real save, so without
     * this a twenty-note Discover install would write twenty nodes claiming the reader wrote it.
     */
    for (const addedBy of ['discover', 'shared', 'harvous', 'system']) {
      expect(noteWrittenTouches({ ...authored, addedBy }, NOW)).toEqual([]);
    }
    // Onboarding, on the same terms as every other usage count.
    expect(noteWrittenTouches({ ...authored, threadId: 'thread_onboarding_1' }, NOW)).toEqual([]);
    expect(noteWrittenTouches({ ...authored, primaryCollection: 'Welcome to Harvous' }, NOW)).toEqual([]);
  });
});

describe('the save path records the note itself', () => {
  const save = read('server/utils/process-scripture-references.ts');

  it('records it whether or not the note cites a passage', () => {
    /*
     * `toContain('touchNodes(')` above would pass with the note touch deleted, and effectively
     * did: the only note touch used to sit behind `if (!passages.length) return;` inside the
     * passage recorder, so a note with no scripture pill became no node at all.
     *
     * The claim is about the enrichment block, so read that block rather than the whole file:
     * the write-touch is called there unconditionally, and before the passage work, which is
     * what "whether or not it cites a passage" means once the guard moved out of sight.
     */
    const block = save.slice(save.indexOf('computeAndStoreNoteFingerprint(noteId, userId)'));
    const written = block.indexOf('noteWrittenTouches(note');
    const passages = block.indexOf('recordCitedPassageNodes(noteId');
    expect(written).toBeGreaterThan(-1);
    expect(passages).toBeGreaterThan(-1);
    expect(written).toBeLessThan(passages);
    // Nothing between the two may make the write-touch conditional.
    expect(block.slice(0, written)).not.toContain('passages');
  });

  it('does not also count the note on the passage path', () => {
    // Two touches per save on pill notes and one on prose notes would make `exposureCount`
    // mean different things for the two, which the score has no way to tell apart.
    const passages = save.slice(save.indexOf('async function recordCitedPassageNodes'));
    expect(passages).not.toContain('noteTouch(');
  });
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
