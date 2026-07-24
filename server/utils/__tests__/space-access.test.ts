import { describe, expect, it } from 'vitest';
import { isSpaceActive } from '../space-access';

describe('space access state', () => {
  it('rejects deleted spaces before membership or owner healing', () => {
    expect(isSpaceActive(null)).toBe(false);
    expect(isSpaceActive({ deletedAt: new Date() } as any)).toBe(false);
    expect(isSpaceActive({ deletedAt: null } as any)).toBe(true);
  });
});
