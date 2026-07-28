import { describe, expect, it } from 'vitest';
import {
  computeActivityStatus,
  mergeProductFlagsIntoExtraData,
  toAudiencefulIsoTimestamp,
} from '@/utils/audienceful';

describe('Audienceful activity helpers', () => {
  const now = Date.parse('2026-07-28T12:00:00.000Z');

  it('maps Clerk ms timestamps to ISO', () => {
    expect(toAudiencefulIsoTimestamp(now)).toBe('2026-07-28T12:00:00.000Z');
    expect(toAudiencefulIsoTimestamp(Math.floor(now / 1000))).toBe('2026-07-28T12:00:00.000Z');
  });

  it('derives activity_status from the latest activity', () => {
    expect(computeActivityStatus('2026-07-27T12:00:00.000Z', null, now)).toBe('active');
    expect(computeActivityStatus('2026-07-10T12:00:00.000Z', null, now)).toBe('cooling');
    expect(computeActivityStatus('2026-05-01T12:00:00.000Z', null, now)).toBe('dormant');
    expect(computeActivityStatus(null, null, now)).toBe('unknown');
  });
});

describe('Audienceful product flag merge', () => {
  it('only promotes flags to true and never clears existing true', () => {
    const merged = mergeProductFlagsIntoExtraData(
      { has_created_note: true, has_shared: false, other: 'keep' },
      { has_shared: true, has_created_thread: true, upgrade_viewed: false },
    );
    expect(merged.has_created_note).toBe(true);
    expect(merged.has_shared).toBe(true);
    expect(merged.has_created_thread).toBe(true);
    expect(merged.upgrade_viewed).toBeUndefined();
    expect(merged.other).toBe('keep');
  });
});
