import { describe, expect, it } from 'vitest';
import {
  rankCrossRefGaps,
  verseKeysFromScriptureReference,
  addHighlightRefsToCitedKeys,
  buildVerseSourceNoteMap,
  buildVerseSourceNoteMapFromPillNotes,
  extractScripturePillsFromHtml,
  mergeVerseSourceNoteMaps,
} from '../crossref-gaps';

const v = (book: string, chapter: number, verse: number) => ({ book, chapter, verse });

function sourceMap(
  entries: Array<{ from: ReturnType<typeof v>; noteId: string; translation?: string }>,
): Map<string, { noteId: string; translation: string }> {
  const m = new Map<string, { noteId: string; translation: string }>();
  for (const e of entries) {
    m.set(`${e.from.book}|${e.from.chapter}|${e.from.verse}`, {
      noteId: e.noteId,
      translation: e.translation ?? 'NET',
    });
  }
  return m;
}

describe('buildVerseSourceNoteMap', () => {
  it('keeps the most recently updated note per verse key', () => {
    const older = new Date('2024-01-01');
    const newer = new Date('2025-01-01');
    const map = buildVerseSourceNoteMap([
      {
        book: 'Lamentations',
        chapter: 3,
        verse: 22,
        noteId: 'note_old',
        translation: 'NET',
        noteUpdatedAt: older,
      },
      {
        book: 'Lamentations',
        chapter: 3,
        verse: 22,
        noteId: 'note_new',
        translation: 'CSB',
        noteUpdatedAt: newer,
      },
    ]);
    expect(map.get('Lamentations|3|22')).toEqual({ noteId: 'note_new', translation: 'CSB' });
  });
});

describe('extractScripturePillsFromHtml', () => {
  it('reads reference and translation from pill spans in parent notes', () => {
    const html =
      '<p>See <span data-scripture-reference="Lamentations 3:22" data-scripture-translation="CSB">Lamentations 3:22</span></p>';
    expect(extractScripturePillsFromHtml(html)).toEqual([
      { reference: 'Lamentations 3:22', translation: 'CSB' },
    ]);
  });
});

describe('buildVerseSourceNoteMapFromPillNotes', () => {
  it('maps parent note ids for each verse in a range pill', () => {
    const html =
      '<span data-scripture-reference="Lamentations 3:22-23" data-scripture-translation="NET"></span>';
    const map = buildVerseSourceNoteMapFromPillNotes([
      { id: 'parent_note', content: html, updatedAt: new Date('2025-01-01') },
    ]);
    expect(map.get('Lamentations|3|22')).toEqual({ noteId: 'parent_note', translation: 'NET' });
    expect(map.get('Lamentations|3|23')).toEqual({ noteId: 'parent_note', translation: 'NET' });
  });

  it('prefers pill notes over legacy junction fallback when merged', () => {
    const pillMap = buildVerseSourceNoteMapFromPillNotes([
      {
        id: 'parent_with_pill',
        content: '<span data-scripture-reference="Romans 8:28"></span>',
        updatedAt: new Date('2025-01-01'),
      },
    ]);
    const legacyMap = sourceMap([{ from: v('Romans', 8, 28), noteId: 'legacy_scripture_child' }]);
    const merged = mergeVerseSourceNoteMaps(pillMap, legacyMap);
    expect(merged.get('Romans|8|28')?.noteId).toBe('parent_with_pill');
  });
});

describe('rankCrossRefGaps', () => {
  it('returns passages the user has NOT cited, ranked by votes', () => {
    const cited = new Set(['Romans|8|28']);
    const crossRefs = [
      { from: v('Romans', 8, 28), to: v('Genesis', 50, 20), votes: 8 },
      { from: v('Romans', 8, 28), to: v('Psalm', 73, 1), votes: 5 },
      { from: v('Romans', 8, 28), to: v('Romans', 8, 28), votes: 3 }, // self → cited → skip
    ];
    const gaps = rankCrossRefGaps(
      crossRefs,
      cited,
      sourceMap([{ from: v('Romans', 8, 28), noteId: 'n1' }]),
    );
    expect(gaps).toHaveLength(2);
    expect(gaps[0].to.book).toBe('Genesis');
    expect(gaps[0].fromNoteId).toBe('n1');
    expect(gaps[1].to.book).toBe('Psalm');
  });

  it('dedupes by target passage', () => {
    const cited = new Set<string>();
    const crossRefs = [
      { from: v('Romans', 8, 28), to: v('Genesis', 50, 20), votes: 8 },
      { from: v('John', 3, 16), to: v('Genesis', 50, 20), votes: 6 }, // same target
    ];
    const gaps = rankCrossRefGaps(
      crossRefs,
      cited,
      sourceMap([
        { from: v('Romans', 8, 28), noteId: 'n1' },
        { from: v('John', 3, 16), noteId: 'n2' },
      ]),
    );
    expect(gaps).toHaveLength(1);
  });

  it('respects the limit', () => {
    const cited = new Set<string>();
    const crossRefs = [
      { from: v('A', 1, 1), to: v('B', 1, 1), votes: 3 },
      { from: v('A', 1, 1), to: v('C', 1, 1), votes: 2 },
      { from: v('A', 1, 1), to: v('D', 1, 1), votes: 1 },
    ];
    expect(
      rankCrossRefGaps(crossRefs, cited, sourceMap([{ from: v('A', 1, 1), noteId: 'n1' }]), { limit: 2 }),
    ).toHaveLength(2);
  });

  it('excludes targets covered by passage highlights', () => {
    const cited = new Set<string>();
    addHighlightRefsToCitedKeys(cited, ['Genesis 50:20']);
    const crossRefs = [{ from: v('Romans', 8, 28), to: v('Genesis', 50, 20), votes: 8 }];
    expect(
      rankCrossRefGaps(
        crossRefs,
        cited,
        sourceMap([{ from: v('Romans', 8, 28), noteId: 'n1' }]),
      ),
    ).toHaveLength(0);
  });

  it('skips gaps when the source verse has no note mapping', () => {
    const crossRefs = [{ from: v('Romans', 8, 28), to: v('Genesis', 50, 20), votes: 8 }];
    expect(rankCrossRefGaps(crossRefs, new Set(), new Map())).toHaveLength(0);
  });
});

describe('verseKeysFromScriptureReference', () => {
  it('expands a single verse ref', () => {
    expect(verseKeysFromScriptureReference('Romans 8:28')).toEqual(['Romans|8|28']);
  });

  it('expands a verse range', () => {
    expect(verseKeysFromScriptureReference('Romans 8:28-30')).toEqual([
      'Romans|8|28',
      'Romans|8|29',
      'Romans|8|30',
    ]);
  });
});
