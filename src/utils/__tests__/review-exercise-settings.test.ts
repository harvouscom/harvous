import { describe, it, expect } from 'vitest';
import {
  ALWAYS_ON_FAMILIES,
  DEFAULT_REVIEW_EXERCISE_SETTINGS,
  emphasisFor,
  emphasisIsOfferable,
  familyIsAlwaysOn,
  offerableFamilies,
  parseReviewExerciseSettings,
  preferredKeySet,
  rungPreferencesFor,
  serializeReviewExerciseSettings,
  skippedKeySet,
  validateReviewExerciseSettingsInput,
  withEmphasis,
  type ReviewExerciseSettings,
} from '@/utils/review-exercise-settings';
import {
  REVIEW_EXERCISE_FAMILY_ORDER,
  reviewPromptKeysInFamily,
  type ReviewExerciseFamilyId,
} from '@/utils/review-exercise-families';
import {
  CHAPTER_FAMILIES,
  VERSE_FAMILIES,
  NOTE_LADDER,
  chapterFamilyMemberAvailable,
  chapterRungFor,
  emphasisDraw,
  verseFamilyMemberAvailable,
  verseRungFor,
  type ReviewPromptKey,
} from '@/utils/review-prompts';
import { resolveNoteRung } from '@/utils/note-ladder-exercises';

const DEFAULT = DEFAULT_REVIEW_EXERCISE_SETTINGS;
const at = (id: ReviewExerciseFamilyId, level: 'more' | 'less', from: ReviewExerciseSettings = DEFAULT) =>
  withEmphasis(from, id, level);

/** Everything a verse, a chapter and a note could be asked, so only a preference decides. */
const verseEverything = {
  citedInNotes: 3,
  themeCount: 3,
  personCount: 3,
  placeCount: 3,
  crossRefCount: 3,
  locateRivals: 9,
  contentWordCount: 12,
  readerSpanWords: 5,
};
const chapterEverything = {
  verseCount: 20,
  finishCandidates: 3,
  personCount: 2,
  placeCount: 2,
  highlightCount: 2,
};
const noteEverything = { canRecognize: true, canPassage: true, canConnect: true, canAnnotation: true };

describe('reading the stored preference', () => {
  it('treats never having opened the page as everything at its ordinary rate', () => {
    expect(parseReviewExerciseSettings(null)).toEqual(DEFAULT);
    expect(parseReviewExerciseSettings('')).toEqual(DEFAULT);
  });

  it('treats an unreadable value as no preferences, rather than breaking Review', () => {
    for (const raw of ['not json', '[]', 'null', '42', '{"skip":"who"}', '{"emphasis":["who"]}']) {
      expect(parseReviewExerciseSettings(raw).emphasis, raw).toEqual({});
    }
  });

  it('keeps the families and values it knows and drops the rest, rather than rejecting the whole document', () => {
    const parsed = parseReviewExerciseSettings(
      JSON.stringify({
        version: 2,
        emphasis: { theme: 'more', who: 'less', retired: 'less', place: 'loud', blanks: 'normal' },
      }),
    );
    expect(parsed.emphasis).toEqual({ theme: 'more', who: 'less' });
  });

  it('will not store emphasis on a family with no control', () => {
    // Silently dropped, because honouring it is something the engine is entitled to ignore.
    for (const id of ALWAYS_ON_FAMILIES) {
      expect(parseReviewExerciseSettings(JSON.stringify({ emphasis: { [id]: 'less' } })).emphasis).toEqual({});
    }
  });

  it('reads the version by shape and never trusts the number', () => {
    expect(
      parseReviewExerciseSettings(JSON.stringify({ version: 1, emphasis: { theme: 'more' } })).emphasis,
    ).toEqual({ theme: 'more' });
    expect(
      parseReviewExerciseSettings(JSON.stringify({ version: 9, skip: reviewPromptKeysInFamily('theme') }))
        .emphasis,
    ).toEqual({ theme: 'less' });
  });

  it('round-trips', () => {
    const settings = at('who', 'less', at('theme', 'more'));
    expect(parseReviewExerciseSettings(serializeReviewExerciseSettings(settings))).toEqual(settings);
  });

  it('validates a body the same way it reads a column', () => {
    expect(validateReviewExerciseSettingsInput({ emphasis: { theme: 'more' } })?.emphasis).toEqual({
      theme: 'more',
    });
    expect(validateReviewExerciseSettingsInput(null)).toBeNull();
    expect(validateReviewExerciseSettingsInput([])).toBeNull();
    expect(validateReviewExerciseSettingsInput({})).toBeNull();
    expect(validateReviewExerciseSettingsInput({ emphasis: 'theme' })).toBeNull();
    expect(validateReviewExerciseSettingsInput({ emphasis: { theme: 2 } })).toBeNull();
    expect(validateReviewExerciseSettingsInput({ skip: [1, 2] })).toBeNull();
  });
});

