import { describe, expect, it } from 'vitest';
import {
  computeNoteFolderAdditionPatch,
  computeNoteFolderRemovalPatch,
  noteInNamedFolderBucket,
} from '../folder-bulk-actions';

describe('noteInNamedFolderBucket', () => {
  it('matches primary folder label', () => {
    expect(noteInNamedFolderBucket({ primaryCollection: 'Romans' }, 'Romans')).toBe(true);
  });

  it('matches secondary folder label', () => {
    expect(
      noteInNamedFolderBucket({ primaryCollection: 'Paul', secondaryCollections: ['Romans'] }, 'Romans'),
    ).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(noteInNamedFolderBucket({ primaryCollection: 'romans' }, 'Romans')).toBe(true);
  });

  it('returns false when not in bucket', () => {
    expect(noteInNamedFolderBucket({ primaryCollection: 'Genesis' }, 'Romans')).toBe(false);
  });
});

describe('computeNoteFolderRemovalPatch', () => {
  it('clears matching primary only', () => {
    const patch = computeNoteFolderRemovalPatch({ primaryCollection: 'Romans' }, 'Romans');
    expect(patch).toEqual({
      primaryCollection: null,
      secondaryCollections: [],
      collectionPinned: false,
      collectionUserOverride: false,
      collectionLastAutoUpdatedAt: null,
    });
  });

  it('removes matching secondary and keeps primary', () => {
    const patch = computeNoteFolderRemovalPatch(
      {
        primaryCollection: 'Paul',
        secondaryCollections: ['Romans', 'Epistles'],
        collectionPinned: true,
        collectionUserOverride: true,
      },
      'Romans',
    );
    expect(patch).toEqual({
      primaryCollection: 'Paul',
      secondaryCollections: ['Epistles'],
      collectionPinned: true,
      collectionUserOverride: true,
    });
  });

  it('clears both primary and secondary when both match same bucket name', () => {
    const patch = computeNoteFolderRemovalPatch(
      { primaryCollection: 'Romans', secondaryCollections: ['Romans'] },
      'Romans',
    );
    expect(patch?.primaryCollection).toBe(null);
    expect(patch?.secondaryCollections).toEqual([]);
    expect(patch?.collectionPinned).toBe(false);
  });

  it('returns null when note is not in bucket', () => {
    expect(computeNoteFolderRemovalPatch({ primaryCollection: 'Genesis' }, 'Romans')).toBe(null);
  });

  it('matches bucket name case-insensitively', () => {
    const patch = computeNoteFolderRemovalPatch({ primaryCollection: 'ROMANS' }, 'romans');
    expect(patch?.primaryCollection).toBe(null);
  });
});

describe('computeNoteFolderAdditionPatch', () => {
  it('sets primary when note has no folder labels', () => {
    const patch = computeNoteFolderAdditionPatch({ primaryCollection: null, secondaryCollections: [] }, 'Romans');
    expect(patch).toEqual({
      primaryCollection: 'Romans',
      secondaryCollections: [],
      collectionUserOverride: true,
    });
  });

  it('appends secondary when note already has a primary', () => {
    const patch = computeNoteFolderAdditionPatch(
      { primaryCollection: 'Paul', secondaryCollections: ['Epistles'] },
      'Romans',
    );
    expect(patch).toEqual({
      primaryCollection: 'Paul',
      secondaryCollections: ['Epistles', 'Romans'],
      collectionUserOverride: true,
    });
  });

  it('returns null when note is already in bucket', () => {
    expect(computeNoteFolderAdditionPatch({ primaryCollection: 'Romans' }, 'Romans')).toBe(null);
  });

  it('returns null for empty folder name', () => {
    expect(computeNoteFolderAdditionPatch({ primaryCollection: null }, '  ')).toBe(null);
  });

  it('does not duplicate secondary when case differs', () => {
    const patch = computeNoteFolderAdditionPatch(
      { primaryCollection: 'Paul', secondaryCollections: ['romans'] },
      'Romans',
    );
    expect(patch).toBe(null);
  });
});
