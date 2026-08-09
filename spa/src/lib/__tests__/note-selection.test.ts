import { describe, expect, it } from 'vitest';
import {
  extendNoteSelectionRange,
  toggleNoteSelection,
  NOTE_SELECTION_CAP,
} from '../note-selection';

const ids = ['a', 'b', 'c', 'd', 'e'];

describe('toggleNoteSelection', () => {
  it('adds and removes without reordering what is already held', () => {
    expect(toggleNoteSelection([], 'b')).toEqual(['b']);
    expect(toggleNoteSelection(['b', 'c'], 'd')).toEqual(['b', 'c', 'd']);
    expect(toggleNoteSelection(['b', 'c', 'd'], 'c')).toEqual(['b', 'd']);
  });

  it('stops at the cap the copy endpoint enforces', () => {
    const full = Array.from({ length: NOTE_SELECTION_CAP }, (_, i) => `n${i}`);
    expect(toggleNoteSelection(full, 'one-more')).toHaveLength(NOTE_SELECTION_CAP);
  });
});

describe('extendNoteSelectionRange', () => {
  it('takes everything between the anchor and the target', () => {
    expect(
      extendNoteSelectionRange({
        selected: ['b'],
        orderedIds: ids,
        anchorId: 'b',
        targetId: 'd',
      }),
    ).toEqual(['b', 'c', 'd']);
  });

  it('reads a range the same in either direction', () => {
    expect(
      extendNoteSelectionRange({
        selected: ['d'],
        orderedIds: ids,
        anchorId: 'd',
        targetId: 'b',
      }),
    ).toEqual(['d', 'b', 'c']);
  });

  it('adds to a scattered selection rather than replacing it', () => {
    // Someone who ⌘-clicked two loose notes and then shift-clicked a run meant
    // to add the run. Replacing would throw away the harder-won half.
    expect(
      extendNoteSelectionRange({
        selected: ['a', 'e'],
        orderedIds: ids,
        anchorId: 'b',
        targetId: 'c',
      }),
    ).toEqual(['a', 'e', 'b', 'c']);
  });

  it('never double-counts a note already in the range', () => {
    const out = extendNoteSelectionRange({
      selected: ['c'],
      orderedIds: ids,
      anchorId: 'b',
      targetId: 'd',
    });
    expect(out).toEqual(['c', 'b', 'd']);
    expect(new Set(out).size).toBe(out.length);
  });

  it('degrades to a plain select when shift is the opening gesture', () => {
    // No anchor yet — doing nothing would read as a dead click.
    expect(
      extendNoteSelectionRange({
        selected: [],
        orderedIds: ids,
        anchorId: null,
        targetId: 'c',
      }),
    ).toEqual(['c']);
  });

  it('degrades the same way when the anchor has left the list', () => {
    // The list can be filtered out from under a standing selection.
    expect(
      extendNoteSelectionRange({
        selected: ['z'],
        orderedIds: ids,
        anchorId: 'gone',
        targetId: 'c',
      }),
    ).toEqual(['z', 'c']);
  });

  it('respects the cap', () => {
    const many = Array.from({ length: 80 }, (_, i) => `n${i}`);
    const out = extendNoteSelectionRange({
      selected: [],
      orderedIds: many,
      anchorId: 'n0',
      targetId: 'n79',
    });
    expect(out).toHaveLength(NOTE_SELECTION_CAP);
  });
});
