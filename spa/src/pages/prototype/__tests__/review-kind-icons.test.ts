import { describe, it, expect } from 'vitest';
import { REVIEW_KIND_ICONS, reviewKindIcon } from '../review-kind-icons';
import { REVIEW_ITEM_KINDS } from '@/utils/review-item-kinds';

describe('review kind icons', () => {
  it('gives every kind a glyph', () => {
    // A missing kind would fall through to `undefined` and render nothing at all.
    for (const kind of REVIEW_ITEM_KINDS) {
      expect(reviewKindIcon(kind)).toBeTruthy();
    }
    expect(Object.keys(REVIEW_KIND_ICONS).sort()).toEqual([...REVIEW_ITEM_KINDS].sort());
  });

  it('never draws a note with the compose-new-note button', () => {
    // `pen-to-square` is the toolbar's "write a new note". On a row about a note you already
    // wrote it reads as an invitation to write another one.
    expect(REVIEW_KIND_ICONS.note).not.toBe('pen-to-square');
    expect(REVIEW_KIND_ICONS.note).toBe('note-sticky');
  });

  it('tells a note, a verse and a highlight apart at a glance', () => {
    // The regression this file exists for: four of the five kinds once shared `arrows-rotate`,
    // so a row said "Review" when the reader needed to know what kind of thing it was about.
    const distinct = new Set([
      REVIEW_KIND_ICONS.note,
      REVIEW_KIND_ICONS.verse,
      REVIEW_KIND_ICONS.highlight,
    ]);
    expect(distinct.size).toBe(3);
  });

  it('keeps the scripture glyph that was already right', () => {
    expect(REVIEW_KIND_ICONS.verse).toBe('book-open');
  });

  it('draws a highlight with the highlighter', () => {
    expect(REVIEW_KIND_ICONS.highlight).toBe('highlighter');
  });

  it('shares the thread glyph between a link and the cluster it belongs to', () => {
    // Deliberate: `arrow-right-arrow-left` is the thread mark everywhere in the app, and a
    // connection is one edge of the same object. Their questions read nothing alike.
    expect(REVIEW_KIND_ICONS.connection).toBe('arrow-right-arrow-left');
    expect(REVIEW_KIND_ICONS.thread).toBe('arrow-right-arrow-left');
  });

  it('leaves the generic Review glyph to the feature, not to its items', () => {
    for (const kind of REVIEW_ITEM_KINDS) {
      expect(reviewKindIcon(kind)).not.toBe('arrows-rotate');
    }
  });
});
