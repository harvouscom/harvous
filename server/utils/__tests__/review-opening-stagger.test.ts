import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CHAPTER_OPENING_STEPS,
  NOTE_OPENING_STEPS,
  VERSE_OPENING_STEPS,
  openingLadderStep,
} from '@/utils/review-prompts';
import { REVIEW_ENGINE_DAILY_CAP } from '@/utils/review-item-kinds';
import { ENGINE_PER_KIND_CAP } from '@/utils/review-opportunity-scoring';

/**
 * Which rung a new item opens on, and why the counter behind it has to survive a refill.
 *
 * `refillReviewQueue` runs against a real table, so the shape of the fix is what is readable
 * here — the style of `review-engine-backlog-cap.test.ts` next door. The rotation itself is pure
 * and is checked directly.
 */
const repoRoot = join(__dirname, '..', '..', '..');
const refill = readFileSync(join(repoRoot, 'server/utils/review-opportunities.ts'), 'utf8');

describe('the opening stagger', () => {
  it('rotates rather than repeating, for every kind', () => {
    for (const steps of [VERSE_OPENING_STEPS, CHAPTER_OPENING_STEPS, NOTE_OPENING_STEPS]) {
      expect(steps.length).toBeGreaterThan(1);
    }
    expect(
      VERSE_OPENING_STEPS.map((_, n) => openingLadderStep('verse', n)),
    ).toEqual([...VERSE_OPENING_STEPS]);
    expect([0, 1].map((n) => openingLadderStep('chapter', n))).toEqual([...CHAPTER_OPENING_STEPS]);
    // And wraps rather than falling off the end.
    expect(openingLadderStep('verse', VERSE_OPENING_STEPS.length)).toBe(VERSE_OPENING_STEPS[0]);
  });

  it('carries on from what the reader already has, not from zero each run', () => {
    /*
     * The bug this pins. The counter was reset to zero on every refill, and the engine adds at
     * most `ENGINE_PER_KIND_CAP` of a kind per run — usually one — so index 0 was asked for
     * nearly every time and almost every item opened on the same rung. Measured on a real
     * account before the fix: 25 of 29 items on step 0.
     */
    // A single run cannot walk the whole rotation, which is why restarting it was fatal.
    expect(ENGINE_PER_KIND_CAP).toBeLessThan(VERSE_OPENING_STEPS.length);
    expect(REVIEW_ENGINE_DAILY_CAP).toBeLessThan(VERSE_OPENING_STEPS.length * 2);

    const block = refill.slice(refill.indexOf('const addedOfKind'));
    const seeded = block.slice(0, block.indexOf('for (const pick of picks)'));
    // Seeded from the rows already loaded for the source-key check, so it costs no extra query.
    expect(seeded).toContain('for (const row of existing)');
    expect(seeded).toContain("row.sourceKey.split(':')[0]");
    expect(seeded).toContain('addedOfKind[kind] += 1');
  });

  it('still advances within a run, so a batch of two does not open on one rung', () => {
    const block = refill.slice(refill.indexOf('const addedOfKind'));
    expect(block).toContain('addedOfKind[kind] = (addedOfKind[kind] ?? 0) + 1');
    expect(block).toContain('openingLadderStep(kind, addedOfKind[kind] ?? 0)');
  });

  it('spreads a queue across the rotation once the counter persists', () => {
    // What a reader accumulating verse items one at a time now sees, over three full rotations.
    // Counted in rotations rather than a round number of refills, so adding an opening rung
    // does not turn an even split into a fractional expectation.
    const rotations = 3;
    const refills = VERSE_OPENING_STEPS.length * rotations;
    const opened = Array.from({ length: refills }, (_, existing) =>
      openingLadderStep('verse', existing),
    );
    expect(new Set(opened).size).toBe(VERSE_OPENING_STEPS.length);
    // And no single rung takes more than its share.
    for (const step of VERSE_OPENING_STEPS) {
      expect(opened.filter((s) => s === step).length).toBe(rotations);
    }
  });

  it('never opens on a rung that is how a verse is kept rather than how it is met', () => {
    /*
     * recall (2) and the altered word (7) are maintenance, never a first asking: both ask the
     * reader to produce a verse they have not yet been given a reason to hold.
     *
     * locate (6) used to be barred with them and no longer is. Its family carries `verse.marked`,
     * which asks the reader to find the words they highlighted themselves — the one rung where a
     * first asking is the *best* time to ask, because the mark is what made the verse an item.
     * See `VERSE_OPENING_STEPS` for the trade that buys, which is `verse.locate` on an unmarked
     * verse.
     */
    for (const barred of [2, 7]) expect(VERSE_OPENING_STEPS).not.toContain(barred);
  });
});
