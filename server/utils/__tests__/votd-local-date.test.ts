import { describe, expect, it } from 'vitest';
import { secondsUntilLocalMidnight } from '../votd-local-date';

describe('secondsUntilLocalMidnight', () => {
  it('counts to the zone’s midnight, not UTC’s', () => {
    // 04:50 UTC is 11:50pm in New York (EST) and 4:50am in London.
    const at = new Date('2026-11-12T04:50:00.000Z');
    expect(secondsUntilLocalMidnight('America/New_York', at)).toBe(600);
    expect(secondsUntilLocalMidnight('Europe/London', at)).toBe(86_400 - (4 * 3600 + 50 * 60));
  });

  it('is never zero', () => {
    expect(secondsUntilLocalMidnight('UTC', new Date('2026-11-12T23:59:59.900Z'))).toBe(1);
  });

  it('treats an invalid zone as UTC', () => {
    expect(secondsUntilLocalMidnight('Not/AZone', new Date('2026-11-12T12:00:00.000Z'))).toBe(43_200);
  });
});
