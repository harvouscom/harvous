import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  SUPPORT_FROM_ERROR_SESSION_KEY,
  consumeSupportOpenedFromError,
  markSupportOpenedFromError,
} from '../support-error-handoff';

describe('support-error-handoff', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('markSupportOpenedFromError sets session flag', () => {
    markSupportOpenedFromError();
    expect(sessionStorage.getItem(SUPPORT_FROM_ERROR_SESSION_KEY)).toBe('1');
  });

  it('consumeSupportOpenedFromError returns true once then clears', () => {
    markSupportOpenedFromError();
    expect(consumeSupportOpenedFromError()).toBe(true);
    expect(consumeSupportOpenedFromError()).toBe(false);
    expect(sessionStorage.getItem(SUPPORT_FROM_ERROR_SESSION_KEY)).toBeNull();
  });
});

describe('reportRouteBoundaryError', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });

  it('dedupes identical messages within 30s', async () => {
    const { reportRouteBoundaryError, reportClientError } = await import('../diagnostics-client');
    const err = new Error('same route crash');
    reportClientError(err);
    const fetchCalls = (fetch as ReturnType<typeof vi.fn>).mock.calls.length;

    reportRouteBoundaryError(err);
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(fetchCalls);
  });
});
