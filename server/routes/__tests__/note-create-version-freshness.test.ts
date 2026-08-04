import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Both note write endpoints capture a version early and then keep working before they
 * respond. Scripture processing can still move the parent: its duplicate-collapse path
 * rewrites `data-note-id` in every affected note through updateCanonicalNoteInTransaction,
 * and that path is *not* gated by `persistParentContent: false` the way the main content
 * rewrite is.
 *
 * Returning the captured version told the client a number the row had already moved past.
 * The client seeded it, the editor's next autosave sent it as `expectedVersion`, and the
 * server 409'd — surfacing to a solo user in a private space as a "changed somewhere else"
 * toast on a note only they were touching. It reproduced by typing the start of a
 * scripture reference into a new note.
 *
 * Create was fixed first and the report persisted, because the note already exists by the
 * time you are typing — the failing path was update. Both now resolve through
 * readCurrentNoteVersion.
 */
const source = readFileSync(resolve(process.cwd(), 'server/routes/notes.ts'), 'utf8');

function handlerSource(startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

const createHandler = () =>
  handlerSource("route.post('/api/notes/create'", "route.put('/api/notes/update'");
const updateHandler = () =>
  handlerSource("route.put('/api/notes/update'", "route.delete('/api/notes/delete'");

describe('note write endpoints report a fresh version', () => {
  it('create resolves through readCurrentNoteVersion', () => {
    expect(createHandler()).toContain('readCurrentNoteVersion(');
  });

  it('update resolves through readCurrentNoteVersion', () => {
    expect(updateHandler()).toContain('readCurrentNoteVersion(');
  });

  it('create does not report the insert-time pointer directly', () => {
    expect(createHandler()).not.toMatch(/eq\(NoteVersions\.id,\s*newNote\.currentVersionId\)/);
  });

  it('update does not report the captured version directly', () => {
    // The defect shape: `currentVersion: versionedUpdate.currentVersion.version` with no
    // fresh read in between.
    const handler = updateHandler();
    expect(handler).not.toMatch(/currentVersion:\s*versionedUpdate\.currentVersion\.version,/);
    expect(handler).toContain('freshVersion?.version ?? versionedUpdate.currentVersion.version');
  });

  it('both keep a fallback to the captured value', () => {
    expect(createHandler()).toContain('newNote.currentVersionId');
    expect(updateHandler()).toContain('versionedUpdate.currentVersion.id');
  });
});
