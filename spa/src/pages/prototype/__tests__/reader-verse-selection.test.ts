import { describe, it, expect } from 'vitest';
import { nextVerseSelection } from '../reader-verse-selection';

describe('nextVerseSelection', () => {
  it('selects a verse when nothing is selected', () => {
    expect(nextVerseSelection(null, 3, false)).toEqual([3, 3]);
  });

  it('deselects when the only selected verse is tapped again', () => {
    expect(nextVerseSelection([3, 3], 3, false)).toBeNull();
  });

  it('extends forward on a plain tap, so touch can select a passage', () => {
    expect(nextVerseSelection([3, 3], 7, false)).toEqual([3, 7]);
  });

  it('extends backward on a plain tap', () => {
    expect(nextVerseSelection([7, 7], 3, false)).toEqual([3, 7]);
  });

  it('narrows to the tapped verse when it is inside a range', () => {
    expect(nextVerseSelection([3, 7], 5, false)).toEqual([5, 5]);
  });

  it('narrows at a range edge too', () => {
    expect(nextVerseSelection([3, 7], 7, false)).toEqual([7, 7]);
  });

  it('grows past an existing range rather than restarting', () => {
    expect(nextVerseSelection([3, 7], 9, false)).toEqual([3, 9]);
  });

  it('holds the range when shift-clicking inside it', () => {
    expect(nextVerseSelection([3, 7], 5, true)).toEqual([3, 7]);
  });

  it('still extends on shift-click', () => {
    expect(nextVerseSelection([3, 3], 9, true)).toEqual([3, 9]);
  });
});