describe('a version-1 skip-list', () => {
  it('reads a wholly skipped family as Less', () => {
    const v1 = JSON.stringify({ version: 1, skip: reviewPromptKeysInFamily('who') });
    expect(parseReviewExerciseSettings(v1).emphasis).toEqual({ who: 'less' });
  });

  it('is lossless: Less resolves to exactly the skip set it was read from', () => {
    // The non-regression that matters. If Less were a softer lean than "off" was, every migrated
    // reader's preference would quietly weaken.
    for (const id of offerableFamilies()) {
      const keys = reviewPromptKeysInFamily(id);
      const settings = parseReviewExerciseSettings(JSON.stringify({ version: 1, skip: keys }));
      expect([...skippedKeySet(settings)].sort(), id).toEqual([...keys].sort());
    }
  });

  it('drops a family whose old switch never changed how often it was asked', () => {
    const v1 = JSON.stringify({
      version: 1,
      skip: [...reviewPromptKeysInFamily('memory'), ...reviewPromptKeysInFamily('next')],
    });
    expect(parseReviewExerciseSettings(v1).emphasis).toEqual({});
  });

  it('leaves a partly skipped family Normal, because the page never wrote one', () => {
    const v1 = JSON.stringify({ version: 1, skip: ['verse.person'] });
    expect(emphasisFor(parseReviewExerciseSettings(v1), 'who')).toBe('normal');
  });

  it('is still accepted from a tab running the switch-era page', () => {
    expect(
      validateReviewExerciseSettingsInput({ skip: reviewPromptKeysInFamily('theme') })?.emphasis,
    ).toEqual({ theme: 'less' });
  });
});

describe('the stored document, read by code that only knows version 1', () => {
  // A rollback, or a stale deploy, reads `skip` and nothing else.
  const readAsV1 = (serialized: string) => (JSON.parse(serialized) as { skip?: unknown }).skip;

  it('still carries Less as the skip-list it always was', () => {
    const settings = at('theme', 'more', at('who', 'less'));
    expect(readAsV1(serializeReviewExerciseSettings(settings))).toEqual(
      [...reviewPromptKeysInFamily('who')].sort(),
    );
  });

  it('never lets More leak into it as something to skip', () => {
    expect(readAsV1(serializeReviewExerciseSettings(at('theme', 'more')))).toEqual([]);
  });
});

