/**
 * A study plan in Discover is labelled by its steps, not its notes: a plan's note count
 * includes the Scripture its steps carry, so "7 notes" undersells and misdescribes it.
 */
import { describe, expect, it } from 'vitest';
import { discoverListingStepCount } from '../useDiscoverListings';

describe('discoverListingStepCount', () => {
  it('reads the step count of a pack made from a study plan', () => {
    expect(discoverListingStepCount({ kind: 'pack', preview: { noteCount: 7, stepCount: 5 } })).toBe(5);
  });

  it('is null for a collection Thread and for every other kind', () => {
    expect(discoverListingStepCount({ kind: 'pack', preview: { noteCount: 7 } })).toBeNull();
    expect(discoverListingStepCount({ kind: 'pack', preview: null })).toBeNull();
    expect(discoverListingStepCount({ kind: 'note', preview: { stepCount: 3 } })).toBeNull();
  });
});
