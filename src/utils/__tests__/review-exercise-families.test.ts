import { describe, it, expect } from 'vitest';
import { REVIEW_PROMPT_KEYS, REVIEW_TASKS, type ReviewPromptKey } from '@/utils/review-prompts';
import {
  REVIEW_EXERCISE_FAMILIES,
  REVIEW_EXERCISE_FAMILY_ORDER,
  reviewExerciseFamily,
  reviewExerciseFamilyId,
  reviewPromptKeysInFamily,
} from '@/utils/review-exercise-families';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { IconName } from '@/components/react/Icon';
import type { ReviewExerciseIcon } from '@/utils/review-exercise-families';

/*
 * The glyph names are a plain string union rather than `IconName` itself, so that the server can
 * import this module without pulling every SVG in with it. This line is what keeps the two in
 * step: it does not compile if a family ever names a glyph the icon set does not have.
 */
type _EveryGlyphExists = ReviewExerciseIcon extends IconName ? true : never;
const _glyphsExist: _EveryGlyphExists = true;
void _glyphsExist;

describe('review exercise families', () => {
  it('names every rung, so none reaches a row without a label', () => {
    for (const key of REVIEW_PROMPT_KEYS) {
      const family = reviewExerciseFamily(key);
      expect(family.label.length).toBeGreaterThan(0);
      expect(REVIEW_EXERCISE_FAMILIES[reviewExerciseFamilyId(key)]).toBe(family);
    }
  });

  it('draws every glyph from the icon set the app already has', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/components/react/Icon.tsx'), 'utf8');
    for (const family of Object.values(REVIEW_EXERCISE_FAMILIES)) {
      // Registered as a bare key or a quoted one, depending on whether the name has a hyphen.
      const registered =
        source.includes(`\n  ${family.icon}:`) || source.includes(`\n  '${family.icon}':`);
      expect(registered, `${family.icon} is not in the icon set`).toBe(true);
    }
  });

  it('lists every family on the settings page, each exactly once', () => {
    const ids = Object.keys(REVIEW_EXERCISE_FAMILIES).sort();
    expect([...REVIEW_EXERCISE_FAMILY_ORDER].sort()).toEqual(ids);
    expect(new Set(REVIEW_EXERCISE_FAMILY_ORDER).size).toBe(REVIEW_EXERCISE_FAMILY_ORDER.length);
  });

  it('puts every rung in exactly one family', () => {
    const seen = REVIEW_EXERCISE_FAMILY_ORDER.flatMap((id) => reviewPromptKeysInFamily(id));
    expect(seen.sort()).toEqual([...REVIEW_PROMPT_KEYS].sort());
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('never lets the label be the answer', () => {
    /*
     * The two rungs where the subject is what is being asked for. "Which note" must not name the
     * note and "Where" must not name the passage, or the card answers itself above the question.
     */
    expect(reviewExerciseFamily('note.recognize').label).toBe('Which note');
    expect(reviewExerciseFamily('verse.locate').label).toBe('Where');
  });

  it('groups the same act across kinds, and keeps different acts apart', () => {
    // Being asked who is in John 3 and who Romans 8:28 is about is the same thing to do.
    expect(reviewExerciseFamilyId('verse.person')).toBe(reviewExerciseFamilyId('chapter.person'));
    expect(reviewExerciseFamilyId('verse.marked')).toBe(reviewExerciseFamilyId('chapter.marked'));
    // Typing a verse out and tapping one of four openings are not.
    expect(reviewExerciseFamilyId('verse.recall')).not.toBe(reviewExerciseFamilyId('verse.recognize'));
  });

  it('says which rungs will want typing, because that is what the label is for', () => {
    expect(reviewExerciseFamily('verse.rebuild').typed).toBe(true);
    expect(reviewExerciseFamily('verse.recall').typed).toBe(true);
    expect(reviewExerciseFamily('verse.initials').typed).toBe(true);
    expect(reviewExerciseFamily('verse.next').typed).toBe(false);
    expect(reviewExerciseFamily('chapter.person').typed).toBe(false);
  });

  it('falls back to a safe word rather than throwing on an unknown key', () => {
    expect(reviewExerciseFamily(null).label.length).toBeGreaterThan(0);
    expect(reviewExerciseFamily('verse.retired' as ReviewPromptKey).label.length).toBeGreaterThan(0);
  });

  it('reads as a different thing from the task, not a repeat of it', () => {
    // "Blanks · Fill in the blanks" is fine; "Blanks · Blanks" would be noise on every row.
    for (const key of REVIEW_PROMPT_KEYS) {
      expect(reviewExerciseFamily(key).label).not.toBe(REVIEW_TASKS[key]);
    }
  });
});
