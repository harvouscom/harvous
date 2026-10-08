/**
 * The rules that keep callouts from becoming a stream of interruptions: one at a time, never
 * twice, not back to back, only for the right people.
 */
import { describe, expect, it } from 'vitest';
import {
  CALLOUTS,
  CALLOUT_QUIET_MS,
  CALLOUT_RETIRED_AT,
  CALLOUT_SHELF_MS,
  compareVersions,
  lastSeenAt,
  pickCallout,
  pickCalloutWithSuperseded,
  releaseHasCallout,
  type Callout,
  type CalloutContext,
} from '../callout-registry';

const NOW = Date.parse('2026-10-10T12:00:00Z');
const ctx = (over: Partial<CalloutContext> = {}): CalloutContext => ({
  isGuest: false,
  isPlus: false,
  appVersion: '3.19.0',
  now: NOW,
  accountCreatedAt: Date.parse('2026-01-01T00:00:00Z'),
  ...over,
});

function callout(id: string, over: Partial<Callout> = {}): Callout {
  return {
    id,
    title: id,
    body: 'body',
    illustration: 'today-tabs',
    action: { label: 'Go', href: 'https://example.com' },
    ...over,
  };
}

describe('pickCallout', () => {
  it('shows one, the highest priority', () => {
    const picked = pickCallout([callout('a'), callout('b', { priority: 5 })], {}, ctx());
    expect(picked?.id).toBe('b');
  });

  it('never shows one again once seen', () => {
    expect(pickCallout([callout('a')], { a: '2026-09-01T00:00:00Z' }, ctx())).toBeNull();
  });

  it('waits a day after one is put away before showing the next', () => {
    const justNow = new Date(NOW - 60_000).toISOString();
    expect(pickCallout([callout('b')], { a: justNow }, ctx())).toBeNull();
    const longAgo = new Date(NOW - CALLOUT_QUIET_MS - 1).toISOString();
    expect(pickCallout([callout('b')], { a: longAgo }, ctx())?.id).toBe('b');
  });

  it('stops once a callout is past its date', () => {
    expect(pickCallout([callout('a', { until: '2026-10-01' })], {}, ctx())).toBeNull();
  });

  it('waits for the release it belongs to', () => {
    expect(pickCallout([callout('a', { minVersion: '3.20.0' })], {}, ctx())).toBeNull();
    expect(pickCallout([callout('a', { minVersion: '3.19.0' })], {}, ctx())?.id).toBe('a');
    expect(pickCallout([callout('a', { minVersion: '3.19.0' })], {}, ctx({ appVersion: undefined }))).toBeNull();
  });

  it('keeps members-only callouts from guests, and Plus callouts from everyone else', () => {
    expect(pickCallout([callout('a')], {}, ctx({ isGuest: true }))).toBeNull();
    expect(pickCallout([callout('a', { audience: 'all' })], {}, ctx({ isGuest: true }))?.id).toBe('a');
    expect(pickCallout([callout('a', { audience: 'plus' })], {}, ctx())).toBeNull();
    expect(pickCallout([callout('a', { audience: 'plus' })], {}, ctx({ isPlus: true }))?.id).toBe('a');
  });

  it('lets a callout that is due by its own rule through the quiet period, ahead of the rest', () => {
    const justNow = new Date(NOW - 60_000).toISOString();
    const legal = callout('legal', { priority: 100 });
    expect(pickCallout([callout('b')], { a: justNow }, ctx(), [legal])?.id).toBe('legal');
  });
});

describe('who it is news to', () => {
  const shipped = '2026-10-01';

  it('announces a change only to accounts that had the app before it shipped', () => {
    const a = callout('a', { shippedAt: shipped });
    expect(pickCallout([a], {}, ctx())?.id).toBe('a');
    expect(pickCallout([a], {}, ctx({ accountCreatedAt: Date.parse('2026-10-02') }))).toBeNull();
    expect(pickCallout([a], {}, ctx({ accountCreatedAt: undefined }))).toBeNull();
  });

  it('goes stale six weeks after shipping unless it says otherwise', () => {
    const a = callout('a', { shippedAt: shipped });
    const stale = Date.parse(shipped) + CALLOUT_SHELF_MS;
    expect(pickCallout([a], {}, ctx({ now: stale - 1 }))?.id).toBe('a');
    expect(pickCallout([a], {}, ctx({ now: stale }))).toBeNull();
    const longer = callout('b', { shippedAt: shipped, until: '2027-01-01' });
    expect(pickCallout([longer], {}, ctx({ now: stale }))?.id).toBe('b');
  });

  it('shows the newest when several are due, and retires the older ones', () => {
    const older = callout('older', { shippedAt: '2026-09-20' });
    const newer = callout('newer', { shippedAt: '2026-10-05' });
    const pick = pickCalloutWithSuperseded([older, newer], {}, ctx());
    expect(pick.callout?.id).toBe('newer');
    expect(pick.superseded.map((c) => c.id)).toEqual(['older']);
  });

  it('retires nothing while the legal notice is showing', () => {
    const older = callout('older', { shippedAt: '2026-09-20' });
    const newer = callout('newer', { shippedAt: '2026-10-05' });
    const legal = callout('legal', { priority: 100 });
    const pick = pickCalloutWithSuperseded([older, newer], {}, ctx(), [legal]);
    expect(pick.callout?.id).toBe('legal');
    expect(pick.superseded).toEqual([]);
  });

  it('never lets a retired callout start the quiet period', () => {
    expect(lastSeenAt({ old: CALLOUT_RETIRED_AT })).toBeLessThan(NOW - CALLOUT_QUIET_MS);
    expect(pickCallout([callout('b')], { old: CALLOUT_RETIRED_AT }, ctx())?.id).toBe('b');
  });

  it('lets a recent callout speak for its release, seen or not, only to accounts it is news to', () => {
    const a = callout('a', { shippedAt: '2026-10-05' });
    expect(releaseHasCallout([a], ctx())).toBe(true);
    expect(releaseHasCallout([a], ctx({ now: Date.parse('2026-10-30') }))).toBe(false);
    expect(releaseHasCallout([a], ctx({ accountCreatedAt: Date.parse('2026-10-06') }))).toBe(false);
  });

  it('every shipped callout says when it shipped', () => {
    for (const entry of CALLOUTS) expect(entry.shippedAt, entry.id).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });
});

describe('compareVersions', () => {
  it('compares numerically, part by part', () => {
    expect(compareVersions('3.9.0', '3.10.0')).toBe(-1);
    expect(compareVersions('3.18.5', '3.18.5')).toBe(0);
    expect(compareVersions('4', '3.99.99')).toBe(1);
  });
});
