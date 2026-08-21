import { describe, expect, it } from 'vitest';
import { colorTokenVar, threadColorVar, spaceIconAccentHex } from '../space-cover';

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

/**
 * The general form, which the sweep across ~14 components uses.
 *
 * Each of those had written the reference by hand with its own default — purple for a thread
 * accent, blue for a member avatar, paper for a space cover — and none of them guarded the
 * hue. The point of the helper is that a call site keeps its own default and stops having to
 * remember the guard.
 */
describe('colorTokenVar', () => {
  it('keeps a defined hue exactly as it is', () => {
    expect(colorTokenVar('green', 'purple')).toBe('var(--color-green)');
  });

  it("uses the call site's own default when there is no colour", () => {
    expect(colorTokenVar(null, 'purple')).toBe('var(--color-purple)');
    expect(colorTokenVar(undefined, 'paper')).toBe('var(--color-paper)');
    expect(colorTokenVar('', 'blue')).toBe('var(--color-blue)');
    // Whitespace is not a colour. Left unguarded this produced `var(--color- )`.
    expect(colorTokenVar('   ', 'blue')).toBe('var(--color-blue)');
  });

  it('guards an unknown hue with that same default', () => {
    expect(colorTokenVar('teal', 'purple')).toBe('var(--color-teal, var(--color-purple))');
  });

  /**
   * One parameter, not two. A surface that wants purple for "no colour" wants purple for "a
   * colour I cannot resolve" as well; letting those differ is how the same question gets two
   * answers in one codebase.
   */
  it('answers missing and unknown the same way', () => {
    const missing = colorTokenVar(null, 'blue');
    const unknown = colorTokenVar('chartreuse', 'blue');
    expect(missing).toContain('var(--color-blue)');
    expect(unknown).toContain('var(--color-blue)');
  });

  it('normalises case, since the columns are free text', () => {
    expect(colorTokenVar('GREEN', 'blue')).toBe('var(--color-green)');
  });

  it('still describes threadColorVar, which is now a special case of it', () => {
    expect(threadColorVar('teal')).toBe(colorTokenVar('teal', 'blue'));
    expect(threadColorVar(null)).toBe(colorTokenVar('paper', 'blue'));
  });
});
