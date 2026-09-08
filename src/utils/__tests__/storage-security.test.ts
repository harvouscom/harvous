import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isBrowserSecureContext,
  isStorageSecurityError,
  readServiceWorkerContainer,
} from '../storage-security';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isStorageSecurityError', () => {
  it('recognizes a DOM SecurityError', () => {
    const error = new DOMException('The operation is insecure.', 'SecurityError');
    expect(isStorageSecurityError(error)).toBe(true);
  });

  it('recognizes the Safari message without the name', () => {
    expect(isStorageSecurityError(new Error('The operation is insecure.'))).toBe(true);
  });

  it('does not swallow unrelated failures', () => {
    expect(isStorageSecurityError(new Error('QuotaExceededError'))).toBe(false);
    expect(isStorageSecurityError(null)).toBe(false);
  });
});

describe('readServiceWorkerContainer', () => {
  it('returns the container when the getter works', () => {
    const container = { ready: Promise.resolve(null) };
    vi.stubGlobal('navigator', { serviceWorker: container });
    expect(readServiceWorkerContainer()).toBe(container);
  });

  it('returns null when Safari private browsing throws on the getter', () => {
    vi.stubGlobal('navigator', {
      get serviceWorker() {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    });
    expect(readServiceWorkerContainer()).toBeNull();
  });
});

describe('isBrowserSecureContext', () => {
  it('is true when the browser reports a secure context', () => {
    vi.stubGlobal('window', { isSecureContext: true });
    expect(isBrowserSecureContext()).toBe(true);
  });

  it('is false on http outside localhost', () => {
    vi.stubGlobal('window', { isSecureContext: false });
    expect(isBrowserSecureContext()).toBe(false);
  });
});
