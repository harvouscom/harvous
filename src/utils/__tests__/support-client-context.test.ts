import { describe, expect, it, vi, afterEach } from 'vitest';
import { collectSupportClientContext } from '../support-client-context';

describe('collectSupportClientContext', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns unknown outside a browser', () => {
    vi.stubGlobal('navigator', undefined);
    expect(collectSupportClientContext()).toEqual({ clientEnvironment: 'Unknown' });
  });

  it('describes desktop Chrome on macOS', () => {
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      platform: 'MacIntel',
    });
    expect(collectSupportClientContext().clientEnvironment).toBe('Desktop · macOS 10.15.7 · Chrome 120.0.0.0');
  });

  it('describes mobile Safari on iOS', () => {
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
      platform: 'iPhone',
    });
    expect(collectSupportClientContext().clientEnvironment).toBe('Mobile · iOS 17.2 · Safari 17.2');
  });
});
