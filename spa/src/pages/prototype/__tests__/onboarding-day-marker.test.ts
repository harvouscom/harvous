/**
 * The day marker's only job is to answer "has it led today", and the two things worth
 * pinning are that it rolls at local midnight and that a broken store reads as a fresh day
 * rather than as "already shown" — failing toward showing the checklist twice, never toward
 * silently retiring it.
 */
import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import {
  markOnboardingLedToday,
  onboardingDayKey,
  onboardingHasLedToday,
} from '../onboarding-day-marker';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('the day key', () => {
  it('is the local calendar day, not UTC', () => {
    // 00:30 local on the 3rd — a UTC-based key west of Greenwich would still say the 2nd.
    const d = new Date(2026, 8, 3, 0, 30);
    expect(onboardingDayKey(d)).toBe('2026-09-03');
  });

  it('pads single-digit months and days', () => {
    expect(onboardingDayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('has it led today', () => {
  it('is false before anything is recorded', () => {
    expect(onboardingHasLedToday()).toBe(false);
  });

  it('is true for the rest of the day it was marked', () => {
    const morning = new Date(2026, 8, 3, 9, 0);
    markOnboardingLedToday(morning);
    expect(onboardingHasLedToday(new Date(2026, 8, 3, 23, 59))).toBe(true);
  });

  it('rolls over at local midnight', () => {
    markOnboardingLedToday(new Date(2026, 8, 3, 23, 59));
    expect(onboardingHasLedToday(new Date(2026, 8, 4, 0, 1))).toBe(false);
  });

  it('reads a broken store as a fresh day', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(onboardingHasLedToday()).toBe(false);
  });

  it('survives a store that refuses writes', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => markOnboardingLedToday()).not.toThrow();
  });
});
