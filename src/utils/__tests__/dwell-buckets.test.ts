import { describe, expect, it } from 'vitest';
import {
  dwellBucketFor,
  dwellCountsAsSubstantive,
  dwellIsRecordable,
  dwellStrength,
  isDwellBucket,
  nextDwellReport,
  type DwellThresholds,
} from '../dwell-buckets';

/** Two unrelated threshold sets, so nothing here can pass by accident on shared numbers. */
const FAST: DwellThresholds = { minMs: 100, readMs: 1_000, studyMs: 5_000 };
const SLOW: DwellThresholds = { minMs: 10_000, readMs: 60_000, studyMs: 600_000 };

describe('dwell-buckets', () => {
  it('buckets against whichever thresholds it is given', () => {
    expect(dwellBucketFor(2_000, FAST)).toBe('read');
    expect(dwellBucketFor(2_000, SLOW)).toBe('glance');
    expect(dwellBucketFor(600_000, SLOW)).toBe('study');
  });

  it('treats a non-finite duration as a glance rather than throwing', () => {
    expect(dwellBucketFor(Number.NaN, FAST)).toBe('glance');
    expect(dwellIsRecordable(Number.NaN, FAST)).toBe(false);
  });

  it('gates recording on the floor', () => {
    expect(dwellIsRecordable(99, FAST)).toBe(false);
    expect(dwellIsRecordable(100, FAST)).toBe(true);
  });

  it('orders buckets by strength', () => {
    expect(dwellStrength('glance')).toBeLessThan(dwellStrength('read'));
    expect(dwellStrength('read')).toBeLessThan(dwellStrength('study'));
  });

  it('counts everything but a glance as substantive', () => {
    expect(dwellCountsAsSubstantive('glance')).toBe(false);
    expect(dwellCountsAsSubstantive('read')).toBe(true);
  });

  it('validates bucket strings', () => {
    expect(isDwellBucket('study')).toBe(true);
    expect(isDwellBucket('lingered')).toBe(false);
  });

  describe('nextDwellReport', () => {
    it('reports nothing below the floor, whatever was reported before', () => {
      expect(nextDwellReport(50, null, FAST)).toBeNull();
      expect(nextDwellReport(50, 'read', FAST)).toBeNull();
    });

    it('reports the bucket reached when nothing has been reported yet', () => {
      expect(nextDwellReport(200, null, FAST)).toBe('glance');
    });

    it('re-reports only on a strengthened bucket', () => {
      expect(nextDwellReport(1_500, 'glance', FAST)).toBe('read');
      expect(nextDwellReport(2_000, 'read', FAST)).toBeNull();
      expect(nextDwellReport(6_000, 'read', FAST)).toBe('study');
      expect(nextDwellReport(200, 'study', FAST)).toBeNull();
    });
  });
});
