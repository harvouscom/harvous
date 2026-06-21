import { describe, expect, it } from 'vitest';
import {
  filterThreadClusterEdgesForRemoval,
  normalizeThreadClusterMemberIds,
  threadClusterDrillSlug,
} from '../thread-cluster-bulk-actions';

describe('normalizeThreadClusterMemberIds', () => {
  it('dedupes and trims string ids', () => {
    expect(normalizeThreadClusterMemberIds([' note_a ', 'note_b', 'note_a', 1, ''])).toEqual([
      'note_a',
      'note_b',
    ]);
  });

  it('returns empty for non-array input', () => {
    expect(normalizeThreadClusterMemberIds(null)).toEqual([]);
  });
});

describe('threadClusterDrillSlug', () => {
  it('strips note_ prefix', () => {
    expect(threadClusterDrillSlug('note_123')).toBe('123');
  });

  it('returns id unchanged when no prefix', () => {
    expect(threadClusterDrillSlug('abc')).toBe('abc');
  });
});

describe('filterThreadClusterEdgesForRemoval', () => {
  const edges = [
    { fromNoteId: 'a', toNoteId: 'b' },
    { fromNoteId: 'b', toNoteId: 'c' },
    { fromNoteId: 'a', toNoteId: 'c' },
    { fromNoteId: 'x', toNoteId: 'y' },
  ];
  const members = ['a', 'b', 'c'];

  it('returns all cluster-internal edges when noteId is omitted', () => {
    expect(filterThreadClusterEdgesForRemoval(edges, members)).toEqual([
      { fromNoteId: 'a', toNoteId: 'b' },
      { fromNoteId: 'b', toNoteId: 'c' },
      { fromNoteId: 'a', toNoteId: 'c' },
    ]);
  });

  it('returns only edges touching noteId when provided', () => {
    expect(filterThreadClusterEdgesForRemoval(edges, members, 'b')).toEqual([
      { fromNoteId: 'a', toNoteId: 'b' },
      { fromNoteId: 'b', toNoteId: 'c' },
    ]);
  });

  it('returns empty when noteId is not in cluster edges', () => {
    expect(filterThreadClusterEdgesForRemoval(edges, members, 'z')).toEqual([]);
  });
});
