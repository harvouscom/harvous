import { afterEach, describe, expect, it, vi } from 'vitest';
import { getInstallPlatform, isAndroid, isIOS } from '@/utils/platform-detect';

describe('platform-detect', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('detects iOS user agents', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' });
    expect(isIOS()).toBe(true);
    expect(isAndroid()).toBe(false);
    expect(getInstallPlatform()).toBe('ios');
  });

  it('detects Android user agents', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)' });
    expect(isIOS()).toBe(false);
    expect(isAndroid()).toBe(true);
    expect(getInstallPlatform()).toBe('android');
  });

  it('returns other for unknown mobile user agents', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Mobile; rv:128.0) Gecko/128.0 Firefox/128.0' });
    expect(getInstallPlatform()).toBe('other');
  });
});