describe('setting a family', () => {
  it('takes every rung in it, so the unit is the one the page offers', () => {
    expect(skippedKeySet(at('who', 'less'))).toEqual(new Set(['verse.person', 'chapter.person']));
    expect(preferredKeySet(at('who', 'more'))).toEqual(new Set(['verse.person', 'chapter.person']));
    expect(skippedKeySet(at('who', 'more')).size).toBe(0);
  });

  it('stores Normal as nothing at all', () => {
    expect(withEmphasis(at('who', 'less'), 'who', 'normal').emphasis).toEqual({});
  });

  it('refuses a family with no control, and reports it Normal', () => {
    for (const id of ALWAYS_ON_FAMILIES) {
      expect(withEmphasis(DEFAULT, id, 'less')).toBe(DEFAULT);
      expect(emphasisFor(DEFAULT, id)).toBe('normal');
      expect(familyIsAlwaysOn(id)).toBe(true);
    }
  });

  it('offers every other family', () => {
    const offered = offerableFamilies();
    expect(offered.length).toBe(REVIEW_EXERCISE_FAMILY_ORDER.length - ALWAYS_ON_FAMILIES.length);
    for (const id of offered) expect(emphasisIsOfferable(id)).toBe(true);
  });

  it('never changes the settings it was handed', () => {
    const before = at('theme', 'more');
    const snapshot = JSON.stringify(before);
    withEmphasis(before, 'theme', 'less');
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe('what the engine does with Less', () => {
  const lessOf = (...ids: ReviewExerciseFamilyId[]) =>
    ids.reduce<ReviewExerciseSettings>((settings, id) => at(id, 'less', settings), DEFAULT);

  it('walks past a family set to Less', () => {
    const { skip } = rungPreferencesFor(lessOf('theme'));
    expect(verseFamilyMemberAvailable('verse.theme', { ...verseEverything, skip })).toBe(false);
    expect(verseFamilyMemberAvailable('verse.person', { ...verseEverything, skip })).toBe(true);
  });

  it('still asks something when every member of a step is skipped', () => {
    const skip = new Set<ReviewPromptKey>(VERSE_FAMILIES[4]);
    expect(VERSE_FAMILIES[4]).toContain(verseRungFor(4, 'item:4', { ...verseEverything, skip }).key);
  });

  it('never leaves a verse or chapter step with no rung at all', () => {
    const allVerse = new Set<ReviewPromptKey>(VERSE_FAMILIES.flat());
    for (let step = 0; step < 20; step++) {
      expect(verseRungFor(step, `i:${step}`, { ...verseEverything, skip: allVerse }).key).toBeTruthy();
    }
    const chapterMaterial = { ...chapterEverything, skip: new Set<ReviewPromptKey>(CHAPTER_FAMILIES.flat()) };
    for (let step = 0; step < 12; step++) {
      expect(chapterRungFor(step, `c:${step}`, chapterMaterial).key).toBeTruthy();
    }
    expect(chapterFamilyMemberAvailable('chapter.person', chapterMaterial)).toBe(false);
  });

  it('still asks a note something when every note family is Less', () => {
    // `note` has a control now. The walk's second pass is what keeps a note askable, not a
    // family that cannot be leaned away from.
    const material = { ...noteEverything, ...rungPreferencesFor(lessOf('note', 'cited', 'linked')) };
    for (let step = 0; step < NOTE_LADDER.length; step++) {
      expect(resolveNoteRung(step, material, `note:${step}`)).toBeTruthy();
    }
  });

  it('hands the engine plain sets, empty for a reader who never opened the page', () => {
    const none = rungPreferencesFor(DEFAULT);
    expect(none.skip.size).toBe(0);
    expect(none.prefer.size).toBe(0);
  });
});

describe('what the engine does with More', () => {
  it('draws exactly as before for a reader with no preferences', () => {
    // Identity, not equality: no preference means the list, the reveal and the grader resolve the
    // very rung they always did.
    for (const members of VERSE_FAMILIES) expect(emphasisDraw(members, new Set())).toBe(members);
    expect(emphasisDraw(NOTE_LADDER)).toBe(NOTE_LADDER);
  });

  it('is a weight, never an order: every sibling keeps its slot', () => {
    const draw = emphasisDraw(VERSE_FAMILIES[4], new Set<ReviewPromptKey>(['verse.theme']));
    for (const key of VERSE_FAMILIES[4]) expect(draw).toContain(key);
    expect(draw.filter((key) => key === 'verse.theme')).toHaveLength(2);
  });

  it('cancels out when every member is preferred', () => {
    expect(emphasisDraw(VERSE_FAMILIES[4], new Set<ReviewPromptKey>(VERSE_FAMILIES[4]))).toBe(
      VERSE_FAMILIES[4],
    );
  });

  it('never makes a rung unreachable, whichever family is set to More', () => {
    /*
     * The back-door allow-list this file refuses. Ordering a preferred family first would pass
     * every other test here and still take the rest of a step away from every verse that could be
     * asked the preferred one.
     */
    const reachable = (prefer?: ReadonlySet<ReviewPromptKey>) => {
      const out = new Set<ReviewPromptKey | null>();
      for (let n = 0; n < 120; n++) {
        for (let step = 0; step < VERSE_FAMILIES.length; step++) {
          out.add(verseRungFor(step, `v:${n}`, { ...verseEverything, prefer }).key);
        }
        for (let step = 0; step < CHAPTER_FAMILIES.length; step++) {
          out.add(chapterRungFor(step, `c:${n}`, { ...chapterEverything, prefer }).key);
        }
        for (let step = 0; step < NOTE_LADDER.length; step++) {
          out.add(resolveNoteRung(step, { ...noteEverything, prefer }, `n:${n}`));
        }
      }
      return out;
    };
    const baseline = reachable();
    for (const id of offerableFamilies()) {
      const withMore = reachable(preferredKeySet(at(id, 'more')));
      for (const key of baseline) expect(withMore.has(key), `More ${id} lost ${key}`).toBe(true);
    }
  });
});
