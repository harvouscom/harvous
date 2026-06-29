import { describe, expect, it } from 'vitest';
import { pulseActiveThreadClustersForUser } from '../admin-pulse-threads-stats';

describe('pulseActiveThreadClustersForUser', () => {
  it('returns full cluster members touched by new links in the window', () => {
    const since = new Date('2026-06-01T00:00:00.000Z');
    const edges = [
      {
        fromNoteId: 'a',
        toNoteId: 'b',
        createdAt: new Date('2026-06-10T00:00:00.000Z'),
      },
      {
        fromNoteId: 'b',
        toNoteId: 'c',
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
      },
      {
        fromNoteId: 'a',
        toNoteId: 'd',
        createdAt: new Date('2026-06-12T00:00:00.000Z'),
      },
    ];
    expect(pulseActiveThreadClustersForUser(edges, since)).toEqual([new Set(['a', 'b', 'c', 'd'])]);
  });

  it('dedupes the same cluster when multiple new links land in one window', () => {
    const since = new Date('2026-06-01T00:00:00.000Z');
    const edges = [
      {
        fromNoteId: 'a',
        toNoteId: 'b',
        createdAt: new Date('2026-06-10T00:00:00.000Z'),
      },
      {
        fromNoteId: 'a',
        toNoteId: 'c',
        createdAt: new Date('2026-06-11T00:00:00.000Z'),
      },
    ];
    expect(pulseActiveThreadClustersForUser(edges, since)).toEqual([new Set(['a', 'b', 'c'])]);
  });
});
