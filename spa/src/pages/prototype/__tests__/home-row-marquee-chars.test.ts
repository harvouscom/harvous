import { describe, expect, it } from 'vitest';
import { marqueeCharCount } from '../PrototypeHomeRow';

/**
 * The count drives two things in prototype-components.css: how long the hover marquee takes,
 * and — since the fade is sized from the same number — whether an edge gradient appears at
 * all. Getting it wrong is not cosmetic in one direction: a label that fits must count low
 * enough that its fade resolves to zero, or hovering softens text nothing is hiding.
 */
describe('marqueeCharCount', () => {
  it('counts a plain string', () => {
    expect(marqueeCharCount('Salvation')).toBe(9);
  });

  it('counts numbers, which callers pass for counts and verses', () => {
    expect(marqueeCharCount(2026)).toBe(4);
  });

  it('sums the parts of a composed meta line', () => {
    expect(marqueeCharCount(['Keep reading', 'Next in John'])).toBe(24);
  });

  it('ignores anything it cannot read, rather than guessing', () => {
    // A caller passing elements gets 0, which falls back to the CSS default pace instead of
    // inventing a length from markup.
    expect(marqueeCharCount(null)).toBe(0);
    expect(marqueeCharCount(undefined)).toBe(0);
    expect(marqueeCharCount(false)).toBe(0);
  });

  it('keeps a short label short enough that its fade resolves to nothing', () => {
    // Mirrors the CSS: clamp(0px, (chars - 24) * 1px, 8px). "Salvation" and "2 notes" are the
    // rows that prompted this — they fit, so they must land at or under the threshold.
    const fadePx = (chars: number) => Math.min(8, Math.max(0, chars - 24));

    expect(fadePx(marqueeCharCount('Salvation'))).toBe(0);
    expect(fadePx(marqueeCharCount('2 notes'))).toBe(0);
    expect(fadePx(marqueeCharCount('12 notes need a folder'))).toBe(0);
  });

  it('gives a genuinely long label the full fade', () => {
    const fadePx = (chars: number) => Math.min(8, Math.max(0, chars - 24));
    const long = 'A cross-reference to explore · From Romans 8:28 · explore 1 Peter 5:10';

    expect(fadePx(marqueeCharCount(long))).toBe(8);
  });
});
