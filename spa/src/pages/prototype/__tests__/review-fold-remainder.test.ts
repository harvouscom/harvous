import { describe, expect, it } from 'vitest';
import { reviewFoldRemainder } from '../review-fold-remainder';

describe('reviewFoldRemainder', () => {
  it('counts only the rows the fold will open', () => {
    expect(reviewFoldRemainder(8, 1)).toBe(7);
    expect(reviewFoldRemainder(3, 1)).toBe(2);
  });

  it('does not inherit a table-sized due count', () => {
    expect(reviewFoldRemainder(8, 1)).not.toBe(18);
  });
});
