import { describe, expect, it } from 'vitest';
import { isAppleTouchUserAgent } from '../platform-detect';

/** iPadOS reports a desktop Mac user agent; only the touch screen gives it away. */
describe('isAppleTouchUserAgent', () => {
  const ipadOs = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
  it('counts iPadOS (Mac UA + touch) as iOS', () => {
    expect(isAppleTouchUserAgent(ipadOs, 5)).toBe(true);
  });
  it('does not count a real Mac', () => {
    expect(isAppleTouchUserAgent(ipadOs, 0)).toBe(false);
  });
  it('counts iPhone', () => {
    expect(isAppleTouchUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 5)).toBe(true);
  });
});
