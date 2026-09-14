import { describe, expect, it, vi } from 'vitest';

vi.mock('../../db', () => ({}));
vi.mock('../xp-system', () => ({}));
vi.mock('../process-scripture-references', () => ({}));
vi.mock('../highest-simple-note-id', () => ({}));
vi.mock('../ensure-personal-home-space', () => ({}));
vi.mock('../note-version-service', () => ({}));
vi.mock('../note-versioning', () => ({}));
vi.mock('../ensure-personal-library', () => ({}));

import { buildPackConnectionRows } from '../discover-install';

const base = { userId: 'user_1', spaceId: 'space_home', createdAt: new Date('2026-09-13T00:00:00.000Z') };

/** Same BFS shape as collectStudyThreadGraph, just over an in-memory edge list. */
function connectedComponents(rows: { fromNoteId: string; toNoteId: string }[]): Set<string>[] {
  const adjacency = new Map<string, Set<string>>();
  const touch = (a: string, b: string) => {
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    adjacency.get(a)!.add(b);
  };
  for (const { fromNoteId, toNoteId } of rows) {
    touch(fromNoteId, toNoteId);
    touch(toNoteId, fromNoteId);
  }
  const seen = new Set<string>();
  const components: Set<string>[] = [];
  for (const node of adjacency.keys()) {
    if (seen.has(node)) continue;
    const component = new Set<string>();
    const queue = [node];
    while (queue.length > 0) {
      const current = queue.pop()!;
      if (component.has(current)) continue;
      component.add(current);
      seen.add(current);
      for (const neighbor of adjacency.get(current) ?? []) queue.push(neighbor);
    }
    components.push(component);
  }
  return components;
}

describe('buildPackConnectionRows', () => {
  it('connects every note to the first, in the notes’ own space', () => {
    const rows = buildPackConnectionRows({ ...base, noteIds: ['note_a', 'note_b', 'note_c'] });
    expect(rows.map((r) => [r.fromNoteId, r.toNoteId])).toEqual([
      ['note_a', 'note_b'],
      ['note_a', 'note_c'],
    ]);
    for (const row of rows) {
      expect(row.userId).toBe('user_1');
      expect(row.spaceId).toBe('space_home');
    }
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
  });

  it('makes the whole pack one Thread', () => {
    const noteIds = ['note_a', 'note_b', 'note_c', 'note_d'];
    const rows = buildPackConnectionRows({ ...base, noteIds });
    expect(connectedComponents(rows)).toEqual([new Set(noteIds)]);
  });

  it('writes nothing for a single note, and never a self-edge or a repeated pair', () => {
    expect(buildPackConnectionRows({ ...base, noteIds: ['note_a'] })).toEqual([]);
    expect(buildPackConnectionRows({ ...base, noteIds: [] })).toEqual([]);
    const rows = buildPackConnectionRows({ ...base, noteIds: ['note_a', 'note_b', 'note_a', 'note_b'] });
    expect(rows.map((r) => [r.fromNoteId, r.toNoteId])).toEqual([['note_a', 'note_b']]);
  });
});
