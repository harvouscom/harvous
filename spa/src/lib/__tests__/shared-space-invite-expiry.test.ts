import { describe, expect, it } from 'vitest';
import {
  formatInviteExpiry,
  inviteExpiryMinDateInputValue,
  resolveInviteExpiresAt,
} from '../shared-space-invite-expiry';

describe('resolveInviteExpiresAt', () => {
  it('returns null for never', () => {
    expect(resolveInviteExpiresAt('never', '')).toBeNull();
  });

  it('returns ISO string for day presets', () => {
    const before = Date.now();
    const result = resolveInviteExpiresAt('7d', '');
    expect(result).toBeTruthy();
    const parsed = new Date(result!);
    expect(parsed.getTime()).toBeGreaterThan(before + 6 * 24 * 60 * 60 * 1000);
  });

  it('requires a custom date when preset is custom', () => {
    expect(() => resolveInviteExpiresAt('custom', '')).toThrow(/pick an expiration date/i);
  });

  it('accepts a future custom date at end of day', () => {
    const future = inviteExpiryMinDateInputValue();
    const result = resolveInviteExpiresAt('custom', future);
    expect(result).toBeTruthy();
    expect(new Date(result!).getTime()).toBeGreaterThan(Date.now());
  });
});

describe('formatInviteExpiry', () => {
  it('labels open-ended links', () => {
    expect(formatInviteExpiry(null)).toBe('No expiry');
  });

  it('formats a valid expiry', () => {
    expect(formatInviteExpiry('2030-06-15T12:00:00.000Z')).toMatch(/^Expires /);
  });
});
