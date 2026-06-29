import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const mockExecute = vi.fn();

vi.mock('../../db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../db')>();
  return {
    ...actual,
    db: {
      ...actual.db,
      execute: (...args: unknown[]) => mockExecute(...args),
    },
  };
});

import { fetchVotdPassageEngagementMetrics } from '../admin-votd-passage-metrics';

describe('fetchVotdPassageEngagementMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps query row counts into metrics', async () => {
    mockExecute.mockResolvedValueOnce([
      {
        users_who_added_passage: 4,
        passage_notes_added: 7,
        dismiss_close_events: 12,
      },
    ]);

    const since = new Date('2026-05-30T00:00:00.000Z');
    const metrics = await fetchVotdPassageEngagementMetrics(since);

    expect(metrics).toEqual({
      usersWhoAddedPassage: 4,
      passageNotesAdded: 7,
      dismissCloseEvents: 12,
    });
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it('defaults missing row values to zero', async () => {
    mockExecute.mockResolvedValueOnce([{}]);

    const metrics = await fetchVotdPassageEngagementMetrics(new Date('2026-05-30T00:00:00.000Z'));

    expect(metrics).toEqual({
      usersWhoAddedPassage: 0,
      passageNotesAdded: 0,
      dismissCloseEvents: 0,
    });
  });
});

describe('admin-votd-passage-metrics SQL', () => {
  const src = readFileSync(join(__dirname, '../admin-votd-passage-metrics.ts'), 'utf8');

  it('detects passage notes via title, pill HTML, and ScriptureMetadata', () => {
    expect(src).toContain('note_hits');
    expect(src).toContain('data-scripture-reference="');
    expect(src).toContain('"ScriptureMetadata" sm');
  });

  it('unions XP users with note-based users for distinct user count', () => {
    expect(src).toContain('UNION');
    expect(src).toContain('votd_engaged');
    expect(src).toContain('users_who_added_passage');
  });

  it('counts passage notes added from note_hits', () => {
    expect(src).toContain('passage_notes_added');
    expect(src).toMatch(/COUNT\(\*\).*note_hits/s);
  });
});

describe('admin-usage-stats passage wiring', () => {
  const src = readFileSync(join(__dirname, '../admin-usage-stats.ts'), 'utf8');

  it('uses fetchVotdPassageEngagementMetrics for passage section', () => {
    expect(src).toContain('fetchVotdPassageEngagementMetrics');
    expect(src).toContain('passageNotesAdded');
  });
});
