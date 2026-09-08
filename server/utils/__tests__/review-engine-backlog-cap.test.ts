import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  REVIEW_ENGINE_DAILY_CAP,
  REVIEW_ENGINE_MAX_OUTSTANDING,
  REVIEW_INBOX_MAX_ROWS,
} from '@/utils/review-item-kinds';

/**
 * The ceiling on how much unanswered study the engine will let accumulate.
 *
 * `refillReviewQueue` runs one query against a real table, so the shape of the guard is what is
 * readable here — in the style of study-bible-layer.test.ts next door. The constant itself is
 * pure and is checked directly.
 */
const repoRoot = join(__dirname, '..', '..', '..');
const refill = readFileSync(join(repoRoot, 'server/utils/review-opportunities.ts'), 'utf8');

describe('the backlog ceiling', () => {
  it('leaves room for several sittings before it ever trips', () => {
    // Low enough to matter, high enough that skipping a day or two cannot reach it.
    expect(REVIEW_ENGINE_MAX_OUTSTANDING).toBe(REVIEW_INBOX_MAX_ROWS * 4);
    expect(REVIEW_ENGINE_MAX_OUTSTANDING).toBeGreaterThan(REVIEW_ENGINE_DAILY_CAP);
  });

  it('stops the refill rather than shrinking it', () => {
    /*
     * Half a batch on top of a backlog is still a backlog. Returning early also means the block
     * clears itself the moment the reader answers a few, with no state to reset.
     */
    expect(refill).toContain('if (outstanding.length >= REVIEW_ENGINE_MAX_OUTSTANDING) return [];');
  });

  it('counts only what is due, and only what the engine added', () => {
    const guard = refill.slice(refill.indexOf('const [recent, outstanding]'), refill.indexOf('const room ='));
    // Due: something scheduled for next week is not owed yet and must not hold the queue.
    expect(guard).toContain('lte(ReviewItems.dueAt, now)');
    // Active: an item the reader paused or archived is one they put down, not one they owe.
    expect(guard).toContain("eq(ReviewItems.status, 'active')");
    // Engine-added: items the reader added by hand are theirs to stack up as high as they like.
    expect(guard).toContain("eq(ReviewItems.origin, 'engine')");
    // Bounded read — the count is only ever compared against the ceiling.
    expect(guard).toContain('.limit(REVIEW_ENGINE_MAX_OUTSTANDING)');
  });

  it('costs no extra round trip', () => {
    // Asked alongside the daily-cap query rather than before it, on a path that runs inline on
    // /api/review/inbox — which was cut from 2094ms to ~1000ms and should stay there.
    expect(refill).toContain('const [recent, outstanding] = await Promise.all([');
  });
});
