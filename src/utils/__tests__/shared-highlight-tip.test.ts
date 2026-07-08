import { describe, expect, it, beforeEach } from 'vitest';
import { hasSeenSharedHighlightTip, markSharedHighlightTipSeen } from '../shared-highlight-tip';

describe('shared-highlight-tip', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts unseen then marks seen', () => {
    expect(hasSeenSharedHighlightTip()).toBe(false);
    markSharedHighlightTipSeen();
    expect(hasSeenSharedHighlightTip()).toBe(true);
  });
});
