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

  it('skips chunk failures from third-party CDNs', async () => {
    const fetchMock = vi.mocked(fetch);
    const { reportClientError } = await import('../diagnostics-client');

    reportClientError(
      'Loading chunk 9573 failed. (error: https://clerk.harvous.com/npm/@clerk/clerk-js@5.127.1/dist/ui-common_clerk.browser_9854dd_5.127.1.js)',
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still reports our own chunk failures', async () => {
    const fetchMock = vi.mocked(fetch);
    const { reportClientError } = await import('../diagnostics-client');

    reportClientError(
      'Failed to fetch dynamically imported module: https://app.harvous.com/assets/PrototypeSupportPage-CJECPRhB.js',
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports an API failure once across React Query retries', async () => {
    const fetchMock = vi.mocked(fetch);
    const { reportApiDiagnostic } = await import('../diagnostics-client');

    // Three attempts of the same failing query — one stored event, not three.
    reportApiDiagnostic('/api/subscription/status', 500, 'Failed to check subscription status');
    reportApiDiagnostic('/api/subscription/status', 500, 'Failed to check subscription status');
    reportApiDiagnostic('/api/subscription/status', 500, 'Failed to check subscription status');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not collapse different API failures', async () => {
    const fetchMock = vi.mocked(fetch);
    const { reportApiDiagnostic } = await import('../diagnostics-client');

    reportApiDiagnostic('/api/subscription/status', 500, 'A');
    reportApiDiagnostic('/api/user/limits', 500, 'B');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
