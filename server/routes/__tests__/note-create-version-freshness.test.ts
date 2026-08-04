import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * POST /api/notes/create used to report the version from `newNote` — the in-memory row
 * captured at insert, before scripture processing ran. Processing can still bump the
 * parent: the duplicate-collapse path rewrites `data-note-id` in every affected note via
 * updateCanonicalNoteInTransaction, and it is not gated by `persistParentContent: false`.
 *
 * So a note created with a scripture reference came back claiming version 1 while the row
 * was already at 2. The client seeded the stale number, the editor's first autosave sent
 * it as `expectedVersion`, and the server 409'd — surfacing to a solo user in their own
 * private space as "Someone saved first" on a note they had just made.
 *
 * The response must read the note's version pointer back from the database after all
 * post-insert work, so it stays correct no matter which path moves it next.
 */
const source = readFileSync(resolve(process.cwd(), 'server/routes/notes.ts'), 'utf8');

function createHandlerSource(): string {
  const start = source.indexOf("route.post('/api/notes/create'");
  const end = source.indexOf("route.put('/api/notes/update'", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('POST /api/notes/create version freshness', () => {
  it('resolves the response version from a fresh read, not the insert-time row', () => {
    const handler = createHandlerSource();
    expect(handler).toMatch(/select\(\{\s*currentVersionId:\s*Notes\.currentVersionId\s*\}\)/);
    expect(handler).toContain('responseVersionId');
  });

  it('does not look the version up by the stale in-memory pointer', () => {
    const handler = createHandlerSource();
    // The defect shape: keying the NoteVersions lookup off `newNote.currentVersionId`.
    expect(handler).not.toMatch(/eq\(NoteVersions\.id,\s*newNote\.currentVersionId\)/);
  });

  it('still falls back to the insert-time pointer if the re-read finds nothing', () => {
    const handler = createHandlerSource();
    expect(handler).toContain('?? newNote.currentVersionId');
  });
});
