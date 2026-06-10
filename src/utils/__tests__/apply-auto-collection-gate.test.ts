import { describe, expect, it } from 'vitest';
import { applyAutoCollectionAfterEdit, type CollectionChromeState } from '../bible-study-collection-web';

const emptyChrome: CollectionChromeState = {
  primaryCollection: null,
  secondaryCollections: [],
  collectionPinned: false,
  collectionUserOverride: false,
  collectionLastAutoUpdatedAtIso: null,
};

describe('applyAutoCollectionAfterEdit allowPrimaryUpdate gate', () => {
  it('skips first primary assignment when allowPrimaryUpdate is false', () => {
    const body = '<p>' + 'word '.repeat(30) + 'Romans</p>';
    const withGate = applyAutoCollectionAfterEdit(emptyChrome, 'Romans study', body, new Date(), {
      allowPrimaryUpdate: false,
    });
    const withoutGate = applyAutoCollectionAfterEdit(emptyChrome, 'Romans study', body, new Date(), {
      allowPrimaryUpdate: true,
    });

    expect(withGate.primaryCollection).toBeNull();
    expect(withoutGate.primaryCollection).not.toBeNull();
  });
});
