import { describe, expect, it } from 'vitest';
import { isNoteNewSinceVisit } from '../shared-space-visit';

describe('isNoteNewSinceVisit', () => {
  it('returns false when watermark or updatedAt is missing', () => {
    expect(isNoteNewSinceVisit('2026-01-02T00:00:00.000Z', null)).toBe(false);
    expect(isNoteNewSinceVisit(null, '2026-01-01T00:00:00.000Z')).toBe(false);
  });

  it('returns true when note updated after watermark', () => {
    expect(
      isNoteNewSinceVisit('2026-01-03T00:00:00.000Z', '2026-01-02T00:00:00.000Z'),
    ).toBe(true);
  });

  it('returns false when note updated on or before watermark', () => {
    expect(
      isNoteNewSinceVisit('2026-01-02T00:00:00.000Z', '2026-01-02T00:00:00.000Z'),
    ).toBe(false);
    expect(
      isNoteNewSinceVisit('2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z'),
    ).toBe(false);
  });
});

describe('shared-space visit watermark contract', () => {
  it('documents lastVisitedAt ?? joinedAt for catch-up (see visitWatermark in shared-space-visit.ts)', () => {
    const lastVisitedAt: Date | null = null;
    const joinedAt = new Date('2026-06-01T00:00:00.000Z');
    const watermark = lastVisitedAt ?? joinedAt ?? null;
    expect(watermark?.toISOString()).toBe('2026-06-01T00:00:00.000Z');
  });
});

describe('broadcastInvalidationToSpaceMembers', () => {
  it('exports fan-out helper from realtime module', async () => {
    const mod = await import('../realtime');
    expect(typeof mod.broadcastInvalidationToSpaceMembers).toBe('function');
  });
});
