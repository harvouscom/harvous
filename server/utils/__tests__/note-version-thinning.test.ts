import { describe, expect, it } from 'vitest';
import { FREE_HISTORY_WINDOW_DAYS } from '@/lib/billing-plans';
import {
  NOTE_VERSION_RETENTION_LATEST_COUNT,
  NOTE_VERSION_RETENTION_MAX_AGE_MS,
  isProtectedNoteVersion,
  isThinnableNoteVersionSource,
  planNoteVersionThinning,
  startsNewEditingSession,
  type ThinningVersionRow,
} from '../note-version-thinning';

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const NOW = new Date('2026-09-13T12:00:00Z');
const OLD = NOW.getTime() - 200 * DAY;

function row(
  version: number,
  minutesAfterOld: number,
  overrides: Partial<ThinningVersionRow> = {},
): ThinningVersionRow {
  return {
    id: `v${version}`,
    version,
    source: 'save',
    createdAt: new Date(OLD + minutesAfterOld * MIN),
    editorId: 'user_a',
    ...overrides,
  };
}

const base = {
  now: NOW,
  currentVersionId: 'v_current',
  oldestProtectedVersion: 10_000,
  referencedVersionIds: new Set<string>(),
};

describe('planNoteVersionThinning', () => {
  it('keeps the last checkpoint of each old editing session', () => {
    const rows = [row(2, 0), row(3, 1), row(4, 2), row(5, 60), row(6, 61)];
    expect(planNoteVersionThinning({ ...base, rows })).toEqual(['v2', 'v3', 'v5']);
  });

  it('never thins a checkpoint that was replaced inside the free window', () => {
    const cutoff = NOW.getTime() - NOTE_VERSION_RETENTION_MAX_AGE_MS;
    const rows = [
      { ...row(2, 0), createdAt: new Date(cutoff - MIN) },
      { ...row(3, 0), createdAt: new Date(cutoff + MIN) },
    ];
    expect(planNoteVersionThinning({ ...base, rows })).toEqual([]);
  });

  it('keeps the newest 100 whatever their age', () => {
    const rows = [row(2, 0), row(3, 1), row(4, 2)];
    expect(planNoteVersionThinning({ ...base, rows, oldestProtectedVersion: 3 })).toEqual(['v2']);
  });

  it('protects the first, current, and thread-referenced checkpoints', () => {
    const rows = [row(1, 0), row(2, 1), row(3, 2), row(4, 3), row(5, 4)];
    expect(
      planNoteVersionThinning({
        ...base,
        rows,
        currentVersionId: 'v3',
        referencedVersionIds: new Set(['v4']),
      }),
    ).toEqual(['v2']);
  });

  it('ends a session at any non-routine checkpoint, so the save before a restore survives', () => {
    const rows = [
      row(2, 0),
      row(3, 1, { source: 'restore' }),
      row(4, 2, { source: 'sync-update' }),
      row(5, 3),
    ];
    expect(planNoteVersionThinning({ ...base, rows })).toEqual(['v4']);
  });

  it('starts a new session when someone else edits', () => {
    const rows = [row(2, 0), row(3, 1, { editorId: 'user_b' }), row(4, 2, { editorId: 'user_b' })];
    expect(planNoteVersionThinning({ ...base, rows })).toEqual(['v3']);
  });

  it('keeps a checkpoint whose successor was not fetched', () => {
    expect(planNoteVersionThinning({ ...base, rows: [row(2, 0)] })).toEqual([]);
  });

  it('stops at the limit, oldest first', () => {
    const rows = Array.from({ length: 10 }, (_, index) => row(index + 2, index));
    expect(planNoteVersionThinning({ ...base, rows, limit: 2 })).toEqual(['v2', 'v3']);
  });

  it('only ever deletes what the previous retention rule would also have deleted', () => {
    let thinnedAnything = false;
    for (let seed = 1; seed <= 25; seed += 1) {
      const history = generateHistory(seed);
      const previouslyPrunable = previousRulePrunableIds(history);
      const planned = planNoteVersionThinning({
        rows: history.rows,
        now: NOW,
        currentVersionId: history.currentVersionId,
        oldestProtectedVersion: history.oldestProtectedVersion,
        referencedVersionIds: history.referencedVersionIds,
      });
      for (const id of planned) expect(previouslyPrunable.has(id)).toBe(true);
      thinnedAnything ||= planned.length > 0;
    }
    expect(thinnedAnything).toBe(true);
  });
});

