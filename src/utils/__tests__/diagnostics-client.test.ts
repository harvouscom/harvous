import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('diagnostics-client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('skips bare cross-origin Script error without stack or filename', async () => {
    const fetchMock = vi.mocked(fetch);
    const { initDiagnosticCapture } = await import('../diagnostics-client');
    initDiagnosticCapture();

    window.dispatchEvent(
      new ErrorEvent('error', {
        message: 'Script error.',
        filename: '',
        lineno: 0,
        colno: 0,
        error: null,
      }),
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports Clerk load failures with navigator.onLine metadata', async () => {
    const fetchMock = vi.mocked(fetch);
    const { reportClientError } = await import('../diagnostics-client');

    reportClientError(
      'Clerk: Failed to load Clerk, failed to load script: https://clerk.harvous.com/npm/@clerk/clerk-js@5/dist/clerk.browser.js (code="failed_to_load_clerk_js")',
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.metadata.clerkLoadFailure).toBe(true);
    expect(body.metadata).toHaveProperty('navigatorOnLine');
  });
});
