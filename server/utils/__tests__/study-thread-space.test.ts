import { describe, expect, it } from 'vitest';
import {
  shouldFallbackToUnscopedStudyThreadGraph,
} from '../study-thread-space';
import {
  studyThreadGraphHasEdgeOnNote,
  type StudyThreadGraphEdge,
} from '../study-thread-graph';

describe('studyThreadGraphHasEdgeOnNote', () => {
  const edges: StudyThreadGraphEdge[] = [
    { fromId: 'note_a', toId: 'note_b', createdAt: '2026-01-01T00:00:00.000Z' },
  ];

  it('returns true when the note is an endpoint of an edge', () => {
    expect(studyThreadGraphHasEdgeOnNote('note_a', edges)).toBe(true);
    expect(studyThreadGraphHasEdgeOnNote('note_b', edges)).toBe(true);
  });

  it('returns false when the note is not on any edge', () => {
    expect(studyThreadGraphHasEdgeOnNote('note_c', edges)).toBe(false);
    expect(studyThreadGraphHasEdgeOnNote('note_a', [])).toBe(false);
  });
});

describe('shouldFallbackToUnscopedStudyThreadGraph', () => {
  const focus = 'note_focus';
  const graphWithEdge = {
    nodeIds: [focus, 'note_other'],
    edges: [{ fromId: focus, toId: 'note_other', createdAt: '2026-01-01T00:00:00.000Z' }],
    degreeMap: new Map([
      [focus, 1],
      ['note_other', 1],
    ]),
  };
  const graphWithoutEdge = {
    nodeIds: [focus],
    edges: [] as StudyThreadGraphEdge[],
    degreeMap: new Map<string, number>(),
  };

  it('falls back when direct connections exist but scoped graph has no edge on focus', () => {
    expect(shouldFallbackToUnscopedStudyThreadGraph(focus, graphWithoutEdge, 1)).toBe(true);
  });

  it('does not fall back when there are no direct connections', () => {
    expect(shouldFallbackToUnscopedStudyThreadGraph(focus, graphWithoutEdge, 0)).toBe(false);
  });

  it('does not fall back when scoped graph already includes an edge on focus', () => {
    expect(shouldFallbackToUnscopedStudyThreadGraph(focus, graphWithEdge, 1)).toBe(false);
  });

  it('falls back when direct connections exist but edges belong to other nodes only', () => {
    const unrelatedGraph = {
      nodeIds: [focus, 'note_x', 'note_y'],
      edges: [{ fromId: 'note_x', toId: 'note_y', createdAt: '2026-01-01T00:00:00.000Z' }],
      degreeMap: new Map([
        ['note_x', 1],
        ['note_y', 1],
      ]),
    };
    expect(shouldFallbackToUnscopedStudyThreadGraph(focus, unrelatedGraph, 1)).toBe(true);
  });
});
