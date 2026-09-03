import { describe, it, expect } from 'vitest';
import { interleaveSession, type SessionOrderInput } from '../review-session-order';

const NOW = new Date('2026-09-03T12:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

function item(id: string, kind: string, groupKey: string, overdue: number, reviewCount = 1): SessionOrderInput {
  return { id, kind, groupKey, dueAt: daysAgo(overdue), reviewCount };
}

const ids = (items: SessionOrderInput[]) => items.map((i) => i.id);

describe('interleaveSession', () => {
  it('keeps the most overdue first, by whole days rather than the clock', () => {
    const early = { ...item('a', 'verse', 'john 15:5', 0), dueAt: new Date(NOW.getTime() - 3 * 60 * 60 * 1000) };
    const late = { ...item('b', 'verse', 'romans 8:15', 0), dueAt: new Date(NOW.getTime() - 60 * 1000) };
    const older = item('c', 'verse', 'psalm 23:1', 2);
    expect(ids(interleaveSession([late, early, older], NOW))[0]).toBe('c');
    // Both due today: the clock does not decide, the input order does.
    expect(ids(interleaveSession([late, early, older], NOW)).slice(1)).toEqual(['b', 'a']);
  });

  it('never asks two questions about the same passage back to back', () => {
    const items = [
      item('a', 'verse', 'john 15:5', 1),
      item('b', 'verse', 'john 15:5', 1),
      item('c', 'verse', 'romans 8:15', 1),
      item('d', 'note', 'note-1', 1),
    ];
    const ordered = interleaveSession(items, NOW);
    for (let i = 1; i < ordered.length; i += 1) {
      expect(ordered[i].groupKey).not.toBe(ordered[i - 1].groupKey);
    }
  });

  it('alternates kinds when both are present', () => {
    const items = [
      item('v1', 'verse', 'a', 1),
      item('v2', 'verse', 'b', 1),
      item('n1', 'note', 'n-1', 1),
      item('n2', 'note', 'n-2', 1),
    ];
    expect(ordered_kinds(interleaveSession(items, NOW))).toEqual(['verse', 'note', 'verse', 'note']);
  });

  it('puts reviews before items on their first asking, whatever their dates say', () => {
    const items = [
      item('new-old', 'verse', 'a', 5, 0),
      item('review', 'verse', 'b', 0, 3),
    ];
    expect(ids(interleaveSession(items, NOW))).toEqual(['review', 'new-old']);
  });

  it('drops nothing when the constraints cannot all be met', () => {
    const items = [item('a', 'verse', 'x', 1), item('b', 'verse', 'x', 1), item('c', 'verse', 'x', 1)];
    expect(ids(interleaveSession(items, NOW)).sort()).toEqual(['a', 'b', 'c']);
  });

  it('is a function of its input alone', () => {
    const items = [
      item('a', 'verse', 'john 15:5', 1),
      item('b', 'note', 'n-1', 2),
      item('c', 'verse', 'romans 8:15', 1, 0),
      item('d', 'note', 'n-2', 0),
    ];
    expect(ids(interleaveSession(items, NOW))).toEqual(ids(interleaveSession([...items], NOW)));
  });

  it('treats a missing subject as unrelated to anything', () => {
    const items = [
      { ...item('a', 'note', '', 1), groupKey: null },
      { ...item('b', 'note', '', 1), groupKey: null },
    ];
    expect(ids(interleaveSession(items, NOW))).toEqual(['a', 'b']);
  });
});

function ordered_kinds(items: SessionOrderInput[]): string[] {
  return items.map((i) => i.kind);
}
