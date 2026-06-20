import { describe, expect, it } from 'vitest';
import {
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
