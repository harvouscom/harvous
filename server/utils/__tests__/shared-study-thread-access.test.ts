import { describe, expect, it } from 'vitest';
import { isUnionedSharedStudyParent } from '../shared-study-thread-access';

describe('isUnionedSharedStudyParent', () => {
  it('unions for shared and public spaces regardless of note author', () => {
    expect(
      isUnionedSharedStudyParent({
        id: 'note_1',
        userId: 'user_a',
        spaceId: 'space_1',
        spaceType: 'shared',
      }),
    ).toBe(true);
    expect(
      isUnionedSharedStudyParent({
        id: 'note_1',
        userId: 'user_a',
        spaceId: 'space_1',
        spaceType: 'public',
      }),
    ).toBe(true);
  });

  it('does not union for personal notes or missing space', () => {
    expect(
      isUnionedSharedStudyParent({
        id: 'note_1',
        userId: 'user_a',
        spaceId: 'space_1',
        spaceType: 'personal',
      }),
    ).toBe(false);
    expect(isUnionedSharedStudyParent(null)).toBe(false);
    expect(
      isUnionedSharedStudyParent({
        id: 'note_1',
        userId: 'user_a',
        spaceId: null,
        spaceType: null,
      }),
    ).toBe(false);
  });
});
