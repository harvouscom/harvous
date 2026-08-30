import { describe, it, expect } from 'vitest';
import { nextVerseSelection, type VerseSelection } from '../reader-verse-selection';

/** A selection in the translation the page is in — the only column until a comparison opens. */
const primary = (start: number, end: number): VerseSelection => ({ start, end, column: 'primary' });

describe('nextVerseSelection', () => {
  it('selects a verse when nothing is selected', () => {
    expect(nextVerseSelection(null, 3, false, 'primary')).toEqual(primary(3, 3));
  });

  it('deselects when the only selected verse is tapped again', () => {
    expect(nextVerseSelection(primary(3, 3), 3, false, 'primary')).toBeNull();
  });

  it('extends forward on a plain tap, so touch can select a passage', () => {
    expect(nextVerseSelection(primary(3, 3), 7, false, 'primary')).toEqual(primary(3, 7));
  });

  it('extends backward on a plain tap', () => {
    expect(nextVerseSelection(primary(7, 7), 3, false, 'primary')).toEqual(primary(3, 7));
  });

  it('narrows to the tapped verse when it is inside a range', () => {
    expect(nextVerseSelection(primary(3, 7), 5, false, 'primary')).toEqual(primary(5, 5));
  });

  it('narrows at a range edge too', () => {
    expect(nextVerseSelection(primary(3, 7), 7, false, 'primary')).toEqual(primary(7, 7));
  });

  it('grows past an existing range rather than restarting', () => {
    expect(nextVerseSelection(primary(3, 7), 9, false, 'primary')).toEqual(primary(3, 9));
  });

  it('holds the range when shift-clicking inside it', () => {
    expect(nextVerseSelection(primary(3, 7), 5, true, 'primary')).toEqual(primary(3, 7));
  });

  it('still extends on shift-click', () => {
    expect(nextVerseSelection(primary(3, 3), 9, true, 'primary')).toEqual(primary(3, 9));
  });

  describe('across the two columns of a comparison', () => {
    it('starts over in the other version rather than reaching across', () => {
      /* The load-bearing rule. A range half in one translation and half in another has no
         text to be a highlight *of*, and every action downstream asks it for exactly that. */
      expect(nextVerseSelection(primary(3, 7), 5, false, 'compare')).toEqual({
        start: 5,
        end: 5,
        column: 'compare',
      });
    });

    it('does not let shift extend across either, for the same reason', () => {
      expect(nextVerseSelection(primary(3, 3), 9, true, 'compare')).toEqual({
        start: 9,
        end: 9,
        column: 'compare',
      });
    });

    it('does not read a crossing tap as the way back out', () => {
      /* Tapping the sole selected verse clears the selection — but only in the column it is
         in. The same verse number in the other version is a different piece of text, and
         clearing there would look like the tap did nothing. */
      expect(nextVerseSelection(primary(4, 4), 4, false, 'compare')).toEqual({
        start: 4,
        end: 4,
        column: 'compare',
      });
    });

    it('behaves exactly the same within the compare column', () => {
      const inCompare: VerseSelection = { start: 3, end: 3, column: 'compare' };
      expect(nextVerseSelection(inCompare, 7, false, 'compare')).toEqual({
        start: 3,
        end: 7,
        column: 'compare',
      });
      expect(nextVerseSelection(inCompare, 3, false, 'compare')).toBeNull();
    });
  });
});
