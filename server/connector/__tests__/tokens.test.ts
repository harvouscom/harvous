import { describe, expect, it, vi } from 'vitest';

vi.mock('../../db', () => ({ db: {}, ConnectorApiKeys: {}, eq: vi.fn(), and: vi.fn(), isNull: vi.fn(), first: vi.fn() }));

const { generatePersonalToken, hashPersonalToken, isPersonalToken } = await import('../tokens');

describe('personal token shape', () => {
  it('is hvous_ plus 43 url-safe characters, different every time', () => {
    const a = generatePersonalToken();
    const b = generatePersonalToken();
    expect(a).toMatch(/^hvous_[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
    expect(isPersonalToken(a)).toBe(true);
    expect(isPersonalToken('oat_x')).toBe(false);
  });

  it('stores a sha256 hex digest, never the token', () => {
    const token = generatePersonalToken();
    const hash = hashPersonalToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token.slice(6));
    expect(hashPersonalToken(token)).toBe(hash);
  });
});
