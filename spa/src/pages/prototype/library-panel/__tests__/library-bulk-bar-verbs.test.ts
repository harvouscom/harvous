/**
 * Which verbs the panel's bulk bar puts up.
 *
 * The rule under test is one sentence — *the verbs follow the selection, not the tab* — and it
 * is the rule the bar got wrong. Everything's tab kind is permanently `'mixed'`, so reading it
 * meant a pile of three notes was offered pin and delete while the gate beside it had already
 * approved all six. The keyboard chords went the other way and worked, which is how the two
 * surfaces ended up disagreeing about the same selection.
 */
import { describe, expect, it } from 'vitest';
import { offeredBulkVerbs } from '../PrototypeLibraryBulkBar';

const ALL_SIX = [
  'organize.folder',
  'organize.thread',
  'organize.pin',
  'organize.share',
  'organize.delete',
];

describe('the verbs follow the selection, not the tab', () => {
  it('offers a note pile every note verb, whichever tab it was picked on', () => {
    /* The whole complaint: these are the same ids the Notes tab would have offered six verbs
       for, and picking them on Everything used to cost four of them. */
    expect(offeredBulkVerbs('note', false)).toEqual(ALL_SIX);
  });

  it('drops to pin and delete the moment the pile stops being one kind', () => {
    /* Not a lesser answer — the honest one. Folder, Thread and share have nothing to do to
       the folder now sitting in the selection, and offering them greyed would be dead
       controls rather than an explanation. */
    expect(offeredBulkVerbs('mixed', false)).toEqual(['organize.pin', 'organize.delete']);
  });

  it('gives folders, Threads and highlights the two verbs they have always had', () => {
    for (const kind of ['folder', 'thread', 'highlight'] as const) {
      expect(offeredBulkVerbs(kind, false)).toEqual(['organize.pin', 'organize.delete']);
    }
  });

  it('offers nothing but the two when there is no kind to speak of yet', () => {
    /* Null is the loading case — a selected row past the page the panel has fetched. */
    expect(offeredBulkVerbs(null, false)).toEqual(['organize.pin', 'organize.delete']);
  });
});

describe('share and remove-from-space, which are opposites', () => {
  it('offers share outside a shared space and never beside remove', () => {
    const verbs = offeredBulkVerbs('note', false);
    expect(verbs).toContain('organize.share');
    expect(verbs).not.toContain('organize.removeFromSpace');
  });

  it('swaps them inside one, so neither is ever permanently dark', () => {
    const verbs = offeredBulkVerbs('note', true);
    expect(verbs).toContain('organize.removeFromSpace');
    expect(verbs).not.toContain('organize.share');
  });

  it('keeps the swap out of the kinds that have neither', () => {
    expect(offeredBulkVerbs('folder', true)).toEqual(['organize.pin', 'organize.delete']);
  });
});
