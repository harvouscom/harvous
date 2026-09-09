import { describe, it, expect } from 'vitest';
import { REVIEW_INBOX_MAX_ROWS, REVIEW_SESSION_CAP } from '@/utils/review-item-kinds';

describe('review visible cap', () => {
  it('shows at most eight strongest items in the sitting and on Activity', () => {
    expect(REVIEW_INBOX_MAX_ROWS).toBe(8);
    expect(REVIEW_SESSION_CAP).toBe(8);
    expect(REVIEW_SESSION_CAP).toBe(REVIEW_INBOX_MAX_ROWS);
  });
});
