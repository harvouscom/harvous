import { describe, expect, it } from 'vitest';
import { matchNotesToReference } from '../notes-by-reference';

/** A note whose body carries a scripture pill for `ref`. */
const pill = (id: string, ref: string, updatedAt: string, title = id) => ({
  id,
  title,
  updatedAt,
  content: `<p>Some thoughts <span data-scripture-reference="${ref}" data-scripture-translation="ESV">${ref}</span> here.</p>`,
});

const legacy = (id: string, reference: string, updatedAt: string, title = id) => ({
  id,
  title,
  updatedAt,
  reference,
});

const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

describe('matchNotesToReference', () => {
  it('matches on shared verses, not on string equality', () => {
    // The whole point: planning "Romans 8" has to surface a note pilled with a
    // slice of it, and vice versa.
    const result = matchNotesToReference({
      reference: 'Romans 8',
      pillNotes: [pill('slice', 'Romans 8:1-11', '2026-01-01')],
      legacyNotes: [],
    });
    expect(ids(result)).toEqual(['slice']);
  });

  it('leaves out a passage in the same chapter that shares no verse', () => {
    const result = matchNotesToReference({
      reference: 'Romans 8:1-11',
      pillNotes: [pill('later', 'Romans 8:18-30', '2026-01-01')],
      legacyNotes: [],
    });
    expect(result).toEqual([]);
  });

  it('leaves out a different book entirely', () => {
    const result = matchNotesToReference({
      reference: 'Romans 8:1',
      pillNotes: [pill('john', 'John 8:1', '2026-01-01')],
      legacyNotes: [],
    });
    expect(result).toEqual([]);
  });

  it('ranks most recently updated first', () => {
    const result = matchNotesToReference({
      reference: 'Romans 8:1',
      pillNotes: [
        pill('old', 'Romans 8:1', '2024-01-01'),
        pill('newest', 'Romans 8:1', '2026-06-01'),
        pill('middle', 'Romans 8:1', '2025-03-01'),
      ],
      legacyNotes: [],
    });
    expect(ids(result)).toEqual(['newest', 'middle', 'old']);
  });

  it('counts a note once when it appears as both a pill and a legacy row', () => {
    // The two storage shapes overlap during migration; a note citing the same
    // passage in both must not read as two separate times you wrote on it.
    const result = matchNotesToReference({
      reference: 'Romans 8:1',
      pillNotes: [pill('both', 'Romans 8:1', '2026-01-01')],
      legacyNotes: [legacy('both', 'Romans 8:1', '2026-01-01')],
    });
    expect(ids(result)).toEqual(['both']);
  });

  it('finds legacy-only notes', () => {
    const result = matchNotesToReference({
      reference: 'Romans 8:1',
      pillNotes: [],
      legacyNotes: [legacy('legacy-only', 'Romans 8:1', '2026-01-01')],
    });
    expect(ids(result)).toEqual(['legacy-only']);
  });

  it('honours excludeNoteIds', () => {
    const result = matchNotesToReference({
      reference: 'Romans 8:1',
      pillNotes: [pill('keep', 'Romans 8:1', '2026-01-01'), pill('drop', 'Romans 8:1', '2026-02-01')],
      legacyNotes: [legacy('drop', 'Romans 8:1', '2026-02-01')],
      excludeNoteIds: ['drop'],
    });
    expect(ids(result)).toEqual(['keep']);
  });

  it('is empty for an unparseable reference rather than matching everything', () => {
    expect(
      matchNotesToReference({
        reference: 'not a reference',
        pillNotes: [pill('a', 'Romans 8:1', '2026-01-01')],
        legacyNotes: [legacy('b', 'Romans 8:1', '2026-01-01')],
      }),
    ).toEqual([]);
  });

  it('is empty when the user has written nothing', () => {
    expect(
      matchNotesToReference({ reference: 'Romans 8:1', pillNotes: [], legacyNotes: [] }),
    ).toEqual([]);
  });

  it('tolerates notes with no body and rows with an empty reference', () => {
    const result = matchNotesToReference({
      reference: 'Romans 8:1',
      pillNotes: [{ id: 'empty', title: null, updatedAt: null, content: '' }],
      legacyNotes: [legacy('blank', '', '2026-01-01')],
    });
    expect(result).toEqual([]);
  });
});
