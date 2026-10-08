/**
 * The rules that keep callouts from becoming a stream of interruptions: one at a time, never
 * twice, not back to back, only for the right people.
 */
import { describe, expect, it } from 'vitest';
import { compareVersions, pickCallout, CALLOUT_QUIET_MS, type Callout, type CalloutContext } from '../callout-registry';

const NOW = Date.parse('2026-10-10T12:00:00Z');
const ctx = (over: Partial<CalloutContext> = {}): CalloutContext => ({
  isGuest: false,
  isPlus: false,
  appVersion: '3.19.0',
  now: NOW,
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

describe('compareVersions', () => {
  it('compares numerically, part by part', () => {
    expect(compareVersions('3.9.0', '3.10.0')).toBe(-1);
    expect(compareVersions('3.18.5', '3.18.5')).toBe(0);
    expect(compareVersions('4', '3.99.99')).toBe(1);
  });
});
