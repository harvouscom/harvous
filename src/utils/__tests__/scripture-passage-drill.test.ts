import { describe, it, expect } from 'vitest';
import {
  findMostRecentNoteForScriptureReference,
  findScripturePassageDrill,
  findScripturePassageWithNotes,
  type ScriptureIndexBookLike,
  type ScriptureIndexBookWithNotesLike,
} from '@/utils/scripture-passage-drill';

function book(
  bookOrder: number,
  passages: Array<{ passageKey: string; displayRef: string; noteCount?: number }>,
): ScriptureIndexBookLike {
  return {
    bookOrder,
    passages: passages.map((p) => ({
      ...p,
      bookOrder,
      noteCount: p.noteCount ?? 1,
    })),
  };
}

describe('findScripturePassageDrill', () => {
  it('returns null for empty reference', () => {
    expect(findScripturePassageDrill([], '')).toBeNull();
    expect(findScripturePassageDrill([], '   ')).toBeNull();
  });

  it('matches displayRef case-insensitively', () => {
    const books = [
      book(44, [{ passageKey: '44:8:28:28', displayRef: 'Romans 8:28' }]),
    ];
    expect(findScripturePassageDrill(books, 'romans 8:28')).toEqual({
      bookOrder: 44,
      passageKey: '44:8:28:28',
    });
  });

  it('falls back to computed passageKey when displayRef differs slightly', () => {
    const books = [
      book(44, [{ passageKey: '44:8:28:28', displayRef: 'Romans 8:28-28' }]),
    ];
    expect(findScripturePassageDrill(books, 'Romans 8:28')).toEqual({
      bookOrder: 44,
      passageKey: '44:8:28:28',
    });
  });

  it('returns computed coordinates when index is empty but reference parses', () => {
    expect(findScripturePassageDrill([], 'John 3:16')).toEqual({
      bookOrder: 42,
      passageKey: '42:3:16:16',
    });
  });

  it('returns null for unparseable reference with empty index', () => {
    expect(findScripturePassageDrill([], 'not a reference')).toBeNull();
  });
});

describe('findScripturePassageWithNotes', () => {
  it('returns drill coords only when passage has notes in index', () => {
    const books = [
      book(44, [{ passageKey: '44:8:28:28', displayRef: 'Romans 8:28', noteCount: 2 }]),
    ];
    expect(findScripturePassageWithNotes(books, 'Romans 8:28')).toEqual({
      bookOrder: 44,
      passageKey: '44:8:28:28',
    });
  });

  it('returns null when passage exists but noteCount is zero', () => {
    const books = [
      book(44, [{ passageKey: '44:8:28:28', displayRef: 'Romans 8:28', noteCount: 0 }]),
    ];
    expect(findScripturePassageWithNotes(books, 'Romans 8:28')).toBeNull();
  });

  it('returns null when index is empty even if reference parses', () => {
    expect(findScripturePassageWithNotes([], 'John 3:16')).toBeNull();
  });
});

describe('findMostRecentNoteForScriptureReference', () => {
  it('returns the most recently updated note for a contained single verse', () => {
    const books: ScriptureIndexBookWithNotesLike[] = [
      {
        bookOrder: 24,
        passages: [
          {
            passageKey: '24:3:22:26',
            displayRef: 'Lamentations 3:22-26',
            bookOrder: 24,
            noteCount: 2,
            notes: [
              {
                id: 'note_old',
                title: 'Older',
                updatedAt: '2024-01-01T00:00:00.000Z',
                createdAt: '2024-01-01T00:00:00.000Z',
              },
              {
                id: 'note_new',
                title: 'Newer',
                updatedAt: '2025-01-01T00:00:00.000Z',
                createdAt: '2025-01-01T00:00:00.000Z',
              },
            ],
          },
        ],
      },
    ];
    expect(findMostRecentNoteForScriptureReference(books, 'Lamentations 3:22')?.id).toBe('note_new');
  });
});
