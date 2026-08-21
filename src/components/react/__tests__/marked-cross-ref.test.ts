import { describe, expect, it } from 'vitest';
import { isMarkedCrossRef } from '../PassageContextStrip';

/**
 * The suggestion's wording and the list's formatting come from different code paths, so this
 * match is the one place they have to agree. When it silently fails nothing breaks — the row
 * just is not marked — which is exactly the kind of quiet wrong that needs a test.
 */
describe('isMarkedCrossRef', () => {
  it('matches the row a suggestion named', () => {
    expect(isMarkedCrossRef('Romans 5:8', 'Romans 5:8')).toBe(true);
  });

  it('marks nothing when no suggestion sent you here', () => {
    expect(isMarkedCrossRef('Romans 5:8', null)).toBe(false);
    expect(isMarkedCrossRef('Romans 5:8', undefined)).toBe(false);
    expect(isMarkedCrossRef('Romans 5:8', '   ')).toBe(false);
  });

  it('sees through the dash the list renders ranges with', () => {
    // The list uses an en dash; a suggestion is written with a hyphen.
    expect(isMarkedCrossRef('Romans 5:8–10', 'Romans 5:8-10')).toBe(true);
  });

  it('matches a range that opens on the verse that was meant', () => {
    // "Romans 5:8–10" is still the passage a suggestion pointing at Romans 5:8 meant.
    expect(isMarkedCrossRef('Romans 5:8–10', 'Romans 5:8')).toBe(true);
  });

  it('does not match a different verse in the same chapter', () => {
    expect(isMarkedCrossRef('Romans 5:9', 'Romans 5:8')).toBe(false);
  });

  it('does not match a different book', () => {
    expect(isMarkedCrossRef('Galatians 5:8', 'Romans 5:8')).toBe(false);
  });

  it('ignores casing and stray whitespace', () => {
    expect(isMarkedCrossRef('Romans 5:8', '  romans 5:8 ')).toBe(true);
  });
});
