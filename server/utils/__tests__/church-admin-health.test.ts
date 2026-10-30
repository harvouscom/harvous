import { describe, expect, it } from 'vitest';
import { churchAttention, type ChurchHealth } from '../church-admin-health';

const NOW = new Date('2026-10-29T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const healthy: ChurchHealth = {
  connectedCount: 40,
  staffCount: 3,
  channelCount: 2,
  serviceTimeCount: 2,
  joinedByLinkCount: 12,
  inReviewCount: 0,
  lastPostAt: new Date(NOW.getTime() - 2 * DAY).toISOString(),
};
const pilot = (days: number) => ({
  isActive: true,
  deletedAt: null,
  billingPlan: null,
  pilotUntil: new Date(NOW.getTime() + days * DAY),
});

describe('churchAttention', () => {
  it('says nothing about a healthy church', () => {
    expect(churchAttention(pilot(20), healthy, NOW)).toEqual([]);
    expect(churchAttention({ ...pilot(-1), billingPlan: 'church' }, healthy, NOW)).toEqual([]);
  });
  it('puts the plan first: lapsed, or a pilot in its last week', () => {
    expect(churchAttention(pilot(-1), healthy, NOW)[0]).toBe('lapsed');
    expect(churchAttention(pilot(5), healthy, NOW)[0]).toBe('pilot_ending');
  });
  it('flags a church that never posted, went quiet, has no times, or reached no one', () => {
    expect(churchAttention(pilot(20), { ...healthy, lastPostAt: null }, NOW)).toContain('never_posted');
    expect(
      churchAttention(pilot(20), { ...healthy, lastPostAt: new Date(NOW.getTime() - 20 * DAY).toISOString() }, NOW),
    ).toContain('quiet');
    expect(churchAttention(pilot(20), { ...healthy, serviceTimeCount: 0 }, NOW)).toContain('no_service_times');
    expect(churchAttention(pilot(20), { ...healthy, connectedCount: 0 }, NOW)).toContain('no_one_connected');
  });
  it('ignores an inactive church entirely', () => {
    expect(churchAttention({ ...pilot(-1), isActive: false }, { ...healthy, lastPostAt: null }, NOW)).toEqual([]);
  });
});
