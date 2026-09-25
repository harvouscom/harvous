import { describe, expect, it } from 'vitest';
import { placeMatch } from '../MatchRows';

describe('placeMatch', () => {
  it('fills the first empty place', () => {
    expect(placeMatch([null, null, null], 2)).toEqual([2, null, null]);
    expect(placeMatch([2, null, 0], 1)).toEqual([2, 1, 0]);
  });

  it('never places the same item twice, and does nothing when every place is full', () => {
    expect(placeMatch([2, null, null], 2)).toEqual([2, null, null]);
    expect(placeMatch([2, 1, 0], 1)).toEqual([2, 1, 0]);
  });
});
