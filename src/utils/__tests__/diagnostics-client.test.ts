import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('diagnostics-client', () => {
  // Every test imports a fresh module, and each one's capture listeners would otherwise stay
  // on the one shared window and report again in every later test.
  const added: Array<[string, EventListenerOrEventListenerObject]> = [];

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    const original = window.addEventListener.bind(window);
    vi.spyOn(window, 'addEventListener').mockImplementation(((
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) => {
      added.push([type, listener]);
      original(type, listener, options);
    }) as typeof window.addEventListener);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const [type, listener] of added.splice(0)) window.removeEventListener(type, listener);
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

  it('skips an error thrown by a browser extension', async () => {
    const fetchMock = vi.mocked(fetch);
    const { initDiagnosticCapture } = await import('../diagnostics-client');
    initDiagnosticCapture();

    const err = new Error('window.ethereum.emit is not a function');
    err.stack = 'TypeError\n    at chrome-extension://abcdefgh/inject.js:1:1';
    window.dispatchEvent(
      new ErrorEvent('error', {
        message: err.message,
        filename: 'chrome-extension://abcdefgh/inject.js',
        lineno: 1,
        colno: 1,
        error: err,
      }),
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still reports our own crash, and carries where it was thrown', async () => {
    const fetchMock = vi.mocked(fetch);
    const { initDiagnosticCapture } = await import('../diagnostics-client');
    initDiagnosticCapture();

    const err = new Error("Cannot read properties of undefined (reading 'blankLengths')");
    err.stack = 'TypeError\n    at https://app.harvous.com/assets/index.js:49:118';
    window.dispatchEvent(
      new ErrorEvent('error', {
        message: err.message,
        filename: 'https://app.harvous.com/assets/index.js',
        lineno: 49,
        colno: 118,
        error: err,
      }),
    );

    // Count, not times: initDiagnosticCapture() in the earlier cases left their own listeners
    // on this file's shared jsdom window, and each reports through its own module instance.
    expect(fetchMock).toHaveBeenCalled();
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.metadata.scriptFilename).toBe('https://app.harvous.com/assets/index.js');
    expect(body.metadata.scriptLineno).toBe(49);
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

  it('labels API failures with the redacted path so one endpoint is one issue', async () => {
    const fetchMock = vi.mocked(fetch);
    const { reportApiDiagnostic } = await import('../diagnostics-client');

    reportApiDiagnostic('/api/discover/listings', 500, 'A database error occurred');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.message).toBe('A database error occurred (/api/discover/listings)');
  });

  it('drops leftover push-nav instrumentation and insecure-context noise', async () => {
    const fetchMock = vi.mocked(fetch);
    const { reportClientError } = await import('../diagnostics-client');

    reportClientError('[push-nav] client navigate path=/read/today via=visible-peek waitedMs=0');
    reportClientError('The operation is insecure.');
    reportClientError('WebSocket not available: The operation is insecure.');
    reportClientError(
      "@clerk/clerk-react: You've added multiple <ClerkProvider> components in your React component tree. Wrap your components in a single <ClerkProvider>.",
    );
    reportClientError("'text/html' is not a valid JavaScript MIME type.");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe('chunk recovery', () => {
    const chunkFailure =
      'Failed to fetch dynamically imported module: https://app.harvous.com/assets/PrototypePinSheet-BMsZRtqG.js';

    it('drops chunk failures while the preloadError reload is on its way', async () => {
      const fetchMock = vi.mocked(fetch);
      const { markChunkReloadInFlight, reportClientError, reportRouteBoundaryError } = await import(
        '../diagnostics-client'
      );

      markChunkReloadInFlight();
      reportClientError(chunkFailure);
      reportClientError('Unable to preload CSS for /assets/scan-offer-RP-LgaTI.css');
      reportRouteBoundaryError(new TypeError('Importing a module script failed.'));

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('still reports other errors during the reload', async () => {
      const fetchMock = vi.mocked(fetch);
      const { markChunkReloadInFlight, reportClientError } = await import('../diagnostics-client');

      markChunkReloadInFlight();
      reportClientError(new TypeError("Cannot read properties of undefined (reading 'includes')"));

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('tags a chunk failure that survived the reload', async () => {
      const fetchMock = vi.mocked(fetch);
      const { markChunkReloadExhausted, reportClientError } = await import('../diagnostics-client');

      markChunkReloadExhausted();
      reportClientError(chunkFailure);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
      expect(body.metadata.chunkLoadAfterReload).toBe(true);
    });
  });

  describe('unhandled rejections', () => {
    async function rejectWith(reason: unknown) {
      const fetchMock = vi.mocked(fetch);
      const { initDiagnosticCapture } = await import('../diagnostics-client');
      initDiagnosticCapture();
      const event = new Event('unhandledrejection') as Event & { reason: unknown };
      event.reason = reason;
      window.dispatchEvent(event);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      return JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    }

    it('names a null reason and sends no stack of its own', async () => {
      const body = await rejectWith(null);
      expect(body.message).toBe('Unhandled promise rejection (null)');
      expect(body.stack).toBeNull();
      expect(body.metadata.rejectionKind).toBe('null');
    });

    it('describes a plain object by its code and keys', async () => {
      const body = await rejectWith({ code: 'PGRST116', message: undefined, details: 'x' });
      expect(body.message).toBe('Unhandled promise rejection (Object PGRST116: code, details, message)');
      expect(body.metadata.rejectionKind).toBe('object');
    });

    it('describes an Event by its type and target element', async () => {
      const script = document.createElement('script');
      script.src = '/assets/push-reminders-CDHqDcoN.js';
      const event = new Event('error');
      script.dispatchEvent(event);
      const body = await rejectWith(event);
      expect(body.message).toBe('Unhandled promise rejection (Event error on SCRIPT)');
      expect(body.metadata.scriptFilename).toBe('/assets/push-reminders-CDHqDcoN.js');
    });

    it('describes a thrown Response by status and path', async () => {
      const body = await rejectWith({ status: 503, url: `${window.location.origin}/api/notes/note_abc`, ok: false });
      expect(body.message).toBe('Unhandled promise rejection (Response 503 /api/notes/:id)');
    });

    it('reports an error-like from another realm with its own message and stack', async () => {
      const foreign = { name: 'TypeError', message: 'Load failed', stack: 'TypeError: Load failed\n    at x (clerk.js:1:1)' };
      const body = await rejectWith(foreign);
      expect(body.message).toBe('Load failed');
      expect(body.stack).toContain('clerk.js');
      expect(body.metadata.rejectionKind).toBe('error');
    });
  });

  it('labels the browser engine and major version', async () => {
    const { browserMajorFromUserAgent } = await import('../diagnostics-client');
    expect(
      browserMajorFromUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.90 Safari/537.36',
      ),
    ).toBe('chrome 89');
    expect(
      browserMajorFromUserAgent(
        'Mozilla/5.0 (Linux; Android 9; SM-G960F; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/86.0.4240.99 Mobile Safari/537.36',
      ),
    ).toBe('webview 86');
    expect(
      browserMajorFromUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('safari 17');
    expect(
      browserMajorFromUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
      ),
    ).toBe('edge 130');
    expect(
      browserMajorFromUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 14.4; rv:131.0) Gecko/20100101 Firefox/131.0'),
    ).toBe('firefox 131');
  });
});
