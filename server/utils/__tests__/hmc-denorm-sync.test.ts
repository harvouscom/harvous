import { describe, expect, it, vi } from 'vitest';
import {
  coalesceHmcChurchChanges,
  defaultHmcSyncSince,
  drainHmcChurchChangeFeed,
  HMC_SYNC_DEFAULT_LOOKBACK_MS,
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
