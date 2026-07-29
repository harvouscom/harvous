import { describe, expect, it } from 'vitest';
import { isAllowedExternalHref } from '../TiptapUrlLink';

describe('isAllowedExternalHref', () => {
  it('allows http and https URLs', () => {
    expect(isAllowedExternalHref('https://example.com/path')).toBe(true);
    expect(isAllowedExternalHref('http://example.com')).toBe(true);
  });

  it('rejects javascript: and other dangerous schemes', () => {
    expect(isAllowedExternalHref('javascript:alert(1)')).toBe(false);
    expect(isAllowedExternalHref('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isAllowedExternalHref('vbscript:msgbox(1)')).toBe(false);
    expect(isAllowedExternalHref('')).toBe(false);
    expect(isAllowedExternalHref(null)).toBe(false);
  });
});
