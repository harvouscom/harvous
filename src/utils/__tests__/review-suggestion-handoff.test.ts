import { describe, it, expect } from 'vitest';
import {
  RECALL_KINDS_DEFERRING_TO_REVIEW,
  activeReviewCoversReference,
} from '@/utils/review-suggestion-handoff';

const active = (...refs: string[]) => new Set(refs);

describe('activeReviewCoversReference', () => {
  it('matches the same passage however it is cased or spaced', () => {
    expect(activeReviewCoversReference('John 15:5', active('john 15:5'))).toBe(true);
    expect(activeReviewCoversReference('  JOHN 15:5 ', active('John 15:5'))).toBe(true);
  });

  it('lets a chapter card step aside for a verse inside it, and the reverse', () => {
    // Home names the chapter, Review names the verse. One screen, one subject.
    expect(activeReviewCoversReference('Psalms 62', active('psalms 62:5'))).toBe(true);
    expect(activeReviewCoversReference('Psalms 62:5', active('psalms 62'))).toBe(true);
  });

  it('does not confuse a chapter with the one whose number it prefixes', () => {
    // The regression this guard exists for: "Psalms 6" must not swallow "Psalms 62".
    expect(activeReviewCoversReference('Psalms 6', active('psalms 62:5'))).toBe(false);
    expect(activeReviewCoversReference('John 1', active('john 15:5'))).toBe(false);
  });

  it('says no to an unrelated passage, an empty set, and nothing at all', () => {
    expect(activeReviewCoversReference('John 15:5', active('romans 8:15'))).toBe(false);
    expect(activeReviewCoversReference('John 15:5', active())).toBe(false);
    expect(activeReviewCoversReference(null, active('john 15:5'))).toBe(false);
    expect(activeReviewCoversReference('', active('john 15:5'))).toBe(false);
    expect(activeReviewCoversReference('John 15:5', active('', '   '))).toBe(false);
  });

  it('names the two kinds that defer, and only those', () => {
    // `referenceWord` is deliberately absent: a word you keep looking up is study, not memory.
    expect([...RECALL_KINDS_DEFERRING_TO_REVIEW]).toEqual(['passage', 'highlight']);
  });
});
