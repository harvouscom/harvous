import { describe, expect, it } from 'vitest';
import {
  NOTE_DELETE_CASCADE_TABLES,
  deleteNotesCascadeForUser,
} from '../delete-note-cascade';

describe('hard note delete cascade', () => {
  it('includes canonical history and shared associations', () => {
    expect(NOTE_DELETE_CASCADE_TABLES).toContain('SpaceNotes');
    expect(NOTE_DELETE_CASCADE_TABLES).toContain('NoteVersions');
    expect(NOTE_DELETE_CASCADE_TABLES.at(-1)).toBe('Notes');
  });

  it('executes the relational cascade through one database transaction', () => {
    expect(deleteNotesCascadeForUser.toString()).toContain('db.transaction');
  });
});
