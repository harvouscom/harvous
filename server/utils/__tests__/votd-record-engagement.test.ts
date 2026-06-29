import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const mockAwardVotdEngagementXP = vi.fn();
const mockFirst = vi.fn();
const mockLimit = vi.fn();
const mockOrderBy = vi.fn();
const mockWhere = vi.fn();
const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockOnConflictDoUpdate = vi.fn();

vi.mock('../xp-system', () => ({
  awardVotdEngagementXP: (...args: unknown[]) => mockAwardVotdEngagementXP(...args),
}));

vi.mock('../../db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../db')>();
  return {
    ...actual,
    db: {
      ...actual.db,
      select: (...args: unknown[]) => mockSelect(...args),
      insert: (...args: unknown[]) => mockInsert(...args),
    },
    first: (...args: unknown[]) => mockFirst(...args),
  };
});

vi.mock('../../db/dates', () => ({
  now: () => new Date('2026-06-29T12:00:00.000Z'),
}));

import {
  resolveVotdFeaturedItemIdForLocalDate,
  recordVotdEngagement,
} from '../votd-record-engagement';

function setupSelectResults(...batches: unknown[][]) {
  let callIndex = 0;
  mockSelect.mockImplementation(() => {
    const batch = batches[callIndex] ?? [];
    callIndex += 1;
    mockLimit.mockResolvedValueOnce(batch);
    mockOrderBy.mockReturnValueOnce({ limit: mockLimit });
    mockWhere.mockReturnValueOnce({ limit: mockLimit, orderBy: mockOrderBy });
    mockFrom.mockReturnValueOnce({ where: mockWhere });
    return { from: mockFrom };
  });
}

describe('resolveVotdFeaturedItemIdForLocalDate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFirst.mockImplementation((rows: unknown) => (Array.isArray(rows) ? rows[0] : undefined));
  });

  it('returns exact publish match when present', async () => {
    setupSelectResults([{ featuredItemId: 'votd_fi_exact' }]);

    const id = await resolveVotdFeaturedItemIdForLocalDate('2026-06-29');
    expect(id).toBe('votd_fi_exact');
    expect(mockOrderBy).not.toHaveBeenCalled();
  });

  it('falls back to latest publish on or before local date', async () => {
    setupSelectResults([], [{ featuredItemId: 'votd_fi_fallback' }]);

    const id = await resolveVotdFeaturedItemIdForLocalDate('2026-06-29');
    expect(id).toBe('votd_fi_fallback');
    expect(mockOrderBy).toHaveBeenCalled();
  });

  it('returns null when no publish history exists', async () => {
    setupSelectResults([], []);

    const id = await resolveVotdFeaturedItemIdForLocalDate('2026-06-29');
    expect(id).toBeNull();
  });
});

describe('recordVotdEngagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFirst.mockImplementation((rows: unknown) => (Array.isArray(rows) ? rows[0] : undefined));
    mockOnConflictDoUpdate.mockResolvedValue(undefined);
    mockValues.mockReturnValue({ onConflictDoUpdate: mockOnConflictDoUpdate });
    mockInsert.mockReturnValue({ values: mockValues });
  });

  function mockFeaturedItemLookup(featuredItemId: string) {
    setupSelectResults([{ featuredItemId }], [{ contentType: 'votd' }]);
  }

  it('dismiss marks featured item completed without awarding XP', async () => {
    mockFeaturedItemLookup('votd_fi_1');

    const result = await recordVotdEngagement('user_a', 'dismiss', '2026-06-29');

    expect(result).toEqual({ ok: true, featuredItemId: 'votd_fi_1' });
    expect(mockAwardVotdEngagementXP).not.toHaveBeenCalled();
    expect(mockInsert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_a',
        featuredItemId: 'votd_fi_1',
        status: 'completed',
      }),
    );
  });

  it('add_note awards engagement XP and marks completed', async () => {
    mockFeaturedItemLookup('votd_fi_2');

    const result = await recordVotdEngagement('user_b', 'add_note', '2026-06-29');

    expect(result).toEqual({ ok: true, featuredItemId: 'votd_fi_2' });
    expect(mockAwardVotdEngagementXP).toHaveBeenCalledWith('user_b', 'votd_fi_2', 'create_note');
    expect(mockInsert).toHaveBeenCalled();
  });

  it('returns not_found when no publish exists for the day', async () => {
    setupSelectResults([], []);

    const result = await recordVotdEngagement('user_c', 'dismiss', '2026-06-29');

    expect(result).toEqual({ ok: false, reason: 'not_found' });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('double dismiss is idempotent at the upsert layer', async () => {
    setupSelectResults(
      [{ featuredItemId: 'votd_fi_3' }],
      [{ contentType: 'votd' }],
      [{ featuredItemId: 'votd_fi_3' }],
      [{ contentType: 'votd' }],
    );

    await recordVotdEngagement('user_d', 'dismiss', '2026-06-29');
    await recordVotdEngagement('user_d', 'dismiss', '2026-06-29');

    expect(mockOnConflictDoUpdate).toHaveBeenCalledTimes(2);
    expect(mockAwardVotdEngagementXP).not.toHaveBeenCalled();
  });

  it('add_note delegates XP dedup to awardVotdEngagementXP', async () => {
    setupSelectResults(
      [{ featuredItemId: 'votd_fi_4' }],
      [{ contentType: 'votd' }],
      [{ featuredItemId: 'votd_fi_4' }],
      [{ contentType: 'votd' }],
    );

    await recordVotdEngagement('user_e', 'add_note', '2026-06-29');
    await recordVotdEngagement('user_e', 'add_note', '2026-06-29');

    expect(mockAwardVotdEngagementXP).toHaveBeenCalledTimes(2);
  });
});

describe('admin-usage-stats passage wiring', () => {
  const usageSrc = readFileSync(join(__dirname, '../admin-usage-stats.ts'), 'utf8');

  it('delegates passage metrics to admin-votd-passage-metrics', () => {
    expect(usageSrc).toContain('fetchVotdPassageEngagementMetrics');
    expect(usageSrc).toContain('passageNotesAdded');
  });
});

describe('votd-record-engagement note hook', () => {
  const src = readFileSync(join(__dirname, '../votd-record-engagement.ts'), 'utf8');

  it('matches published passage references from note content on create', () => {
    expect(src).toContain('tryRecordVotdAddNoteFromCreatedNote');
    expect(src).toContain('data-scripture-reference');
  });
});
