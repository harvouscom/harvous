import { describe, expect, it, vi } from 'vitest';
import {
  clampHmcSyncSince,
  coalesceHmcChurchChanges,
  defaultHmcSyncSince,
  drainHmcChurchChangeFeed,
  runHmcDenormSync,
  HMC_SYNC_DEFAULT_LOOKBACK_MS,
  HMC_SYNC_MAX_LOOKBACK_MS,
} from '../hmc-denorm-sync';
import type { HmcChurchChange, HmcChurchChangesPage } from '../hmc-partner';

describe('coalesceHmcChurchChanges', () => {
  it('keeps the last action per churchId', () => {
    const changes: HmcChurchChange[] = [
      { churchId: 'TX-1', action: 'field_updated', field: 'name', at: 't1' },
      { churchId: 'TX-2', action: 'church_added', at: 't2' },
      { churchId: 'TX-1', action: 'church_removed', at: 't3' },
      { churchId: 'TX-2', action: 'field_updated', field: 'city', at: 't4' },
    ];
    expect(Object.fromEntries(coalesceHmcChurchChanges(changes))).toEqual({
      'TX-1': 'removed',
      'TX-2': 'refresh',
    });
  });

  it('ignores blank church ids', () => {
    expect(
      coalesceHmcChurchChanges([{ churchId: '  ', action: 'field_updated', at: 't1' }]).size,
    ).toBe(0);
  });
});

describe('defaultHmcSyncSince', () => {
  it('looks back the default window', () => {
    const now = Date.parse('2026-07-27T12:00:00.000Z');
    expect(defaultHmcSyncSince(now)).toBe(
      new Date(now - HMC_SYNC_DEFAULT_LOOKBACK_MS).toISOString(),
    );
  });
});

describe('clampHmcSyncSince', () => {
  const now = Date.parse('2026-09-03T06:00:00.000Z');

  it('passes a fresh cursor through untouched', () => {
    const stored = new Date(now - 2 * 60 * 60 * 1000).toISOString();
    expect(clampHmcSyncSince(stored, now)).toEqual({ since: stored, clampedFrom: null });
  });

  it('falls back to the default lookback when there is no cursor yet', () => {
    expect(clampHmcSyncSince(null, now)).toEqual({
      since: defaultHmcSyncSince(now),
      clampedFrom: null,
    });
  });

  /*
   * The deadlock this exists to prevent, with the real numbers from it.
   *
   * The stored cursor read 2026-07-29 while the cron ran on 2026-09-03 — 36 days, past the
   * feed's 30-day window. Every poll came back 400, and since the cursor is only written
   * after a successful drain, no amount of retrying could advance it. Unclamped, this is a
   * job that cannot succeed again without someone editing the database by hand.
   */
  it('pulls a cursor older than the feed window up to the floor', () => {
    const stuck = '2026-07-29T02:48:00.645Z';
    const result = clampHmcSyncSince(stuck, now);
    expect(result.clampedFrom).toBe(stuck);
    expect(Date.parse(result.since)).toBe(now - HMC_SYNC_MAX_LOOKBACK_MS);
  });

  it('keeps the floor inside the 30 days the feed actually allows', () => {
    // Sitting exactly on 30 days would leave request latency and clock skew to decide
    // whether the call is legal when it lands.
    expect(HMC_SYNC_MAX_LOOKBACK_MS).toBeLessThan(30 * 24 * 60 * 60 * 1000);
    expect(HMC_SYNC_MAX_LOOKBACK_MS).toBeGreaterThan(29 * 24 * 60 * 60 * 1000);
  });

  it('treats an unparseable cursor as no cursor, and says it did', () => {
    const result = clampHmcSyncSince('not-a-date', now);
    expect(result).toEqual({ since: defaultHmcSyncSince(now), clampedFrom: 'not-a-date' });
  });
});

describe('runHmcDenormSync uses the clamped cursor', () => {
  /*
   * The clamp is only worth anything if the sync actually asks with it. Testing the pure
   * function alone would have passed just as happily with the helper written, exported,
   * covered — and never called.
   */
  it('asks the feed for the floor, not the stale cursor it had stored', async () => {
    const now = Date.parse('2026-09-03T06:00:00.000Z');
    const stuck = '2026-07-29T02:48:00.645Z';
    const asked: string[] = [];
    const written: string[] = [];

    const result = await runHmcDenormSync({
      cursorStore: {
        get: async () => stuck,
        set: async (cursor: string) => {
          written.push(cursor);
        },
      },
      fetchChanges: async ({ since }) => {
        asked.push(since);
        // An empty page that advances: nothing dirty, so no database is touched.
        return { changes: [], nextSince: new Date(now).toISOString(), hasMore: false };
      },
      getChurchById: async () => null,
      now: () => now,
    });

    expect(asked).toHaveLength(1);
    expect(asked[0]).not.toBe(stuck);
    expect(Date.parse(asked[0]!)).toBe(now - HMC_SYNC_MAX_LOOKBACK_MS);
    expect(result.clampedFrom).toBe(stuck);
    // And the run un-sticks the watermark, which is the whole point.
    expect(written).toEqual([new Date(now).toISOString()]);
  });

  it('leaves a healthy cursor alone and reports no clamp', async () => {
    const now = Date.parse('2026-09-03T06:00:00.000Z');
    const fresh = new Date(now - 90 * 60 * 1000).toISOString();
    const asked: string[] = [];

    const result = await runHmcDenormSync({
      cursorStore: { get: async () => fresh, set: async () => {} },
      fetchChanges: async ({ since }) => {
        asked.push(since);
        return { changes: [], nextSince: new Date(now).toISOString(), hasMore: false };
      },
      getChurchById: async () => null,
      now: () => now,
    });

    expect(asked).toEqual([fresh]);
    expect(result.clampedFrom).toBeNull();
  });
});

describe('drainHmcChurchChangeFeed', () => {
  it('pages until hasMore is false and merges dirty ids', async () => {
    const pages: HmcChurchChangesPage[] = [
      {
        changes: [{ churchId: 'TX-1', action: 'field_updated', at: 't1' }],
        nextSince: 't1',
        hasMore: true,
      },
      {
        changes: [
          { churchId: 'TX-1', action: 'church_removed', at: 't2' },
          { churchId: 'TX-9', action: 'church_added', at: 't2' },
        ],
        nextSince: 't2',
        hasMore: false,
      },
    ];
    const fetchChanges = vi.fn(async ({ since }: { since: string }) => {
      if (since === 'start') return pages[0]!;
      if (since === 't1') return pages[1]!;
      throw new Error(`unexpected since ${since}`);
    });

    const result = await drainHmcChurchChangeFeed({
      since: 'start',
      fetchChanges: fetchChanges as never,
    });

    expect(result.pages).toBe(2);
    expect(result.changeEvents).toBe(3);
    expect(result.stalled).toBe(false);
    expect(result.nextSince).toBe('t2');
    expect(Object.fromEntries(result.dirty)).toEqual({
      'TX-1': 'removed',
      'TX-9': 'refresh',
    });
  });

  it('stops when nextSince does not advance', async () => {
    const fetchChanges = vi.fn(async () => ({
      changes: [{ churchId: 'TX-1', action: 'field_updated', at: 'same' }],
      nextSince: 'same',
      hasMore: true,
    }));

    const result = await drainHmcChurchChangeFeed({
      since: 'same',
      fetchChanges: fetchChanges as never,
      maxPages: 5,
    });

    expect(result.stalled).toBe(true);
    expect(result.pages).toBe(1);
    expect(fetchChanges).toHaveBeenCalledTimes(1);
  });
});
