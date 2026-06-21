import { describe, expect, it } from 'vitest';
import { sortFolderBucketsAlphabetically, sortStudyThreadClustersByTitle } from '../sorting';

describe('sortFolderBucketsAlphabetically', () => {
  it('sorts named folders A–Z case-insensitively', () => {
    const folders = [{ name: 'Romans' }, { name: 'Genesis' }, { name: 'acts' }];
    expect(sortFolderBucketsAlphabetically(folders).map((f) => f.name)).toEqual([
      'acts',
      'Genesis',
      'Romans',
    ]);
  });

  it('puts Unsorted (null name) last', () => {
    const folders = [{ name: null }, { name: 'Work' }, { name: 'Alpha' }];
    expect(sortFolderBucketsAlphabetically(folders).map((f) => f.name)).toEqual([
      'Alpha',
      'Work',
      null,
    ]);
  });
});

describe('sortStudyThreadClustersByTitle', () => {
  it('sorts by title A–Z', () => {
    const clusters = [
      { id: 'b', title: 'Romans study' },
      { id: 'a', title: 'Genesis notes' },
    ];
    expect(sortStudyThreadClustersByTitle(clusters).map((c) => c.title)).toEqual([
      'Genesis notes',
      'Romans study',
    ]);
  });

  it('falls back to suggestedTitle when title is empty', () => {
    const clusters = [
      { id: 'b', title: null, suggestedTitle: 'Zeta thread' },
      { id: 'a', title: 'Alpha thread', suggestedTitle: null },
    ];
    expect(sortStudyThreadClustersByTitle(clusters).map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('uses id as tie-breaker for identical titles', () => {
    const clusters = [
      { id: 'note_b', title: 'Same' },
      { id: 'note_a', title: 'Same' },
    ];
    expect(sortStudyThreadClustersByTitle(clusters).map((c) => c.id)).toEqual(['note_a', 'note_b']);
  });
});
