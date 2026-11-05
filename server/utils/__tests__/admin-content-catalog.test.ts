import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { countMap } from '../admin-content-catalog';
import { planDuplicateDeletions } from '../admin-cleanup-duplicates';

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

describe('curated spaces carry no dead join link', () => {
  // Since the July 2026 move to SpaceInvites, invite-preview and redeem look tokens up in
  // SpaceInvites only, and curated spaces are v1 `type: 'personal'` rows with no invite.
  // A `/spaces/join/<Spaces.shareToken>` link from these files was a 404 for everyone.
  const files = [
    'server/utils/admin-content-catalog.ts',
    'server/routes/admin.ts',
    'server/routes/featured.ts',
    'src/components/react/AdminPublishPanel.tsx',
  ];
  it.each(files)('%s builds no /spaces/join/ link', (file) => {
    const text = readFileSync(resolve(process.cwd(), file), 'utf8');
    expect(text).not.toContain('/spaces/join/');
    expect(text).not.toContain('joinUrl');
  });
});
