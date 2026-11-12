import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useLocalDay } from '../useLocalDay';

/**
 * Today's passage needed a reload on a new day: nothing re-rendered at midnight, so the query key
 * that carries the day never moved. These pin the two ways a new day has to be noticed.
 */
describe('useLocalDay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 11, 23, 50, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('moves at midnight in a tab that stays open', () => {
    const { result } = renderHook(() => useLocalDay());
    expect(result.current).toBe('2026-11-11');
    act(() => {
      vi.advanceTimersByTime(11 * 60 * 1000);
    });
    expect(result.current).toBe('2026-11-12');
  });

  it('moves when an app suspended overnight comes back', () => {
    const { result } = renderHook(() => useLocalDay());
    expect(result.current).toBe('2026-11-11');
    // Suspended: the clock moves, the timer does not fire.
    vi.setSystemTime(new Date(2026, 10, 12, 7, 0, 0));
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current).toBe('2026-11-12');
  });
});
