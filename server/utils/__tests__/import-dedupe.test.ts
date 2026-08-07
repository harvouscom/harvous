import { describe, expect, it } from 'vitest';
import { chooseSurvivor, dedupeById, matchDuplicateNoteId, noteDedupeKey } from '../import-dedupe';

describe('dedupeById', () => {
  it('keeps the first occurrence of each id and preserves order', () => {
    const rows = [
      { id: 'a', n: 1 },
      { id: 'b', n: 2 },
      { id: 'a', n: 3 },
      { id: 'c', n: 4 },
      { id: 'b', n: 5 },
    ];
    expect(dedupeById(rows)).toEqual([
      { id: 'a', n: 1 },
      { id: 'b', n: 2 },
      { id: 'c', n: 4 },
    ]);
  });

  it('returns an empty array unchanged', () => {
    expect(dedupeById([])).toEqual([]);
  });

  it('leaves already-unique rows intact', () => {
    const rows = [{ id: 'a' }, { id: 'b' }];
    expect(dedupeById(rows)).toEqual(rows);
  });
});

describe('matchDuplicateNoteId', () => {
  const existing = [
    { id: 'note_1', title: 'Grace', content: '<p>For by grace you have been saved.</p>' },
    { id: 'note_2', title: 'Faith', content: '<p>Faith comes by hearing.</p>' },
  ];

  it('matches on normalized title + plaintext content, ignoring HTML and case', () => {
    expect(
      matchDuplicateNoteId(existing, 'grace', '<div>FOR BY  GRACE you have been saved.</div>'),
    ).toBe('note_1');
  });

  it('returns null when nothing matches', () => {
    expect(matchDuplicateNoteId(existing, 'Hope', '<p>Hope does not disappoint.</p>')).toBeNull();
  });

  it('requires both title and content to match', () => {
    // Same content as note_1 but a different title → not a duplicate.
    expect(
      matchDuplicateNoteId(existing, 'Different', '<p>For by grace you have been saved.</p>'),
    ).toBeNull();
  });

  it('treats null/empty titles consistently', () => {
    const withUntitled = [{ id: 'n', title: null, content: '<p>Body.</p>' }];
    expect(matchDuplicateNoteId(withUntitled, null, '<p>Body.</p>')).toBe('n');
    expect(matchDuplicateNoteId(withUntitled, '', 'Body.')).toBe('n');
  });
});

describe('noteDedupeKey', () => {
  it('is equal across HTML, case, and whitespace differences', () => {
    expect(noteDedupeKey('Grace', '<p>For by  grace.</p>')).toBe(
      noteDedupeKey('GRACE', '<div>FOR BY grace.</div>'),
    );
  });

  it('differs when title or content differ', () => {
    expect(noteDedupeKey('Grace', '<p>a</p>')).not.toBe(noteDedupeKey('Faith', '<p>a</p>'));
    expect(noteDedupeKey('Grace', '<p>a</p>')).not.toBe(noteDedupeKey('Grace', '<p>b</p>'));
  });

  it('does not collide title/content boundary', () => {
    // "ab" + "" must not equal "a" + "b".
    expect(noteDedupeKey('ab', '')).not.toBe(noteDedupeKey('a', 'b'));
  });

  it('matches a note before and after scripture pills wrap its references', () => {
    // Pills turn `John 3:16.` into `<span>John 3:16</span>.`, which converts back to
    // plaintext with a space before the period. Re-importing an export must still
    // recognise the note rather than creating a second copy of the whole library.
    const beforeImport = '<p>See Romans 8:1 and also John 3:16.</p>';
    const afterProcessing =
      '<p>See <span data-scripture-reference="Romans 8:1" class="scripture-pill">Romans 8:1</span>' +
      ' and also <span data-scripture-reference="John 3:16" class="scripture-pill">John 3:16</span>.</p>';
    expect(noteDedupeKey('Romans 8 study', beforeImport)).toBe(
      noteDedupeKey('Romans 8 study', afterProcessing),
    );
  });

  it('still tells genuinely different content apart', () => {
    expect(noteDedupeKey('A', '<p>See John 3:16.</p>')).not.toBe(
      noteDedupeKey('A', '<p>See John 3:17.</p>'),
    );
  });
});

describe('chooseSurvivor', () => {
  const g = [
    { id: 'c', createdAt: '2026-01-03T00:00:00Z' },
    { id: 'a', createdAt: '2026-01-01T00:00:00Z' },
    { id: 'b', createdAt: '2026-01-02T00:00:00Z' },
  ];

  it('keeps the most-attached note regardless of date', () => {
    const counts = new Map([['c', 5], ['a', 1], ['b', 0]]);
    expect(chooseSurvivor(g, counts).id).toBe('c');
  });

  it('breaks ties by earliest createdAt', () => {
    const counts = new Map([['a', 2], ['b', 2], ['c', 2]]);
    expect(chooseSurvivor(g, counts).id).toBe('a');
  });

  it('breaks remaining ties by lowest id (deterministic)', () => {
    const same = [
      { id: 'z', createdAt: '2026-01-01T00:00:00Z' },
      { id: 'x', createdAt: '2026-01-01T00:00:00Z' },
      { id: 'y', createdAt: '2026-01-01T00:00:00Z' },
    ];
    expect(chooseSurvivor(same, new Map()).id).toBe('x');
  });

  it('does not mutate the input group', () => {
    const input = [...g];
    chooseSurvivor(input, new Map());
    expect(input.map((n) => n.id)).toEqual(['c', 'a', 'b']);
  });
});
