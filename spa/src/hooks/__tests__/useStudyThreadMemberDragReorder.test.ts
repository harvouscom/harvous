import { describe, expect, it } from 'vitest';
import { computeStudyThreadMemberMoveIndex } from '../study-thread-member-move-index';

describe('computeStudyThreadMemberMoveIndex', () => {
  it('moves down when dropping on a lower divider', () => {
    expect(computeStudyThreadMemberMoveIndex(0, 2)).toBe(1);
    expect(computeStudyThreadMemberMoveIndex(0, 3)).toBe(2);
  });

  it('moves up one slot onto the divider below the note above', () => {
    expect(computeStudyThreadMemberMoveIndex(2, 2)).toBe(1);
    expect(computeStudyThreadMemberMoveIndex(1, 1)).toBe(0);
  });

  it('moves to top via the top drop slot', () => {
    expect(computeStudyThreadMemberMoveIndex(2, 0)).toBe(0);
  });

  it('no-ops when already in place', () => {
    expect(computeStudyThreadMemberMoveIndex(0, 0)).toBeNull();
    expect(computeStudyThreadMemberMoveIndex(2, 3)).toBeNull();
  });
});
