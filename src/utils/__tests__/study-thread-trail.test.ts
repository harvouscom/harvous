import { describe, it, expect } from 'vitest';
import {
  buildStudyThreadTrail,
  studyThreadTrailHasConnectionOrder,
  sortStudyThreadMembersByJoinOrder,
  resolveStudyThreadMemberOrder,
  orderStudyThreadNodesByIds,
  appendStudyThreadMemberOrder,
  removeStudyThreadMemberFromOrder,
} from '../study-thread-trail';

type Node = { id: string; updatedAt: string | null; simpleNoteId?: number | null };

function node(id: string, updatedAt: string): Node {
  return { id, updatedAt };
}

function edge(fromId: string, toId: string, createdAt: string) {
  return { fromId, toId, createdAt };
}

describe('buildStudyThreadTrail', () => {
  it('orders a linear chain with focus in the middle', () => {
    const nodes = [node('a', '2026-01-01'), node('b', '2026-01-02'), node('c', '2026-01-03')];
    const edges = [edge('a', 'b', '2026-01-02'), edge('b', 'c', '2026-01-03')];

    const trail = buildStudyThreadTrail('b', nodes, edges);

    expect(trail.upstream.map((n) => n.id)).toEqual(['a']);
    expect(trail.focus?.id).toBe('b');
    expect(trail.downstream.map((n) => n.id)).toEqual(['c']);
    expect(trail.alsoConnected).toEqual([]);
  });

  it('lists star downstream branches by connection createdAt', () => {
    const nodes = [
      node('a', '2026-01-01'),
      node('b', '2026-01-04'),
      node('c', '2026-01-02'),
      node('d', '2026-01-03'),
    ];
    const edges = [
      edge('a', 'b', '2026-01-04'),
      edge('a', 'c', '2026-01-02'),
      edge('a', 'd', '2026-01-03'),
    ];

    const trail = buildStudyThreadTrail('a', nodes, edges);

    expect(trail.upstream).toEqual([]);
    expect(trail.focus?.id).toBe('a');
    expect(trail.downstream.map((n) => n.id)).toEqual(['c', 'd', 'b']);
    expect(trail.alsoConnected).toEqual([]);
  });

  it('deduplicates cycle nodes so focus upstream wins over downstream', () => {
    const nodes = [node('a', '2026-01-01'), node('b', '2026-01-02')];
    const edges = [edge('a', 'b', '2026-01-01'), edge('b', 'a', '2026-01-02')];

    const trail = buildStudyThreadTrail('a', nodes, edges);

    expect(trail.upstream.map((n) => n.id)).toEqual(['b']);
    expect(trail.focus?.id).toBe('a');
    expect(trail.downstream).toEqual([]);
    expect(trail.alsoConnected).toEqual([]);
  });

  it('returns graceful empty focus when focus id is missing', () => {
    const nodes = [node('a', '2026-01-01')];
    const trail = buildStudyThreadTrail('missing', nodes, []);

    expect(trail.focus).toBeNull();
    expect(trail.upstream).toEqual([]);
    expect(trail.downstream).toEqual([]);
    expect(trail.alsoConnected.map((n) => n.id)).toEqual(['a']);
  });
});

describe('studyThreadTrailHasConnectionOrder', () => {
  it('is false for focus-only threads', () => {
    expect(
      studyThreadTrailHasConnectionOrder({
        upstream: [],
        focus: node('a', '2026-01-01'),
        downstream: [],
        alsoConnected: [],
      }),
    ).toBe(false);
  });

  it('is true when upstream or downstream exists', () => {
    expect(
      studyThreadTrailHasConnectionOrder({
        upstream: [node('a', '2026-01-01')],
        focus: node('b', '2026-01-02'),
        downstream: [],
        alsoConnected: [],
      }),
    ).toBe(true);
  });
});

describe('sortStudyThreadMembersByJoinOrder', () => {
  it('places rep note first and orders others by connection createdAt', () => {
    const nodes = [
      node('hub', '2026-01-04'),
      node('b', '2026-01-01'),
      node('c', '2026-01-02'),
      node('d', '2026-01-03'),
    ];
    const edges = [
      edge('hub', 'b', '2026-01-02'),
      edge('hub', 'c', '2026-01-03'),
      edge('hub', 'd', '2026-01-04'),
    ];

    expect(sortStudyThreadMembersByJoinOrder(nodes, edges, 'hub').map((n) => n.id)).toEqual([
      'hub',
      'b',
      'c',
      'd',
    ]);
  });

  it('does not reorder by updatedAt when pin would have floated a note', () => {
    const nodes = [
      { ...node('hub', '2026-01-01'), simpleNoteId: 1 },
      { ...node('old', '2026-01-05'), simpleNoteId: 2, isPinned: true } as Node & { isPinned?: boolean },
      { ...node('new', '2026-01-02'), simpleNoteId: 3 },
    ];
    const edges = [edge('hub', 'old', '2026-01-02'), edge('hub', 'new', '2026-01-04')];

    expect(sortStudyThreadMembersByJoinOrder(nodes, edges, 'hub').map((n) => n.id)).toEqual([
      'hub',
      'old',
      'new',
    ]);
  });
});

describe('resolveStudyThreadMemberOrder', () => {
  it('uses manual order and appends new members by join order', () => {
    const nodes = [node('hub', '2026-01-01'), node('b', '2026-01-02'), node('c', '2026-01-03')];
    const edges = [edge('hub', 'b', '2026-01-02'), edge('hub', 'c', '2026-01-03')];

    expect(
      resolveStudyThreadMemberOrder(nodes, edges, 'hub', ['c', 'hub', 'b']).map((n) => n.id),
    ).toEqual(['c', 'hub', 'b']);
  });

  it('falls back to join order when manual order is absent', () => {
    const nodes = [node('hub', '2026-01-01'), node('b', '2026-01-02')];
    const edges = [edge('hub', 'b', '2026-01-02')];

    expect(resolveStudyThreadMemberOrder(nodes, edges, 'hub', null).map((n) => n.id)).toEqual([
      'hub',
      'b',
    ]);
  });
});

describe('orderStudyThreadNodesByIds', () => {
  it('reorders nodes to match live id list', () => {
    const nodes = [node('hub', '2026-01-01'), node('b', '2026-01-02'), node('c', '2026-01-03')];
    expect(orderStudyThreadNodesByIds(nodes, ['c', 'hub', 'b']).map((n) => n.id)).toEqual([
      'c',
      'hub',
      'b',
    ]);
  });
});

describe('appendStudyThreadMemberOrder', () => {
  it('returns null when no manual order exists', () => {
    expect(appendStudyThreadMemberOrder(null, ['b'], new Set(['hub', 'b']))).toBeNull();
  });

  it('appends new ids to manual order', () => {
    expect(appendStudyThreadMemberOrder(['hub', 'b'], ['c'], new Set(['hub', 'b', 'c']))).toEqual([
      'hub',
      'b',
      'c',
    ]);
  });
});

describe('removeStudyThreadMemberFromOrder', () => {
  it('drops removed id from manual order', () => {
    expect(removeStudyThreadMemberFromOrder(['hub', 'b', 'c'], 'b')).toEqual(['hub', 'c']);
  });
});
