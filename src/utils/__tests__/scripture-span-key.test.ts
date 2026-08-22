import { describe, expect, it } from 'vitest';
import {
  normalizeSpanText,
  scriptureSpanKey,
  spanKeyForSelection,
} from '../scripture-span-key';

/**
 * The span key is what lets two phrases in one verse be two highlights instead of one row
 * overwriting the other. Most of what matters is what it does NOT do, so most of these assert
 * absences: it does not key on raw text, it does not fire for a whole-verse drag, and it does not
 * collide on reordered words.
 */

const VERSE = 'The light shines in the darkness, and the darkness has not overcome it.';

describe('normalizeSpanText', () => {
  it('collapses the differences a translation edit usually makes', () => {
    expect(normalizeSpanText('  The  Light\nshines ')).toBe('the light shines');
  });
});

describe('scriptureSpanKey', () => {
  it('is stable for the same span', () => {
    expect(scriptureSpanKey('the light shines')).toBe(scriptureSpanKey('the light shines'));
  });

  it('survives whitespace and casing — the common shape of a translation correction', () => {
    expect(scriptureSpanKey('The  Light\nShines')).toBe(scriptureSpanKey('the light shines'));
  });

  /**
   * The limit, stated rather than discovered later: a real wording change breaks the match and
   * the highlight re-adds instead of recolouring. Accepted for a span that exists only because
   * someone dragged over it — and the whole-verse case takes on none of it, because it keys null.
   */
  it('does not survive a wording change, which is the accepted cost', () => {
    expect(scriptureSpanKey('the light shines')).not.toBe(scriptureSpanKey('the light shone'));
  });

  it('is order-sensitive, so the same words rearranged are a different span', () => {
    expect(scriptureSpanKey('light the shines')).not.toBe(scriptureSpanKey('the light shines'));
  });

  it('is recognisable as a span key rather than an id', () => {
    expect(scriptureSpanKey('anything')).toMatch(/^s:[0-9a-f]+$/);
  });
});

describe('spanKeyForSelection', () => {
  /**
   * The tie-break that keeps the two gestures from producing duplicate rows over identical text.
   * A drag covering exactly one verse must write the row a tap would have written.
   */
  it('returns null when the drag covers the whole passage', () => {
    expect(spanKeyForSelection(VERSE, VERSE)).toBeNull();
  });

  it('still returns null when the drag is the whole passage with sloppy edges', () => {
    expect(spanKeyForSelection(`  ${VERSE}\n`, VERSE)).toBeNull();
  });

  it('returns a key for a genuine phrase inside the verse', () => {
    const key = spanKeyForSelection('the darkness has not overcome it', VERSE);
    expect(key).toMatch(/^s:/);
  });

  it('gives two different phrases in one verse two different keys', () => {
    const a = spanKeyForSelection('the light shines in the darkness', VERSE);
    const b = spanKeyForSelection('the darkness has not overcome it', VERSE);
    expect(a).not.toBe(b);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
  });

  it('treats an empty selection as no span rather than as a key for nothing', () => {
    expect(spanKeyForSelection('', VERSE)).toBeNull();
    expect(spanKeyForSelection('   ', VERSE)).toBeNull();
  });
});
