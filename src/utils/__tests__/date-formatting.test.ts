import { describe, expect, it } from 'vitest';
import { formatNoteDefaultTitle } from '../date-formatting';

describe('formatNoteDefaultTitle', () => {
  it('formats long local month, day, and year', () => {
    expect(formatNoteDefaultTitle(new Date(2026, 5, 28))).toBe('June 28, 2026');
  });

  it('uses local calendar fields', () => {
    expect(formatNoteDefaultTitle(new Date(2024, 0, 1))).toBe('January 1, 2024');
    expect(formatNoteDefaultTitle(new Date(2024, 11, 31))).toBe('December 31, 2024');
  });
});
