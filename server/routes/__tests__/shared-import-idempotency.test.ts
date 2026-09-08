/**
 * Contract tests for importing shared content twice.
 *
 * Source assertions rather than a running server, matching the house pattern in
 * library-routes.test.ts and church-library-routes.test.ts.
 *
 * What they protect: `/api/shared/add-to-harvous` had no idempotency guard at
 * all, so a second click on the same link forked a second Thread plus a
 * duplicate copy of every note in it. The single-note path next door had been
 * guarded since it shipped; these tests hold both, and hold the *shape* of the
 * thread guard in particular — a check-then-act read in front of a multi-row
 * copy would be racy, so the duplicate has to be refused by a unique index.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const routes = () => source('server/routes/shared.ts');

/** Source of one handler, from its `app.<verb>(` to the next one. */
function handlerBody(text: string, marker: string): string {
  const start = text.indexOf(marker);
  expect(start, `${marker} not found`).toBeGreaterThan(-1);
  const next = text.indexOf('\napp.', start + 1);
  return text.slice(start, next === -1 ? undefined : next);
}

const THREAD_IMPORT = "app.post('/api/shared/add-to-harvous'";
const NOTE_IMPORT = "app.post('/api/shared/add-note-to-harvous'";

describe('shared note import — the existing guard', () => {
  const body = () => handlerBody(routes(), NOTE_IMPORT);

  it('looks for an existing copy keyed on the source note', () => {
    const text = body();
    expect(text).toContain('eq(Notes.userId, auth.userId)');
    expect(text).toContain('eq(Notes.copiedFromNoteId, sourceNote.id)');
  });

  it('reports the copy the caller already has instead of making a second one', () => {
    const text = body();
    expect(text).toContain('alreadyImported: true');
    // The id returned is the *existing* note, so the client lands on the copy
    // the caller already owns rather than on nothing.
    expect(text).toContain('createdIds: { noteId: existingCopy.id }');
  });

  it('runs the check before it writes anything', () => {
    const text = body();
    expect(text.indexOf('existingCopy')).toBeLessThan(text.indexOf('db.transaction('));
  });
});

describe('shared thread import — idempotency', () => {
  const body = () => handlerBody(routes(), THREAD_IMPORT);

  /** The transaction body, from `db.transaction(` to the catch that guards it. */
  const transactionBody = () => {
    const text = body();
    const start = text.indexOf('await db.transaction(');
    expect(start, 'no transaction in the thread import').toBeGreaterThan(-1);
    const end = text.indexOf('} catch (error) {', start);
    expect(end, 'transaction is not wrapped in a catch').toBeGreaterThan(start);
    return text.slice(start, end);
  };

  it('records what it copied, so there is something to be idempotent on', () => {
    const text = body();
    expect(text).toContain('copiedFromThreadId: sourceThread.id');
    expect(text).toContain('copiedFromAuthorId: sourceThread.userId');
  });

  it('checks for an existing copy before doing any of the copying work', () => {
    const text = body();
    const check = text.indexOf('findExistingThreadCopy(auth.userId, sourceThread.id)');
    expect(check, 'no fast-path check').toBeGreaterThan(-1);
    // Ahead of the note fetch, not merely ahead of the write: the point of this
    // read is to not rebuild the whole thread on an ordinary repeat click.
    expect(check).toBeLessThan(text.indexOf('// Fetch source notes'));
    expect(text).toContain('return c.json(alreadyImportedThread(existingCopy.id))');
  });

  /*
    The ordering below is the whole design.

    A read-then-write guard is not enough here. Between the check and the
    commit sits a transaction that copies every note, note version, junction,
    scripture and resource row in the thread — chunked at 400 rows a statement —
    so the window two clicks can both pass through is as wide as that copy is
    long. The Threads row goes in first and carries the columns the unique
    index covers, which turns the second import into a 23505 before any note
    row is written.
  */
  it('inserts the Thread before any other row in the transaction', () => {
    const tx = transactionBody();
    const threadInsert = tx.indexOf('tx.insert(Threads)');
    expect(threadInsert, 'no Threads insert in the transaction').toBeGreaterThan(-1);
    for (const later of [
      'tx.insert(Notes)',
      'tx.insert(NoteThreads)',
      'tx.insert(ScriptureMetadata)',
      'tx.insert(ResourceMetadata)',
      'tx.insert(NoteScriptureReferences)',
      'createInitialNoteVersion(tx',
    ]) {
      const at = tx.indexOf(later);
      if (at === -1) continue;
      expect(threadInsert, `${later} is written before the guard row`).toBeLessThan(at);
    }
  });

  it('reads a unique violation as "already imported"', () => {
    const text = body();
    expect(text).toContain('isUniqueViolationError(error)');
    expect(text).toContain('const raced = await findExistingThreadCopy(auth.userId, sourceThread.id)');
    expect(text).toContain('return c.json(alreadyImportedThread(raced.id))');
  });

  it('rethrows a violation it cannot attribute to a prior copy', () => {
    const text = body();
    // A collided junction or metadata id is a fault, not a duplicate import,
    // and must not be reported to the caller as a successful one.
    expect(text).toContain('if (!isUniqueViolationError(error)) throw error;');
    expect(text).toContain('if (!raced) throw error;');
    expect(text.indexOf('const raced')).toBeLessThan(text.indexOf('if (!raced) throw error;'));
  });

  it('answers a repeat import the way the note path does', () => {
    const text = routes();
    expect(text).toContain('const alreadyImportedThread = (threadId: string) => (');
    expect(text).toContain('alreadyImported: true');
    // The client keys off createdIds.threadId to navigate; without it a repeat
    // click succeeds silently and goes nowhere.
    expect(text).toContain('createdIds: { threadId, noteIds: [] as string[] }');
  });

  it('keys the lookup on the caller and the source thread together', () => {
    const text = routes();
    expect(text).toContain('async function findExistingThreadCopy');
    expect(text).toContain(
      'and(eq(Threads.userId, userId), eq(Threads.copiedFromThreadId, sourceThreadId))',
    );
  });
});

describe('thread copy attribution schema', () => {
  const schema = () => source('server/db/schema.ts');

  /** The Threads table body only, so a hit cannot come from another table. */
  const threadsTable = () => {
    const text = schema();
    const start = text.indexOf('export const Threads = pgTable(');
    expect(start).toBeGreaterThan(-1);
    const next = text.indexOf('\nexport const ', start + 1);
    return text.slice(start, next === -1 ? undefined : next);
  };

  it('brings Threads level with the attribution Notes already carried', () => {
    const table = threadsTable();
    expect(table).toContain("copiedFromThreadId: text('copiedFromThreadId')");
    expect(table).toContain("copiedFromAuthorId: text('copiedFromAuthorId')");
  });

  it('constrains one copy of a shared thread per account', () => {
    const table = threadsTable();
    expect(table).toContain("uniqueIndex('Threads_copiedFromThread_unique')");
    expect(table).toContain('.on(table.userId, table.copiedFromThreadId)');
  });

  it('keeps the index partial, so it covers only imported threads', () => {
    expect(threadsTable()).toContain(
      '.where(sql`${table.copiedFromThreadId} IS NOT NULL`)',
    );
  });

  it('fails a deploy whose database is missing either half', () => {
    const validator = source('server/db/validate-schema.ts');
    expect(validator).toContain("Threads: ['copiedFromThreadId', 'copiedFromAuthorId']");
    expect(validator).toContain("Threads: ['Threads_copiedFromThread_unique']");
  });
});
