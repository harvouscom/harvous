import { describe, expect, it } from 'vitest';
import { churchIsSponsored, churchSponsorship } from '../church-entitlement';

const NOW = new Date('2026-08-03T12:00:00.000Z');
const FUTURE = new Date('2026-09-02T12:00:00.000Z');
const PAST = new Date('2026-07-04T12:00:00.000Z');

function church(overrides: Partial<{
  isActive: boolean;
  deletedAt: Date | null;
  billingPlan: string | null;
  pilotUntil: Date | null;
}> = {}) {
  return {
    isActive: true,
    deletedAt: null,
    billingPlan: null,
    pilotUntil: null,
    ...overrides,
  };
}

describe('churchSponsorship truth table', () => {
  it('is lapsed with no plan and no pilot', () => {
    const result = churchSponsorship(church(), NOW);
    expect(result).toEqual({
      sponsored: false,
      state: 'lapsed',
      pilotUntil: null,
      pilotDaysLeft: null,
    });
  });

  it('is sponsored on a future pilot window and reports days left', () => {
    const result = churchSponsorship(church({ pilotUntil: FUTURE }), NOW);
    expect(result.sponsored).toBe(true);
    expect(result.state).toBe('pilot');
    expect(result.pilotUntil).toBe(FUTURE.toISOString());
    expect(result.pilotDaysLeft).toBe(30);
  });

  it('is lapsed once the pilot window passes', () => {
    const result = churchSponsorship(church({ pilotUntil: PAST }), NOW);
    expect(result.sponsored).toBe(false);
    expect(result.state).toBe('lapsed');
  });

  it('is sponsored on a billing plan with no pilot', () => {
    const result = churchSponsorship(church({ billingPlan: 'church' }), NOW);
    expect(result.sponsored).toBe(true);
    expect(result.state).toBe('paid');
  });

  it('reports paid (no countdown) when a church converts mid-pilot', () => {
    const result = churchSponsorship(church({ billingPlan: 'church', pilotUntil: FUTURE }), NOW);
    expect(result.state).toBe('paid');
    expect(result.pilotUntil).toBeNull();
    expect(result.pilotDaysLeft).toBeNull();
  });

  it('keeps a paid church sponsored after its old pilot window expired', () => {
    expect(churchIsSponsored(church({ billingPlan: 'church', pilotUntil: PAST }), NOW)).toBe(true);
  });

  it('is lapsed when deactivated, whatever the funding', () => {
    expect(churchIsSponsored(church({ isActive: false, billingPlan: 'church' }), NOW)).toBe(false);
    expect(churchIsSponsored(church({ isActive: false, pilotUntil: FUTURE }), NOW)).toBe(false);
  });

  it('is lapsed when soft-deleted, whatever the funding', () => {
    expect(churchIsSponsored(church({ deletedAt: PAST, billingPlan: 'church' }), NOW)).toBe(false);
    expect(churchIsSponsored(church({ deletedAt: PAST, pilotUntil: FUTURE }), NOW)).toBe(false);
  });

  it('treats a missing church as lapsed rather than throwing', () => {
    expect(churchIsSponsored(null, NOW)).toBe(false);
    expect(churchIsSponsored(undefined, NOW)).toBe(false);
  });

  it('accepts ISO strings for pilotUntil (Drizzle date coercion)', () => {
    const result = churchSponsorship(
      church({ pilotUntil: FUTURE.toISOString() as unknown as Date }),
      NOW,
    );
    expect(result.state).toBe('pilot');
  });

  it('treats an unparseable pilotUntil as no pilot rather than sponsoring', () => {
    const result = churchSponsorship(
      church({ pilotUntil: 'not-a-date' as unknown as Date }),
      NOW,
    );
    expect(result.sponsored).toBe(false);
  });

  it('lapses exactly at the boundary, not after', () => {
    expect(churchIsSponsored(church({ pilotUntil: NOW }), NOW)).toBe(false);
    expect(churchIsSponsored(church({ pilotUntil: new Date(NOW.getTime() + 1) }), NOW)).toBe(true);
  });
});
