import { describe, expect, it } from 'vitest';
import { sharedThreadResultThreadId } from '../dashboard-data';

describe('shared thread note privacy', () => {
  it('returns the shared context thread instead of the canonical private thread', () => {
    expect(
      sharedThreadResultThreadId('thread_private_home', 'thread_shared_context'),
    ).toBe('thread_shared_context');
  });
});
