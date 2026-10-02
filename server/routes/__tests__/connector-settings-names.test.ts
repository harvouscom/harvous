import { describe, expect, it, vi } from 'vitest';

vi.mock('../../connector/usage', () => ({}));
vi.mock('../../connector/tokens', () => ({}));
vi.mock('../../connector/access', () => ({}));

const { connectedAppName } = await import('../connector-settings');

describe('connectedAppName', () => {
  it('keeps the name the app gave itself', () => {
    expect(connectedAppName('c1', ' meta-ai-muse ')).toBe('meta-ai-muse');
  });
  it('names a nameless token, and anything else nameless', () => {
    expect(connectedAppName('token:ctoken_1', null)).toBe('Personal token');
    expect(connectedAppName('c1', '  ')).toBe('Unknown app');
  });
});
