/**
 * Two cards at most, and no refilling the corner within a day of putting one away.
 */
import { describe, expect, it } from 'vitest';
import { CALLOUT_QUIET_MS } from '../callout-registry';
import { admitStackItems } from '../callout-stack-admission';

const NOW = Date.parse('2026-10-10T12:00:00Z');
const items = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
const ids = (list: { id: string }[]) => list.map((item) => item.id);

describe('admitStackItems', () => {
  it('holds two at most, in order', () => {
    expect(ids(admitStackItems(items, { shownIds: new Set(), lastDismissedAt: -Infinity, now: NOW }))).toEqual([
      'a',
      'b',
    ]);
  });

  it('within a day of a put-away, keeps only cards already shown', () => {
    const recent = NOW - 60_000;
    expect(ids(admitStackItems(items, { shownIds: new Set(['c']), lastDismissedAt: recent, now: NOW }))).toEqual([
      'c',
    ]);
    expect(ids(admitStackItems(items, { shownIds: new Set(), lastDismissedAt: recent, now: NOW }))).toEqual([]);
  });

  it('fills back to two once the day has passed, never pushing off a card already shown', () => {
    const dayAgo = NOW - CALLOUT_QUIET_MS;
    expect(ids(admitStackItems(items, { shownIds: new Set(['c']), lastDismissedAt: dayAgo, now: NOW }))).toEqual([
      'a',
      'c',
    ]);
  });
});
