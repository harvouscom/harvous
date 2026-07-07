import { describe, expect, it } from 'vitest';
import {
  buildProtoDatePickerMonth,
  formatLocalDateInput,
  parseLocalDateInput,
} from '../proto-date-picker';

describe('proto-date-picker', () => {
  it('round-trips YYYY-MM-DD in local time', () => {
    const d = parseLocalDateInput('2026-07-08');
    expect(d).not.toBeNull();
    expect(formatLocalDateInput(d!)).toBe('2026-07-08');
  });

  it('builds a 42-cell month grid starting on Sunday', () => {
    const cells = buildProtoDatePickerMonth(2026, 6); // July 2026
    expect(cells).toHaveLength(42);
    expect(cells.find((c) => c.inMonth && c.day === 1)?.iso).toBe('2026-07-01');
    expect(cells.find((c) => c.inMonth && c.day === 31)?.iso).toBe('2026-07-31');
  });
});
