/**
 * Which notes a cold-start seed picks.
 *
 * The offer is "start reviewing" with nothing in the queue yet, so the first three items
 * decide whether the reader ever comes back. Picking the most recent notes would be the
 * obvious choice and the wrong one — those are the ones they still remember, so every prompt
 * would be answered instantly and the feature would look pointless.
 *
 * So: meaning × time. `meaningWeight` already exists on NoteFingerprints (body depth,
 * passages, highlights, deliberate organization), and time since the note was last touched
 * stands in for how far it has faded. Log rather than linear on the time side, because the
 * difference between one month and two matters much more than between twenty months and
 * twenty-one, and a linear term would let one ancient thin note beat everything.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface SeedCandidate {
  noteId: string;
  meaningWeight: number;
  /** Latest of visited / updated / recall-engaged — any of them means it is not forgotten. */
  lastTouchedAt: Date | null;
}

export interface RankedSeedCandidate extends SeedCandidate {
  score: number;
  daysSinceTouched: number;
}

/** Under two weeks is too fresh to ask about — the reader would just recite it. */
export const SEED_MIN_AGE_DAYS = 14;

export function scoreSeedCandidate(
  candidate: SeedCandidate,
  now: Date,
): { score: number; daysSinceTouched: number } {
  const touched = candidate.lastTouchedAt?.getTime();
  const daysSinceTouched = touched != null && Number.isFinite(touched)
    ? Math.max(0, (now.getTime() - touched) / MS_PER_DAY)
    : SEED_MIN_AGE_DAYS;
  const meaning = Number.isFinite(candidate.meaningWeight)
    ? Math.max(0, candidate.meaningWeight)
    : 0;
  // +1 inside the log so a note touched today scores 0 rather than going negative.
  return { score: meaning * Math.log2(1 + daysSinceTouched), daysSinceTouched };
}

/**
 * Top `limit` by score, oldest-touched first on ties so the seed spreads across time rather
 * than pulling three notes from the same afternoon.
 */
export function rankSeedCandidates(
  candidates: SeedCandidate[],
  now: Date = new Date(),
  limit = 3,
): RankedSeedCandidate[] {
  return candidates
    .map((c) => ({ ...c, ...scoreSeedCandidate(c, now) }))
    .filter((c) => c.daysSinceTouched >= SEED_MIN_AGE_DAYS)
    .sort((a, b) => b.score - a.score || b.daysSinceTouched - a.daysSinceTouched)
    .slice(0, Math.max(0, limit));
}
