import { describe, expect, it } from 'vitest';
import {
  dateSpan,
  daysUntil,
  leavingRowTitle,
  leavingToastMessage,
  lockedEdgeLabel,
} from '../history-window-copy';
import { shouldShowHistoryReminder } from '../../hooks/useHistoryWindowReminder';

const NOW = new Date('2026-10-01T12:00:00');
const leaving = (count: number, firstLeavesAt: string) => ({
  count,
  oldestAt: '2026-07-02T10:00:00',
  newestAt: '2026-07-05T10:00:00',
  firstLeavesAt,
});

describe('history window copy', () => {
  it('spans dates the way people say them', () => {
    expect(dateSpan('2026-07-02T10:00:00', '2026-07-02T18:00:00')).toBe('Jul 2');
    expect(dateSpan('2026-07-02T10:00:00', '2026-07-05T10:00:00')).toBe('Jul 2–5');
    expect(dateSpan('2026-07-30T10:00:00', '2026-08-02T10:00:00')).toBe('Jul 30 – Aug 2');
  });

  it('never counts down to zero', () => {
    expect(daysUntil('2026-10-01T13:00:00', NOW)).toBe(1);
    expect(daysUntil('2026-10-05T12:00:00', NOW)).toBe(4);
  });

  it('says what leaves and when, and that nothing is deleted', () => {
    expect(leavingRowTitle(leaving(3, '2026-10-05T12:00:00'), NOW)).toBe(
      'Your study from Jul 2–5 leaves your history in 4 days',
    );
    expect(leavingRowTitle(leaving(3, '2026-10-02T09:00:00'), NOW)).toContain('tomorrow');
    const toast = leavingToastMessage(leaving(12, '2026-10-05T12:00:00'), NOW);
    expect(toast).toBe(
      '12 notes and highlights from Jul 2–5 leave your history in 4 days. Nothing is deleted — Plus keeps it all in view.',
    );
    expect(leavingToastMessage(leaving(1, '2026-10-05T12:00:00'), NOW)).toMatch(/^A note or highlight from .* leaves /);
  });

  it('puts the real count on the trail edge, or falls back when there is none', () => {
    expect(lockedEdgeLabel(42, false)).toBe('42 earlier · Plus');
    expect(lockedEdgeLabel(500, true)).toBe('500+ earlier · Plus');
    expect(lockedEdgeLabel(0, false)).toBeNull();
    expect(lockedEdgeLabel(undefined, undefined)).toBeNull();
  });
});

describe('weekly reminder cadence', () => {
  const now = Date.parse('2026-10-01T12:00:00Z');
  it('shows the first time, then not again for a week', () => {
    expect(shouldShowHistoryReminder(null, now)).toBe(true);
    expect(shouldShowHistoryReminder(String(now - 6 * 86_400_000), now)).toBe(false);
    expect(shouldShowHistoryReminder(String(now - 7 * 86_400_000), now)).toBe(true);
    expect(shouldShowHistoryReminder('garbage', now)).toBe(true);
  });
});
