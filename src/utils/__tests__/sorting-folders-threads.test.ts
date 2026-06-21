import { describe, expect, it } from 'vitest';
import {
  alphabeticalSortKey,
  sortFolderBucketsAlphabetically,
  sortStudyThreadClustersByTitle,
} from '../sorting';

describe('alphabeticalSortKey', () => {
  it('returns substring from first letter when label starts with a digit', () => {
    expect(alphabeticalSortKey('1 John')).toBe('John');
    expect(alphabeticalSortKey('2 Corinthians')).toBe('Corinthians');
  });

  it('returns full trimmed label when no letters exist', () => {
    expect(alphabeticalSortKey('123')).toBe('123');
  });
});

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

  it('sorts number-prefixed folders by first letter', () => {
    const folders = [{ name: 'Romans' }, { name: '1 John' }, { name: '2 Corinthians' }];
    expect(sortFolderBucketsAlphabetically(folders).map((f) => f.name)).toEqual([
      '2 Corinthians',
      '1 John',
      'Romans',
    ]);
  });

  it('places number-prefixed folder adjacent to same-letter folder with full-label tie-break', () => {
    const folders = [{ name: 'John' }, { name: '1 John' }, { name: 'Genesis' }];
    expect(sortFolderBucketsAlphabetically(folders).map((f) => f.name)).toEqual([
      'Genesis',
      '1 John',
      'John',
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

  it('sorts number-prefixed thread titles by first letter', () => {
    const clusters = [
      { id: 'c', title: 'Romans study' },
      { id: 'b', title: '1 John notes' },
      { id: 'a', title: '2 Corinthians study' },
    ];
    expect(sortStudyThreadClustersByTitle(clusters).map((c) => c.title)).toEqual([
      '2 Corinthians study',
      '1 John notes',
      'Romans study',
    ]);
  });
});
