/**
 * A space's Bible is built from what the room shares — never from anyone's own reading or
 * personal study. A contract scan, the way family-progress.test.ts guards the family's.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('space bible coverage', () => {
  const text = code(source('server/utils/space-bible-coverage.ts'));

  it.each(['ReadingEvents', 'UserNodeStates', 'NoteVisitEvents', 'StudyThreadEntries.userId'])(
    'never reads %s',
    (forbidden) => {
      expect(text).not.toContain(forbidden);
    },
  );

  it('reads the room’s notes, never one person’s', () => {
    expect(text).toContain('.where(scriptureIndexNoteFilter(spaceId))');
  });

  it('reads only notes shared into the room, readable ones', () => {
    expect(text).toContain('activeSpaceNotePredicate(spaceId)');
    expect(text).toContain('eq(Notes.contentEncrypted, false)');
  });

  it('reads only highlights made in the room, on its notes', () => {
    expect(text).toContain('eq(StudyThreadEntries.spaceId, spaceId)');
    expect(text).toContain('eq(StudyThreadEntries.isArchived, false)');
  });

  it('puts no reading on the map', () => {
    expect(text).toContain('read: []');
    expect(text).toContain('depth: []');
  });

  it('shares its note set with the Scripture index', () => {
    const routes = source('server/routes/spaces.ts');
    expect(routes).toContain("scriptureIndexNoteFilter(spaceIdNorm, access.space.type === 'personal' ? auth.userId : undefined)");
  });
});
