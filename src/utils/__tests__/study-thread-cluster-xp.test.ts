import { describe, expect, it } from 'vitest';
import {
  countStudyThreadClustersFromGraph,
  pickRepNoteIdFromGraph,
} from '../study-thread-cluster-count';
import { isStudyThreadCreatedXpRecord } from '../admin-pulse-xp-filter';

describe('countStudyThreadClustersFromGraph', () => {
  it('returns 0 with no edges or singletons', () => {
    expect(countStudyThreadClustersFromGraph([], [])).toBe(0);
  });

  it('counts one cluster when two untitled isolates connect', () => {
    const edges: StudyThreadClusterEdge[] = [{ fromNoteId: 'note_a', toNoteId: 'note_b' }];
    expect(countStudyThreadClustersFromGraph(edges, [])).toBe(1);
  });

  it('does not increase when connecting into an existing cluster', () => {
    const edges: StudyThreadClusterEdge[] = [
      { fromNoteId: 'note_a', toNoteId: 'note_b' },
      { fromNoteId: 'note_b', toNoteId: 'note_c' },
    ];
    expect(countStudyThreadClustersFromGraph(edges, [])).toBe(1);
  });

  it('counts titled singleton without edges', () => {
    expect(countStudyThreadClustersFromGraph([], ['note_solo'])).toBe(1);
  });

  it('merges two titled singletons into one cluster when connected', () => {
    const before = countStudyThreadClustersFromGraph([], ['note_a', 'note_b']);
    expect(before).toBe(2);
    const after = countStudyThreadClustersFromGraph(
      [{ fromNoteId: 'note_a', toNoteId: 'note_b' }],
      ['note_a', 'note_b'],
    );
    expect(after).toBe(1);
  });

  it('ignores titled singleton already in a connected component', () => {
    const edges: StudyThreadClusterEdge[] = [{ fromNoteId: 'note_a', toNoteId: 'note_b' }];
    expect(countStudyThreadClustersFromGraph(edges, ['note_a'])).toBe(1);
  });
});

describe('cluster birth increment scenarios', () => {
  function simulateConnect(
    edges: StudyThreadClusterEdge[],
    singletons: string[],
    fromNoteId: string,
    toNoteId: string,
  ) {
    const before = countStudyThreadClustersFromGraph(edges, singletons);
    const nextEdges = [...edges, { fromNoteId, toNoteId }];
    const after = countStudyThreadClustersFromGraph(nextEdges, singletons);
    return { before, after, shouldAward: after > before };
  }

  it('awards when connecting two untitled isolates', () => {
    expect(simulateConnect([], [], 'note_a', 'note_b')).toEqual({
      before: 0,
      after: 1,
      shouldAward: true,
    });
  });

  it('does not award when connecting into existing cluster', () => {
    const edges: StudyThreadClusterEdge[] = [{ fromNoteId: 'note_a', toNoteId: 'note_b' }];
    expect(simulateConnect(edges, [], 'note_b', 'note_c')).toEqual({
      before: 1,
      after: 1,
      shouldAward: false,
    });
  });

  it('awards when titling an untitled isolate', () => {
    const before = countStudyThreadClustersFromGraph([], []);
    const after = countStudyThreadClustersFromGraph([], ['note_solo']);
    expect(before).toBe(0);
    expect(after).toBe(1);
    expect(after > before).toBe(true);
  });

  it('does not award when merging two titled singletons', () => {
    const singletons = ['note_a', 'note_b'];
    const { shouldAward } = simulateConnect([], singletons, 'note_a', 'note_b');
    expect(shouldAward).toBe(false);
  });
});

describe('pickRepNoteIdFromGraph', () => {
  it('picks a member of the connected component', () => {
    const edges: StudyThreadClusterEdge[] = [{ fromNoteId: 'note_a', toNoteId: 'note_b' }];
    const rep = pickRepNoteIdFromGraph('note_b', edges);
    expect(rep === 'note_a' || rep === 'note_b').toBe(true);
  });

  it('returns seed when no edges', () => {
    expect(pickRepNoteIdFromGraph('note_solo', [])).toBe('note_solo');
  });
});

describe('isStudyThreadCreatedXpRecord', () => {
  it('includes non thread_created activities', () => {
    expect(
      isStudyThreadCreatedXpRecord({
        activityType: 'note_created',
        relatedId: 'note_1',
        metadata: null,
      }),
    ).toBe(true);
  });

  it('includes study-thread awards with note_ relatedId', () => {
    expect(
      isStudyThreadCreatedXpRecord({
        activityType: 'thread_created',
        relatedId: 'note_123',
        metadata: '{"kind":"study_thread"}',
      }),
    ).toBe(true);
  });

  it('includes study-thread awards via metadata kind', () => {
    expect(
      isStudyThreadCreatedXpRecord({
        activityType: 'thread_created',
        relatedId: null,
        metadata: '{"kind":"study_thread","contentLength":5}',
      }),
    ).toBe(true);
  });

  it('excludes legacy thread_ relatedId without study metadata', () => {
    expect(
      isStudyThreadCreatedXpRecord({
        activityType: 'thread_created',
        relatedId: 'thread_123',
        metadata: '{"contentLength":5}',
      }),
    ).toBe(false);
  });
});
