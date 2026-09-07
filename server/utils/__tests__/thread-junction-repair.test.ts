/**
 * The four conditions that decide which junctions get healed.
 *
 * Read from the source rather than executed, because the whole function is now one query — there
 * is no seam left to unit test without standing up a database, and the repo's other server-util
 * tests are pure functions over injected rows. What this guards is a later edit quietly dropping
 * a clause while the query still compiles and still looks right.
 *
 * Two of the four are not performance details. `Threads.userId` and `Notes.userId` are what keep
 * a heal inside one account: without the thread-side check a note pointing at someone else's
 * thread id would have a junction created into it. The other two keep the repair create-only and
 * off the unorganized bucket.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(
  join(process.cwd(), 'server/utils/thread-junction-repair.ts'),
  'utf8',
);
const query = source.slice(source.indexOf('const missing'), source.indexOf('let created'));

describe('repairMissingNoteThreadJunctionsForUser', () => {
  it('only ever heals notes belonging to the user it was asked about', () => {
    expect(query).toContain('eq(Notes.userId, userId)');
  });

  it('only links threads belonging to that same user', () => {
    // The inner join is the ownership check. Losing it lets a stale `Notes.threadId` pointing at
    // another account's thread create a junction into it.
    expect(query).toContain('eq(Threads.userId, userId)');
    expect(query).toContain('innerJoin(Threads');
  });

  it('leaves the unorganized bucket alone', () => {
    expect(query).toContain("ne(Notes.threadId, 'thread_unorganized')");
  });

  it('stays create-only: it selects the pairs that have no junction yet', () => {
    expect(query).toContain('leftJoin(');
    expect(query).toContain('isNull(NoteThreads.noteId)');
  });

  it('asks the database which rows need repairing rather than diffing whole tables', () => {
    // The shape this replaced read every note, every thread and every junction for the account
    // on each `/api/navigation/data` load — a full scan to discover there was nothing to do.
    expect(source).not.toContain('noteThreadPairs');
    expect(source.match(/await db\s*\n?\s*\.select/g) ?? []).toHaveLength(1);
  });
});
