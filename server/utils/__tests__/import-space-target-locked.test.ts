import { describe, it, expect, vi, beforeEach } from 'vitest';

let selectCall = 0;
let eligibleRows: Array<{ id: string }> = [];
const inserted: Array<Array<{ noteId: string }>> = [];

vi.mock('../../db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../db')>();
  const chain = (rows: () => unknown[]) => {
    const c: Record<string, unknown> = {};
    c.from = () => c;
    c.where = async () => rows();
    return c;
  };
  return {
    ...actual,
    db: {
      ...actual.db,
      // 1st select: notes already in the room (none). 2nd: the importer's unlocked notes.
      select: () => chain(() => (selectCall++ === 0 ? [] : eligibleRows)),
      insert: () => ({
        values: async (rows: Array<{ noteId: string }>) => {
          inserted.push(rows);
        },
      }),
    },
  };
});

import { addImportedNotesToSpace } from '../import-space-target';

describe('addImportedNotesToSpace', () => {
  beforeEach(() => {
    selectCall = 0;
    eligibleRows = [];
    inserted.length = 0;
  });

  it('never puts a locked or foreign note in the room, even if an import "duplicate" names it', async () => {
    // Only note_ok is the importer's and unlocked; note_locked / note_foreign are filtered by the query.
    eligibleRows = [{ id: 'note_ok' }];
    const added = await addImportedNotesToSpace('space_1', ['note_ok', 'note_locked', 'note_foreign'], 'user_1');
    expect(added).toBe(1);
    expect(inserted[0].map((r) => r.noteId)).toEqual(['note_ok']);
  });

  it('inserts nothing when every note is ineligible', async () => {
    const added = await addImportedNotesToSpace('space_1', ['note_locked'], 'user_1');
    expect(added).toBe(0);
    expect(inserted).toHaveLength(0);
  });
});
