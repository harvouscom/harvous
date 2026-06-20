import { describe, expect, it } from 'vitest';
import {
  applyFolderPinOrdering,
  applyThreadClusterPinOrdering,
  folderRowId,
  PROTO_UNSORTED_FOLDER_ROW_ID,
} from '../../../spa/src/pages/prototype/proto-pinned-stores';

describe('folderRowId', () => {
  it('uses folder name for named buckets', () => {
    expect(folderRowId('Romans')).toBe('Romans');
  });

  it('uses ungrouped id for unsorted', () => {
    expect(folderRowId(null)).toBe(PROTO_UNSORTED_FOLDER_ROW_ID);
  });
});

describe('applyFolderPinOrdering', () => {
  const folders = [
    { name: 'Genesis', count: 2 },
    { name: 'Romans', count: 5 },
    { name: null, count: 1 },
  ];

  it('returns folders unchanged when no pins', () => {
    expect(applyFolderPinOrdering(folders, [])).toEqual(folders);
  });

  it('puts pinned folders first in pin order', () => {
    expect(applyFolderPinOrdering(folders, ['Romans', 'Genesis'])).toEqual([
      { name: 'Romans', count: 5 },
      { name: 'Genesis', count: 2 },
      { name: null, count: 1 },
    ]);
  });
});

describe('applyThreadClusterPinOrdering', () => {
  const clusters = [
    { id: 'note_a', noteCount: 2 },
    { id: 'note_b', noteCount: 5 },
  ];

  it('puts pinned clusters first in pin order', () => {
    expect(applyThreadClusterPinOrdering(clusters, ['note_b', 'note_a'])).toEqual([
      { id: 'note_b', noteCount: 5 },
      { id: 'note_a', noteCount: 2 },
    ]);
  });
});
