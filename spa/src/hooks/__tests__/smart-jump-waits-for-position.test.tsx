import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

/**
 * A new session's first "open the reader" landed on today's passage instead of where reading
 * stopped.
 *
 * Today's passage is public and arrives at once; the reading position waits on auth. A click in
 * between read "no position" off a query that had not run yet — and the reader, which marks its
 * position on open, then overwrote the real position with today's passage. These pin the wait.
 */
const auth = { isLoaded: true, isSignedIn: true };
const history = {
  data: undefined as unknown,
  isSuccess: false,
  isError: false,
};
const votd = { data: { reference: 'Psalm 23:1', translation: 'NET' } as unknown, isPending: false };

vi.mock('@clerk/clerk-react', () => ({ useAuth: () => auth }));
vi.mock('../queries/useReadingHistory', () => ({ useReadingHistory: () => history }));
vi.mock('../queries/useVotdToday', () => ({ useVotdToday: () => votd }));

import { SMART_JUMP_SETTLE_DEADLINE_MS, useSmartJumpDestination } from '../useSmartJumpDestination';

const romans5 = {
  success: true,
  lastRead: {
    book: 'Romans',
    bookOrder: 45,
    chapter: 5,
    translation: 'ESV',
    readAt: '2026-09-12T20:00:00.000Z',
  },
  chapters: [],
};

beforeEach(() => {
  auth.isLoaded = true;
  auth.isSignedIn = true;
  history.data = undefined;
  history.isSuccess = false;
  history.isError = false;
  votd.data = { reference: 'Psalm 23:1', translation: 'NET' };
  votd.isPending = false;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useSmartJumpDestination on a cold start', () => {
  it('waits for the reading position rather than opening today\'s passage', async () => {
    const { result, rerender } = renderHook(() => useSmartJumpDestination());
    // Today's passage is already here and would be the answer if read now — the old bug.
    expect(result.current.destination.source).toBe('votd');

    let landed: { book: string; chapter: number } | null = null;
    const pending = result.current.resolve().then((d) => {
      landed = d;
    });
    await act(async () => {});
    expect(landed).toBeNull();

    history.data = romans5;
    history.isSuccess = true;
    rerender();
    await act(async () => {
      await pending;
    });
    expect(landed).toMatchObject({ book: 'Romans', chapter: 5 });
  });

  it('answers at once when the position is already loaded', async () => {
    history.data = romans5;
    history.isSuccess = true;
    const { result } = renderHook(() => useSmartJumpDestination());
    await expect(result.current.resolve()).resolves.toMatchObject({ source: 'continue', book: 'Romans' });
  });

  it('does not wait for a signed-out visitor, who has no position to load', async () => {
    auth.isSignedIn = false;
    const { result } = renderHook(() => useSmartJumpDestination());
    await expect(result.current.resolve()).resolves.toMatchObject({ source: 'votd', book: 'Psalms' });
  });

  it("opens today's passage when the position request failed", async () => {
    history.isError = true;
    const { result } = renderHook(() => useSmartJumpDestination());
    await expect(result.current.resolve()).resolves.toMatchObject({ source: 'votd' });
  });

  it('still opens something when the position never arrives', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSmartJumpDestination());
    const pending = result.current.resolve();
    await act(async () => {
      vi.advanceTimersByTime(SMART_JUMP_SETTLE_DEADLINE_MS);
    });
    await expect(pending).resolves.toMatchObject({ source: 'votd' });
  });
});
