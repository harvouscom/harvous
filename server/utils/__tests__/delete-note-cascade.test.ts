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

  it('includes the memory-layer rows that outlive a deleted note', () => {
    // Left behind, these keep a deleted note steering Home: fingerprints drive the
    // greeting's canon-section line, and RecallEvents decide what gets resurfaced.
    expect(NOTE_DELETE_CASCADE_TABLES).toContain('NoteFingerprints');
    expect(NOTE_DELETE_CASCADE_TABLES).toContain('RecallEvents');
  });

  it('deletes every child table before the note row itself', () => {
    // A child delete after Notes would fail or orphan; Notes must stay last.
    expect(NOTE_DELETE_CASCADE_TABLES.indexOf('Notes')).toBe(
      NOTE_DELETE_CASCADE_TABLES.length - 1,
    );
  });

  it('executes the relational cascade through one database transaction', () => {
    expect(deleteNotesCascadeForUser.toString()).toContain('db.transaction');
  });
});
