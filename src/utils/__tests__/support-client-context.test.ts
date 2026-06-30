import { describe, expect, it, vi, afterEach } from 'vitest';
import { collectSupportClientContext } from '../support-client-context';

function stubBrowserContext(options: {
  userAgent: string;
  platform?: string;
  language?: string;
  onLine?: boolean;
  innerWidth?: number;
  innerHeight?: number;
  devicePixelRatio?: number;
  standalone?: boolean;
}) {
  vi.stubGlobal('navigator', {
    userAgent: options.userAgent,
    platform: options.platform ?? '',
    language: options.language ?? 'en-US',
    onLine: options.onLine ?? true,
  });
  vi.stubGlobal('window', {
    innerWidth: options.innerWidth ?? 1280,
    innerHeight: options.innerHeight ?? 800,
    devicePixelRatio: options.devicePixelRatio ?? 2,
    matchMedia: (query: string) => ({
      matches: query.includes('standalone') ? (options.standalone ?? false) : false,
    }),
  });
}

describe('collectSupportClientContext', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns unknown outside a browser', () => {
    vi.stubGlobal('navigator', undefined);
    expect(collectSupportClientContext()).toEqual({ clientEnvironment: 'Unknown' });
  });

  it('describes desktop Chrome on macOS', () => {
    stubBrowserContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      platform: 'MacIntel',
      innerWidth: 1440,
      innerHeight: 900,
      devicePixelRatio: 2,
    });
    expect(collectSupportClientContext().clientEnvironment).toBe(
      'Desktop · macOS 10.15.7 · Chrome 120.0.0.0 · 1440×900 · 2x · Browser · Online · en-US',
    );
  });

  it('describes mobile Safari on iOS', () => {
    stubBrowserContext({
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
      platform: 'iPhone',
      innerWidth: 375,
      innerHeight: 812,
      devicePixelRatio: 3,
      standalone: true,
    });
    expect(collectSupportClientContext().clientEnvironment).toBe(
      'Mobile · iOS 17.2 · Safari 17.2 · 375×812 · 3x · PWA · Online · en-US',
    );
  });
});
