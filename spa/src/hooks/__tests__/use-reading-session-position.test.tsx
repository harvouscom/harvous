import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * Opening a chapter wiped the verse you had left off at.
 *
 * The session's opening mark sent the chapter alone, and the server stamped it as the newest
 * position — so the verse came back only if the closing write landed. Close the tab, lose the
 * app, drop offline, and the next visit started at the top. These pin the opening mark to the
 * verse on screen, and the closing mark to sending only what moved.
 */
const recordLastReadPosition = vi.fn();

vi.mock('../../pages/prototype/proto-reading-events', () => ({
  recordLastReadPosition: (input: unknown) => recordLastReadPosition(input),
  recordReadingEvent: vi.fn(),
}));

import { useReadingSession, type ReadingPosition } from '../useReadingSession';

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  recordLastReadPosition.mockReset();
});

describe('useReadingSession — position', () => {
  it('sends the verse on screen when the chapter opens', () => {
    renderHook(
      () =>
        useReadingSession({
          canonicalReference: 'John 3',
          translationCode: 'NET',
          getPosition: () => ({ verse: 20, atEnd: false }),
        }),
      { wrapper },
    );

    expect(recordLastReadPosition).toHaveBeenCalledTimes(1);
    expect(recordLastReadPosition.mock.calls[0][0]).toMatchObject({
      book: 'John',
      chapter: 3,
      verse: 20,
      atEnd: false,
    });
  });

  it('does not send the same position again when the chapter is left unmoved', () => {
    const { unmount } = renderHook(
      () =>
        useReadingSession({
          canonicalReference: 'John 3',
          translationCode: 'NET',
          getPosition: () => ({ verse: 20, atEnd: false }),
        }),
      { wrapper },
    );
    unmount();

    expect(recordLastReadPosition).toHaveBeenCalledTimes(1);
  });

  it('sends the verse reached, and whether the end was on screen, when it moved', () => {
    let position: ReadingPosition = { verse: 20, atEnd: false };
    const { unmount } = renderHook(
      () =>
        useReadingSession({
          canonicalReference: 'John 3',
          translationCode: 'NET',
          getPosition: () => position,
        }),
      { wrapper },
    );
    position = { verse: 31, atEnd: true };
    unmount();

    expect(recordLastReadPosition).toHaveBeenCalledTimes(2);
    expect(recordLastReadPosition.mock.calls[1][0]).toMatchObject({ verse: 31, atEnd: true });
  });

  it('still marks the chapter when the surface has no verse to give', () => {
    renderHook(
      () => useReadingSession({ canonicalReference: 'John 3', translationCode: 'NET' }),
      { wrapper },
    );

    expect(recordLastReadPosition.mock.calls[0][0]).toMatchObject({ book: 'John', chapter: 3 });
    expect(recordLastReadPosition.mock.calls[0][0].verse).toBeUndefined();
  });
});
