import { describe, expect, it } from 'vitest';
import {
  READING_DWELL_MIN_MS,
  READING_DWELL_READ_MS,
  READING_DWELL_STUDY_MS,
  nextReadingDwellReport,
} from '../reading-event-kinds';

/**
 * A reading session reports when the tab is hidden and again when it ends, so the rule for
 * "is this second report worth a row" is what keeps the log from filling with duplicates of
 * the same read — and what keeps a long read from being recorded only as the glance it
 * looked like when the reader first switched tabs.
 */
describe('nextReadingDwellReport', () => {
  it('stays quiet below the floor, so a bounce leaves no trace', () => {
    expect(nextReadingDwellReport(0, null)).toBeNull();
    expect(nextReadingDwellReport(READING_DWELL_MIN_MS - 1, null)).toBeNull();
    expect(nextReadingDwellReport(READING_DWELL_MIN_MS, null)).toBe('glance');
  });

  it('reports the first bucket a session reaches', () => {
    expect(nextReadingDwellReport(READING_DWELL_READ_MS, null)).toBe('read');
    expect(nextReadingDwellReport(READING_DWELL_STUDY_MS, null)).toBe('study');
  });

  it('does not repeat a bucket it already reported', () => {
    expect(nextReadingDwellReport(READING_DWELL_READ_MS + 1000, 'read')).toBeNull();
    expect(nextReadingDwellReport(READING_DWELL_STUDY_MS + 1000, 'study')).toBeNull();
  });

  it('reports again once the reading grew into a fuller bucket', () => {
    expect(nextReadingDwellReport(READING_DWELL_READ_MS, 'glance')).toBe('read');
    expect(nextReadingDwellReport(READING_DWELL_STUDY_MS, 'glance')).toBe('study');
    expect(nextReadingDwellReport(READING_DWELL_STUDY_MS, 'read')).toBe('study');
  });

  it('never downgrades, so a shorter measure cannot undo a longer one', () => {
    expect(nextReadingDwellReport(READING_DWELL_MIN_MS, 'study')).toBeNull();
    expect(nextReadingDwellReport(READING_DWELL_READ_MS, 'study')).toBeNull();
  });
});
