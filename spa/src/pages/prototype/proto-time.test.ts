import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { protoRelativeCaptionAbbrev } from './proto-time';

describe('protoRelativeCaptionAbbrev', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-08T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns empty string for missing or invalid iso', () => {
    expect(protoRelativeCaptionAbbrev()).toBe('');
    expect(protoRelativeCaptionAbbrev(null)).toBe('');
    expect(protoRelativeCaptionAbbrev('not-a-date')).toBe('');
  });

  it('returns now for timestamps under one minute ago', () => {
    expect(protoRelativeCaptionAbbrev('2026-06-08T11:59:30.000Z')).toBe('now');
  });

  it('returns narrow relative units for recent timestamps', () => {
    const fiveMinAgo = protoRelativeCaptionAbbrev('2026-06-08T11:55:00.000Z');
    expect(fiveMinAgo.length).toBeGreaterThan(0);
    expect(fiveMinAgo).not.toBe('now');

    const twoHoursAgo = protoRelativeCaptionAbbrev('2026-06-08T10:00:00.000Z');
    expect(twoHoursAgo.length).toBeGreaterThan(0);
    expect(twoHoursAgo.toLowerCase()).toContain('h');
  });

  it('uses days once older than 24 hours (not hours)', () => {
    const twentySixHoursAgo = protoRelativeCaptionAbbrev('2026-06-07T10:00:00.000Z');
    expect(twentySixHoursAgo.toLowerCase()).not.toContain('h');
    expect(twentySixHoursAgo.toLowerCase()).toMatch(/1|yesterday|day|d/);

    const fortyTwoHoursAgo = protoRelativeCaptionAbbrev('2026-06-06T18:00:00.000Z');
    expect(fortyTwoHoursAgo.toLowerCase()).not.toContain('42');
    expect(fortyTwoHoursAgo.toLowerCase()).not.toContain('h');
  });

  it('falls back to short date for timestamps older than ~10 weeks', () => {
    expect(protoRelativeCaptionAbbrev('2026-01-15T12:00:00.000Z')).toMatch(/Jan/);
  });
});
