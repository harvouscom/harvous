import { describe, expect, it } from 'vitest';
import { threadColorVar, spaceIconAccentHex } from '../space-cover';

/**
 * The colour columns these values come from are free text with no enum, and CSS drops a whole
 * declaration when a `var()` resolves to nothing. That combination fails silently — the element
 * simply loses its background — which is how activity-feed avatars ended up as empty rings.
 */
describe('threadColorVar', () => {
  it('references the token directly for a hue that exists', () => {
    expect(threadColorVar('green')).toBe('var(--color-green)');
  });

  it('falls back for a hue no token defines, rather than emitting a dead reference', () => {
    // 'teal' was in the gallery fixtures and is not a real hue. Before the fallback this
    // produced `var(--color-teal)`, which CSS discarded, leaving the avatar with no fill.
    expect(threadColorVar('teal')).toBe('var(--color-teal, var(--color-blue))');
  });

  it('treats a missing colour as paper, which is a real token', () => {
    expect(threadColorVar(null)).toBe('var(--color-paper)');
    expect(threadColorVar(undefined)).toBe('var(--color-paper)');
    expect(threadColorVar('')).toBe('var(--color-paper)');
  });

  it('is case-insensitive, since stored values are not normalised', () => {
    expect(threadColorVar('GREEN')).toBe('var(--color-green)');
  });
});

describe('spaceIconAccentHex never emits an unguarded reference', () => {
  it('gives an unknown hue something to fall back to', () => {
    for (const mode of ['light', 'dark'] as const) {
      const out = spaceIconAccentHex('teal', mode);
      expect(out).toContain('var(--color-blue)');
    }
  });

  it('still resolves picker hues to a real hex', () => {
    // The five picker colours pair with an appearance preset and never reach the token path.
    expect(spaceIconAccentHex('blue', 'light')).toMatch(/^#/);
    expect(spaceIconAccentHex('green', 'light')).toMatch(/^#/);
  });

  it('keeps the dark ramp for hues that have one', () => {
    expect(spaceIconAccentHex('yellow', 'dark')).toBe('var(--pds-thread-yellow, var(--color-yellow))');
  });
});
