/**
 * The panel's first open used to be its slowest — a 93 KB chunk fetched and parsed behind a
 * null Suspense fallback, so the reader saw nothing at all while they waited. These pin the two
 * things that would quietly bring that back: warming more than once, and warming eagerly enough
 * to compete with the first paint it is supposed to stay out of the way of.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('prefetchLibraryPanelChunk', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('waits for idle rather than fetching during the first paint', async () => {
    const idle = vi.fn();
    vi.stubGlobal('requestIdleCallback', idle);

    const { prefetchLibraryPanelChunk } = await import('../prefetch-library-panel-chunk');
    prefetchLibraryPanelChunk();

    expect(idle).toHaveBeenCalledTimes(1);
    // A timeout at all, so a page that never idles still warms; long enough that Activity's
    // opening burst of requests normally finishes first.
    expect(idle.mock.calls[0]?.[1]).toEqual({ timeout: 3000 });
  });

  it('warms once, however many times the shell remounts', async () => {
    const idle = vi.fn();
    vi.stubGlobal('requestIdleCallback', idle);

    const { prefetchLibraryPanelChunk } = await import('../prefetch-library-panel-chunk');
    prefetchLibraryPanelChunk();
    prefetchLibraryPanelChunk();
    prefetchLibraryPanelChunk();

    expect(idle).toHaveBeenCalledTimes(1);
  });

  it('still warms on Safari, which has no requestIdleCallback', async () => {
    vi.stubGlobal('requestIdleCallback', undefined);
    const timeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    const { prefetchLibraryPanelChunk } = await import('../prefetch-library-panel-chunk');
    prefetchLibraryPanelChunk();

    expect(timeoutSpy).toHaveBeenCalled();
    timeoutSpy.mockRestore();
  });
});
