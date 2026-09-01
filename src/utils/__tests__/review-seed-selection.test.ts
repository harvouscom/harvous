import { describe, it, expect } from 'vitest';
import { SEED_MIN_AGE_DAYS, rankSeedCandidates, scoreSeedCandidate } from '../review-seed-selection';

const NOW = new Date('2026-09-01T12:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

describe('rankSeedCandidates', () => {
  it('prefers a meaningful faded note over a thin one of the same age', () => {
    const ranked = rankSeedCandidates(
      [
        { noteId: 'thin', meaningWeight: 0.1, lastTouchedAt: daysAgo(90) },
        { noteId: 'deep', meaningWeight: 0.9, lastTouchedAt: daysAgo(90) },
      ],
      NOW,
    );
    expect(ranked[0].noteId).toBe('deep');
  });

  it('prefers the fainter of two equally meaningful notes', () => {
    const ranked = rankSeedCandidates(
      [
        { noteId: 'recent', meaningWeight: 0.8, lastTouchedAt: daysAgo(20) },
        { noteId: 'faded', meaningWeight: 0.8, lastTouchedAt: daysAgo(200) },
      ],
      NOW,
    );
    expect(ranked[0].noteId).toBe('faded');
  });

  it('excludes notes still fresh in mind', () => {
    const ranked = rankSeedCandidates(
      [
        { noteId: 'yesterday', meaningWeight: 1, lastTouchedAt: daysAgo(1) },
        { noteId: 'old', meaningWeight: 0.2, lastTouchedAt: daysAgo(60) },
      ],
      NOW,
    );
    expect(ranked.map((r) => r.noteId)).toEqual(['old']);
  });

  it('honours the limit', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      noteId: `n${i}`,
      meaningWeight: 0.5,
      lastTouchedAt: daysAgo(30 + i),
    }));
    expect(rankSeedCandidates(many, NOW, 3)).toHaveLength(3);
    expect(rankSeedCandidates(many, NOW, 0)).toHaveLength(0);
  });

  it('treats a never-touched note as exactly at the age floor', () => {
    const { daysSinceTouched } = scoreSeedCandidate(
      { noteId: 'x', meaningWeight: 0.5, lastTouchedAt: null },
      NOW,
    );
    expect(daysSinceTouched).toBe(SEED_MIN_AGE_DAYS);
  });

  it('does not crash on a nonsense meaning weight', () => {
    const ranked = rankSeedCandidates(
      [{ noteId: 'x', meaningWeight: Number.NaN, lastTouchedAt: daysAgo(40) }],
      NOW,
    );
    expect(ranked[0].score).toBe(0);
  });
});
