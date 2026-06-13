import { describe, expect, it } from 'vitest';
import { MY_PILE_THREAD_TITLE } from '@/utils/my-pile-thread';
import { countNotesInFolderBucket } from '../note-folder-display';

describe('countNotesInFolderBucket', () => {
  it('counts notes with a matching primary folder', () => {
    const notes = [
      { primaryCollection: 'Work', secondaryCollections: [] },
      { primaryCollection: 'Work', secondaryCollections: [] },
      { primaryCollection: 'Personal', secondaryCollections: [] },
    ];
    expect(countNotesInFolderBucket(notes, 'Work')).toBe(2);
    expect(countNotesInFolderBucket(notes, 'Personal')).toBe(1);
    expect(countNotesInFolderBucket(notes, 'Missing')).toBe(0);
  });

  it('counts secondary-only folder membership', () => {
    const notes = [
      { primaryCollection: 'Work', secondaryCollections: ['Archive'] },
      { primaryCollection: null, secondaryCollections: ['Archive'] },
    ];
    expect(countNotesInFolderBucket(notes, 'Archive')).toBe(2);
  });

  it('counts unsorted notes for null bucket key', () => {
    const notes = [
      { primaryCollection: null, secondaryCollections: [] },
      { primaryCollection: 'Work', secondaryCollections: [] },
    ];
    expect(countNotesInFolderBucket(notes, null)).toBe(1);
  });

  it('excludes My Pile labels from folder buckets', () => {
    const notes = [{ primaryCollection: MY_PILE_THREAD_TITLE, secondaryCollections: [] }];
    expect(countNotesInFolderBucket(notes, MY_PILE_THREAD_TITLE)).toBe(0);
    expect(countNotesInFolderBucket(notes, null)).toBe(1);
  });
});
