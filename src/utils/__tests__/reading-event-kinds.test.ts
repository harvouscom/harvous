import { describe, expect, it } from 'vitest';
import {
  READING_DWELL_READ_MS,
  READING_DWELL_STUDY_MS,
  isReadingDwellBucket,
  readingDwellBucket,
  readingDwellCountsAsRead,
} from '../reading-event-kinds';

describe('readingDwellBucket', () => {
  it('buckets at the boundaries', () => {
    expect(readingDwellBucket(0)).toBe('glance');
    expect(readingDwellBucket(READING_DWELL_READ_MS - 1)).toBe('glance');
    expect(readingDwellBucket(READING_DWELL_READ_MS)).toBe('read');
    expect(readingDwellBucket(READING_DWELL_STUDY_MS - 1)).toBe('read');
    expect(readingDwellBucket(READING_DWELL_STUDY_MS)).toBe('study');
  });

  it('treats a nonsense duration as a glance rather than inventing attention', () => {
    expect(readingDwellBucket(Number.NaN)).toBe('glance');
    expect(readingDwellBucket(Number.POSITIVE_INFINITY)).toBe('glance');
    expect(readingDwellBucket(-1000)).toBe('glance');
  });
});

describe('readingDwellCountsAsRead', () => {
  it('excludes only the glance', () => {
    expect(readingDwellCountsAsRead('glance')).toBe(false);
    expect(readingDwellCountsAsRead('read')).toBe(true);
    expect(readingDwellCountsAsRead('study')).toBe(true);
  });
});

describe('isReadingDwellBucket', () => {
  it('gates unknown values', () => {
    expect(isReadingDwellBucket('read')).toBe(true);
    expect(isReadingDwellBucket('skimmed')).toBe(false);
    expect(isReadingDwellBucket('')).toBe(false);
  });
});
