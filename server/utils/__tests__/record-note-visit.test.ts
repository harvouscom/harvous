import { describe, expect, it } from 'vitest';
import { collapseNoteVisits, validateNoteVisitInput } from '../record-note-visit';

describe('validateNoteVisitInput', () => {
  it('accepts a note id and a known bucket', () => {
    expect(validateNoteVisitInput({ noteId: 'note_a', dwellBucket: 'read' })).toEqual({
      noteId: 'note_a',
      dwellBucket: 'read',
    });
  });

  it('trims the note id', () => {
    expect(validateNoteVisitInput({ noteId: '  note_a  ', dwellBucket: 'study' })?.noteId).toBe(
      'note_a',
    );
  });

  it('rejects a bucket outside the vocabulary', () => {
    expect(validateNoteVisitInput({ noteId: 'note_a', dwellBucket: 'skimmed' })).toBeNull();
  });

  it('rejects a missing, blank or non-string note id', () => {
    expect(validateNoteVisitInput({ dwellBucket: 'read' })).toBeNull();
    expect(validateNoteVisitInput({ noteId: '   ', dwellBucket: 'read' })).toBeNull();
    expect(validateNoteVisitInput({ noteId: 42, dwellBucket: 'read' })).toBeNull();
  });

  it('rejects a body that is not an object', () => {
    expect(validateNoteVisitInput(null)).toBeNull();
    expect(validateNoteVisitInput('note_a')).toBeNull();
  });
});

describe('collapseNoteVisits', () => {
  // Rows arrive newest-first, as the query orders them.
  const row = (noteId: string, dwellBucket: string, createdAt: string) => ({
    noteId,
    dwellBucket,
    createdAt,
  });

  it('counts substantive visits per note and keeps the newest timestamp', () => {
    const out = collapseNoteVisits([
      row('note_a', 'read', '2026-06-10T00:00:00Z'),
      row('note_a', 'study', '2026-06-01T00:00:00Z'),
      row('note_b', 'read', '2026-05-01T00:00:00Z'),
    ]);

    expect(out).toEqual([
      { noteId: 'note_a', count: 2, lastVisitedAt: '2026-06-10T00:00:00Z' },
      { noteId: 'note_b', count: 1, lastVisitedAt: '2026-05-01T00:00:00Z' },
    ]);
  });

  /*
   * A glance is logged — the raw log stays an honest record of what was opened — but it is
   * never evidence of reading, so it must not add to a count or move a timestamp.
   */
  it('drops glances entirely', () => {
    const out = collapseNoteVisits([
      row('note_a', 'glance', '2026-06-30T00:00:00Z'),
      row('note_a', 'read', '2026-06-10T00:00:00Z'),
    ]);
    expect(out).toEqual([{ noteId: 'note_a', count: 1, lastVisitedAt: '2026-06-10T00:00:00Z' }]);
  });

  it('omits a note with nothing but glances', () => {
    expect(collapseNoteVisits([row('note_a', 'glance', '2026-06-30T00:00:00Z')])).toEqual([]);
  });

  it('accepts createdAt as a Date as well as a string', () => {
    const out = collapseNoteVisits([
      { noteId: 'note_a', dwellBucket: 'read', createdAt: new Date('2026-06-10T00:00:00Z') },
    ]);
    expect(out[0].lastVisitedAt).toBe('2026-06-10T00:00:00.000Z');
  });

  it('skips rows it cannot read rather than throwing', () => {
    const out = collapseNoteVisits([
      row('', 'read', '2026-06-10T00:00:00Z'),
      { noteId: 'note_a', dwellBucket: 'read', createdAt: null },
      row('note_b', 'lingered', '2026-06-10T00:00:00Z'),
    ]);
    expect(out).toEqual([]);
  });
});
