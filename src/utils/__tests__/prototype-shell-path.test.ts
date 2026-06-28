import { describe, expect, it } from 'vitest';
import { isPrototypeNotePath, isPrototypeShellPath } from '@/lib/prototype-path';

describe('prototype shell path (new.harvous.com note slugs)', () => {
  it('treats /fXvv5uY as a prototype shell note path on dedicated host', () => {
    expect(isPrototypeShellPath('/fXvv5uY')).toBe(true);
    expect(isPrototypeNotePath('/fXvv5uY')).toBe(true);
  });

  it('excludes auth and shared routes on dedicated host', () => {
    expect(isPrototypeShellPath('/sign-in')).toBe(false);
    expect(isPrototypeShellPath('/shared/note/abc')).toBe(false);
  });

  it('includes /prototype note slugs on app.harvous.com', () => {
    expect(isPrototypeShellPath('/prototype/fXvv5uY')).toBe(true);
    expect(isPrototypeNotePath('/prototype/fXvv5uY')).toBe(true);
  });
});