describe('startsNewEditingSession', () => {
  const at = (minutes: number) => new Date(OLD + minutes * MIN);
  const point = (minutes: number, source = 'save', editorId = 'user_a') => ({
    source,
    createdAt: at(minutes),
    editorId,
  });

  it('continues a session for the same editor within five minutes', () => {
    expect(startsNewEditingSession({ previous: point(0), next: point(4) })).toBe(false);
  });

  it('starts one after a five-minute pause, a different editor, or a non-routine checkpoint', () => {
    expect(startsNewEditingSession({ previous: point(0), next: point(5) })).toBe(true);
    expect(startsNewEditingSession({ previous: point(0), next: point(1, 'save', 'user_b') })).toBe(true);
    expect(startsNewEditingSession({ previous: point(0), next: point(1, 'restore') })).toBe(true);
    expect(startsNewEditingSession({ previous: point(0, 'migration-baseline'), next: point(1) })).toBe(true);
  });
});

describe('thinning guards', () => {
  it('never thins inside the window a free account can see', () => {
    expect(NOTE_VERSION_RETENTION_MAX_AGE_MS).toBeGreaterThanOrEqual(FREE_HISTORY_WINDOW_DAYS * DAY);
  });

  it('treats only routine saves as thinnable', () => {
    expect(isThinnableNoteVersionSource('save')).toBe(true);
    expect(isThinnableNoteVersionSource('sync-update')).toBe(true);
    for (const source of ['restore', 'import', 'copy', 'response-anchor', 'migration-baseline', null]) {
      expect(isThinnableNoteVersionSource(source)).toBe(false);
    }
  });
});

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function generateHistory(seed: number) {
  const random = seededRandom(seed);
  const pick = <T,>(items: readonly T[]) => items[Math.floor(random() * items.length)];
  const gaps = [MIN / 2, 2 * MIN, 4 * MIN, 30 * MIN, 2 * DAY];
  const sources = ['save', 'save', 'save', 'sync-update', 'restore', 'import'];
  const rows: ThinningVersionRow[] = [];
  let at = NOW.getTime() - 160 * DAY;
  let version = 0;
  for (let index = 0; index < 300; index += 1) {
    version = index === 0 ? 1 : version + (random() < 0.1 ? 2 : 1);
    at += pick(gaps);
    rows.push({
      id: `v${version}`,
      version,
      source: pick(sources),
      createdAt: new Date(at),
      editorId: random() < 0.15 ? 'user_b' : 'user_a',
    });
  }
  const newestFirst = [...rows].sort((left, right) => right.version - left.version);
  return {
    rows,
    currentVersionId: newestFirst[0].id,
    oldestProtectedVersion: newestFirst[NOTE_VERSION_RETENTION_LATEST_COUNT - 1].version,
    referencedVersionIds: new Set(rows.filter(() => random() < 0.05).map((entry) => entry.id)),
  };
}

function previousRulePrunableIds(history: ReturnType<typeof generateHistory>): Set<string> {
  const cutoff = NOW.getTime() - 90 * DAY;
  return new Set(
    [...history.rows]
      .sort((left, right) => right.version - left.version)
      .slice(NOTE_VERSION_RETENTION_LATEST_COUNT)
      .filter((entry) => entry.createdAt.getTime() < cutoff)
      .filter(
        (entry) =>
          !isProtectedNoteVersion({
            ...entry,
            currentVersionId: history.currentVersionId,
            referencedVersionIds: history.referencedVersionIds,
          }),
      )
      .map((entry) => entry.id),
  );
}
