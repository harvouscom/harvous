import { describe, expect, it } from 'vitest';
import { buildJoinUrl, countMap } from '../admin-content-catalog';
import { planDuplicateDeletions } from '../admin-cleanup-duplicates';

describe('buildJoinUrl', () => {
  it('builds join URL from origin and share token', () => {
    expect(buildJoinUrl('https://app.harvous.com', 'abc123')).toBe('https://app.harvous.com/spaces/join/abc123');
    expect(buildJoinUrl('https://app.harvous.com/', 'abc123')).toBe('https://app.harvous.com/spaces/join/abc123');
  });

  it('returns null when share token is missing', () => {
    expect(buildJoinUrl('https://app.harvous.com', null)).toBeNull();
    expect(buildJoinUrl('https://app.harvous.com', '')).toBeNull();
  });
});

describe('countMap', () => {
  it('maps key/cnt rows to a Map', () => {
    const map = countMap([
      { key: 'space_a', cnt: 3 },
      { key: 'space_b', cnt: 1 },
    ]);
    expect(map.get('space_a')).toBe(3);
    expect(map.get('space_b')).toBe(1);
    expect(map.get('space_c')).toBeUndefined();
  });
});

describe('planDuplicateDeletions', () => {
  it('keeps oldest entry and plans deletes for newer duplicates', () => {
    const entries = [
      { id: 'nt_2', noteId: 'note_1', threadId: 'thread_1', createdAt: '2026-06-02T00:00:00.000Z' },
      { id: 'nt_1', noteId: 'note_1', threadId: 'thread_1', createdAt: '2026-06-01T00:00:00.000Z' },
      { id: 'nt_3', noteId: 'note_1', threadId: 'thread_1', createdAt: '2026-06-03T00:00:00.000Z' },
    ];

    const { groups, report } = planDuplicateDeletions(entries, (e) => `${e.noteId}::${e.threadId}`);

    expect(groups).toBe(1);
    expect(report[0]?.kept.id).toBe('nt_1');
    expect(report[0]?.toDelete.map((e) => e.id).sort()).toEqual(['nt_2', 'nt_3']);
  });

  it('returns zero groups when no duplicates exist', () => {
    const entries = [
      { id: 'a', noteId: 'n1', threadId: 't1', createdAt: '2026-06-01T00:00:00.000Z' },
      { id: 'b', noteId: 'n2', threadId: 't1', createdAt: '2026-06-01T00:00:00.000Z' },
    ];

    const { groups, report } = planDuplicateDeletions(entries, (e) => `${e.noteId}::${e.threadId}`);
    expect(groups).toBe(0);
    expect(report).toEqual([]);
  });
});

describe('cleanup dryRun semantics', () => {
  it('dryRun preview deletes count equals planned toDelete length', () => {
    const entries = [
      { id: 'nt_1', noteId: 'note_1', threadId: 'thread_1', createdAt: '2026-06-01T00:00:00.000Z' },
      { id: 'nt_2', noteId: 'note_1', threadId: 'thread_1', createdAt: '2026-06-02T00:00:00.000Z' },
    ];
    const { report } = planDuplicateDeletions(entries, (e) => `${e.noteId}::${e.threadId}`);
    const wouldDelete = report.reduce((sum, { toDelete }) => sum + toDelete.length, 0);
    expect(wouldDelete).toBe(1);
  });
});
