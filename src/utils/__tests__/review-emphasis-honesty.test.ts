import { describe, expect, it } from 'vitest';
import { ALWAYS_ON_FAMILIES, emphasisIsOfferable } from '@/utils/review-exercise-settings';
import {
  REVIEW_EXERCISE_FAMILY_ORDER,
  reviewExerciseFamilyId,
  reviewPromptKeysInFamily,
  type ReviewExerciseFamilyId,
} from '@/utils/review-exercise-families';
import {
  CHAPTER_FAMILIES,
  NOTE_LADDER,
  VERSE_FAMILIES,
  chapterRungFor,
  verseRungFor,
  type ReviewPromptKey,
} from '@/utils/review-prompts';
import { resolveNoteRung } from '@/utils/note-ladder-exercises';

/**
 * Settings offers More and Less only where they can change how often a family is asked.
 *
 * `emphasisIsOfferable` is derived from the ladder tables. This checks the claim a different way —
 * by resolving rungs and counting which family comes back — so the test cannot pass merely by
 * agreeing with the code it tests. A new rung that changes the answer fails here before it reaches
 * a settings row, which is the failure the hand-written list this replaced could not catch: it
 * offered switches on `memory` and `next` that did nothing to how often either was asked, and
 * refused one on `order` and `note`, which can genuinely be asked less.
 */

const SEEDS = 160;

/** Everything each kind could be asked, so a preference is the only thing deciding. */
const verse = {
  citedInNotes: 3,
  themeCount: 3,
  personCount: 3,
  placeCount: 3,
  crossRefCount: 3,
  locateRivals: 9,
  contentWordCount: 12,
  readerSpanWords: 5,
};
const chapter = { verseCount: 20, finishCandidates: 3, personCount: 2, placeCount: 2, highlightCount: 2 };
const note = { canRecognize: true, canPassage: true, canConnect: true, canAnnotation: true };

interface Prefs {
  skip?: ReadonlySet<ReviewPromptKey>;
  prefer?: ReadonlySet<ReviewPromptKey>;
}

/** How many of every rung resolved, across every step and seed, belong to this family. */
function askedCount(id: ReviewExerciseFamilyId, prefs: Prefs): number {
  let count = 0;
  const tally = (key: ReviewPromptKey | null) => {
    if (key && reviewExerciseFamilyId(key) === id) count += 1;
  };
  for (let n = 0; n < SEEDS; n++) {
    for (let step = 0; step < VERSE_FAMILIES.length; step++) {
      tally(verseRungFor(step, `v:${n}`, { ...verse, ...prefs }).key);
    }
    for (let step = 0; step < CHAPTER_FAMILIES.length; step++) {
      tally(chapterRungFor(step, `c:${n}`, { ...chapter, ...prefs }).key);
    }
    for (let step = 0; step < NOTE_LADDER.length; step++) {
      tally(resolveNoteRung(step, { ...note, ...prefs }, `n:${n}`));
    }
  }
  return count;
}

/*
 * Built from the family's keys directly rather than through `withEmphasis`, which refuses the
 * families with no control — and those are exactly the ones this has to be able to try.
 */
const keysOf = (id: ReviewExerciseFamilyId) => new Set<ReviewPromptKey>(reviewPromptKeysInFamily(id));

describe('where Settings offers More and Less', () => {
  it('lists the same families with no control as the derivation', () => {
    expect(REVIEW_EXERCISE_FAMILY_ORDER.filter((id) => !emphasisIsOfferable(id))).toEqual([
      ...ALWAYS_ON_FAMILIES,
    ]);
  });

  it('offers a control exactly where Less asks the family less often', () => {
    for (const id of REVIEW_EXERCISE_FAMILY_ORDER) {
      const normal = askedCount(id, {});
      const less = askedCount(id, { skip: keysOf(id) });
      expect(less, `Less ${id} asked it more often`).toBeLessThanOrEqual(normal);
      expect(less < normal, `Less ${id}`).toBe(emphasisIsOfferable(id));
    }
  });

  it('offers a control exactly where More asks the family more often', () => {
    for (const id of REVIEW_EXERCISE_FAMILY_ORDER) {
      const normal = askedCount(id, {});
      const more = askedCount(id, { prefer: keysOf(id) });
      expect(more, `More ${id} asked it less often`).toBeGreaterThanOrEqual(normal);
      expect(more > normal, `More ${id}`).toBe(emphasisIsOfferable(id));
    }
  });

  it('gives no control to a family that owns both members of its step', () => {
    /*
     * The switches that were lies. Skipping every member of a step falls forward to its first,
     * so turning `memory` off changed *which* memory question was asked — always the whole verse,
     * never keywords — and never whether one was.
     */
    for (const id of ['memory', 'next'] as const) {
      expect(emphasisIsOfferable(id)).toBe(false);
      expect(askedCount(id, { skip: keysOf(id) })).toBe(askedCount(id, {}));
    }
  });

  it('gives a control to order and note, which share a draw with other families', () => {
    // `chapter.order` is drawn against who and places; `note.recognize` against cited and linked.
    expect(emphasisIsOfferable('order')).toBe(true);
    expect(emphasisIsOfferable('note')).toBe(true);
  });
});
