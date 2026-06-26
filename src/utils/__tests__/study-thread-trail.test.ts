import { describe, it, expect } from 'vitest';
import {
  buildStudyThreadTrail,
  studyThreadTrailHasConnectionOrder,
} from '../study-thread-trail';

type Node = { id: string; updatedAt: string | null };

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
