import { describe, it, expect } from 'vitest';
import {
  ALWAYS_ON_FAMILIES,
  DEFAULT_REVIEW_EXERCISE_SETTINGS,
  familyIsAlwaysOn,
  familyIsOn,
  parseReviewExerciseSettings,
  serializeReviewExerciseSettings,
  skippedKeySet,
  switchableFamilies,
  validateReviewExerciseSettingsInput,
  withFamily,
} from '@/utils/review-exercise-settings';
import { REVIEW_EXERCISE_FAMILY_ORDER } from '@/utils/review-exercise-families';
import {
  CHAPTER_FAMILIES,
  VERSE_FAMILIES,
  NOTE_LADDER,
  chapterFamilyMemberAvailable,
  chapterRungFor,
  verseFamilyMemberAvailable,
  verseRungFor,
  type ReviewPromptKey,
} from '@/utils/review-prompts';
import { resolveNoteRung } from '@/utils/note-ladder-exercises';

describe('reading the stored preference', () => {
  it('treats never having opened the page as wanting everything', () => {
    expect(parseReviewExerciseSettings(null).skip).toEqual([]);
    expect(parseReviewExerciseSettings('').skip).toEqual([]);
  });

  it('treats an unreadable value as wanting everything, rather than breaking Review', () => {
    expect(parseReviewExerciseSettings('not json').skip).toEqual([]);
    expect(parseReviewExerciseSettings('[]').skip).toEqual([]);
    expect(parseReviewExerciseSettings('{"skip":"who"}').skip).toEqual([]);
  });

  it('keeps the keys it knows and drops the rest, rather than rejecting the whole document', () => {
    const parsed = parseReviewExerciseSettings(
      JSON.stringify({ skip: ['verse.theme', 'verse.retired', 42, 'verse.theme'] }),
    );
    expect(parsed.skip).toEqual(['verse.theme']);
  });

  it('will not store a preference against a family that cannot be turned off', () => {
    // Silently dropped, because honouring it is something the engine is entitled to ignore.
    const parsed = parseReviewExerciseSettings(JSON.stringify({ skip: ['note.recognize'] }));
    expect(parsed.skip).toEqual([]);
  });

  it('round-trips', () => {
    const settings = withFamily(DEFAULT_REVIEW_EXERCISE_SETTINGS, 'memory', false);
    expect(parseReviewExerciseSettings(serializeReviewExerciseSettings(settings))).toEqual(settings);
  });

  it('validates a body the same way it reads a column', () => {
    expect(validateReviewExerciseSettingsInput({ skip: ['verse.theme'] })?.skip).toEqual([
      'verse.theme',
    ]);
    expect(validateReviewExerciseSettingsInput(null)).toBeNull();
    expect(validateReviewExerciseSettingsInput({ skip: 'verse.theme' })).toBeNull();
    expect(validateReviewExerciseSettingsInput({ skip: [1, 2] })).toBeNull();
  });
});

describe('turning a family off', () => {
  it('takes every rung in it, so the unit is the one the page offers', () => {
    const off = withFamily(DEFAULT_REVIEW_EXERCISE_SETTINGS, 'who', false);
    expect(off.skip).toContain('verse.person');
    expect(off.skip).toContain('chapter.person');
    expect(familyIsOn(off, 'who')).toBe(false);
    expect(familyIsOn(withFamily(off, 'who', true), 'who')).toBe(true);
  });

  it('refuses the families a step falls back to', () => {
    for (const id of ALWAYS_ON_FAMILIES) {
      expect(familyIsAlwaysOn(id)).toBe(true);
      expect(withFamily(DEFAULT_REVIEW_EXERCISE_SETTINGS, id, false).skip).toEqual([]);
      expect(familyIsOn(withFamily(DEFAULT_REVIEW_EXERCISE_SETTINGS, id, false), id)).toBe(true);
    }
  });

  it('offers every other family as a switch', () => {
    const switchable = switchableFamilies();
    expect(switchable.length).toBe(REVIEW_EXERCISE_FAMILY_ORDER.length - ALWAYS_ON_FAMILIES.length);
    for (const id of switchable) expect(familyIsAlwaysOn(id)).toBe(false);
  });
});

describe('what the engine does with it', () => {
  const everything = {
    citedInNotes: 3,
    themeCount: 3,
    personCount: 3,
    placeCount: 3,
    crossRefCount: 3,
    locateRivals: 9,
    contentWordCount: 12,
    readerSpanWords: 5,
  };

  const skipAll = (keys: readonly ReviewPromptKey[]) => new Set(keys);

  it('walks past a rung the reader turned off', () => {
    const skip = skipAll(['verse.theme']);
    expect(verseFamilyMemberAvailable('verse.theme', { ...everything, skip })).toBe(false);
    expect(verseFamilyMemberAvailable('verse.person', { ...everything, skip })).toBe(true);
  });

  it('still asks something when every member of a step is turned off', () => {
    /*
     * The rule the always-on list exists to keep. A step whose whole family is skipped falls
     * forward to the default rather than resolving to nothing, so the reader is still asked.
     */
    const skip = skipAll(VERSE_FAMILIES[4]);
    const rung = verseRungFor(4, 'item:4', { ...everything, skip });
    expect(VERSE_FAMILIES[4]).toContain(rung.key);
  });

  it('never leaves a verse or chapter step with no rung at all', () => {
    const allVerse = skipAll(VERSE_FAMILIES.flat());
    for (let step = 0; step < 20; step++) {
      expect(verseRungFor(step, `i:${step}`, { ...everything, skip: allVerse }).key).toBeTruthy();
    }
    const allChapter = skipAll(CHAPTER_FAMILIES.flat());
    const chapterMaterial = {
      verseCount: 20,
      finishCandidates: 3,
      personCount: 2,
      placeCount: 2,
      highlightCount: 2,
      skip: allChapter,
    };
    for (let step = 0; step < 12; step++) {
      expect(chapterRungFor(step, `c:${step}`, chapterMaterial).key).toBeTruthy();
    }
    expect(chapterFamilyMemberAvailable('chapter.person', chapterMaterial)).toBe(false);
  });

  it('still asks a note something when every switchable note rung is off', () => {
    // `note.recognize` is always on, which is why a note with a body is always askable.
    const material = {
      canRecognize: true,
      canPassage: true,
      canConnect: true,
      canAnnotation: true,
      skip: skipAll(NOTE_LADDER.filter((key) => key !== 'note.recognize')),
    };
    expect(resolveNoteRung(1, material, 'note:1')).toBe('note.recognize');
  });

  it('hands the engine a plain set, empty for a reader who never opened the page', () => {
    expect(skippedKeySet(DEFAULT_REVIEW_EXERCISE_SETTINGS).size).toBe(0);
    expect(skippedKeySet(withFamily(DEFAULT_REVIEW_EXERCISE_SETTINGS, 'theme', false)).has('verse.theme')).toBe(true);
  });
});
