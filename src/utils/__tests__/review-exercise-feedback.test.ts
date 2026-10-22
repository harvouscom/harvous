import { describe, expect, it } from 'vitest';
import {
  REVIEW_DISLIKE_THRESHOLD,
  REVIEW_DISLIKE_WINDOW_DAYS,
  describeDislike,
  dislikedRungsBySubject,
  mergeRungPreferences,
  noteDislikeSubjectKey,
  passageDislikeSubjectKey,
  quietedFamilies,
  quietedKeySet,
  reviewDislikeWindowStart,
  withSubjectDislikes,
  type ReviewDislikeRow,
  type ReviewDislikeSubjectRow,
} from '@/utils/review-exercise-feedback';
import { ALWAYS_ON_FAMILIES } from '@/utils/review-exercise-settings';
import { reviewPromptKeysInFamily } from '@/utils/review-exercise-families';
import {
  VERSE_FAMILIES,
  VERSE_FLOOR_KEY,
  chapterRungFor,
  verseRungFor,
  type ReviewPromptKey,
} from '@/utils/review-prompts';
import { resolveNoteRung } from '@/utils/note-ladder-exercises';

/** `verse.rebuild` is in the `blanks` family, which Settings offers More and Less on. */
const BLANKS = 'verse.rebuild';
/** `verse.altered` is in `changed`, the only exercise on its step, so Settings has no control for it. */
const ALWAYS_ON = 'verse.altered';

const rows = (rungKey: string, itemIds: string[]): ReviewDislikeRow[] =>
  itemIds.map((reviewItemId) => ({ reviewItemId, rungKey }));

describe('quieting a family takes three separate items', () => {
  it('does not quiet a family thumbed down three times on one item', () => {
    // One passage asked badly is a complaint about the passage, not about the kind of question.
    expect(quietedFamilies(rows(BLANKS, ['a', 'a', 'a'])).size).toBe(0);
  });

  it('quiets a family once three distinct items have been thumbed down', () => {
    expect([...quietedFamilies(rows(BLANKS, ['a', 'b', 'c']))]).toEqual(['blanks']);
  });

  it('holds off at one item short of the threshold', () => {
    const short = rows(BLANKS, ['a', 'b']);
    expect(short).toHaveLength(REVIEW_DISLIKE_THRESHOLD - 1);
    expect(quietedFamilies(short).size).toBe(0);
  });

  it('ignores rows whose rung was never recorded', () => {
    const nulls: ReviewDislikeRow[] = ['a', 'b', 'c'].map((reviewItemId) => ({
      reviewItemId,
      rungKey: null,
    }));
    expect(quietedFamilies(nulls).size).toBe(0);
  });

  it('counts each family separately rather than pooling dislikes', () => {
    const mixed = [...rows(BLANKS, ['a', 'b']), ...rows('verse.locate', ['c'])];
    expect(quietedFamilies(mixed).size).toBe(0);
  });
});

describe('a family with no control in Settings', () => {
  it('is still quieted, because walking past is always safe', () => {
    // A reason to walk past is never a reason to return nothing: where the step has nothing
    // else to ask, the fall-forward hands the family back.
    expect([...quietedFamilies(rows(ALWAYS_ON, ['a', 'b', 'c']))]).toEqual(['changed']);
  });

  it('is never offered as a setting, because there is no control to offer', () => {
    const { family, offerSettings } = describeDislike(ALWAYS_ON, rows(ALWAYS_ON, ['a', 'b', 'c']));
    expect(ALWAYS_ON_FAMILIES).toContain(family);
    expect(offerSettings).toBe(false);
  });
});

describe('the settings offer', () => {
  it('is made on the vote that reaches the threshold', () => {
    expect(describeDislike(BLANKS, rows(BLANKS, ['a', 'b', 'c'])).offerSettings).toBe(true);
  });

  it('is not repeated on the fourth', () => {
    // An offer repeated is a nag, and the reader has already been shown where the switch is.
    expect(describeDislike(BLANKS, rows(BLANKS, ['a', 'b', 'c', 'd'])).offerSettings).toBe(false);
  });

  it('is not made before the threshold', () => {
    expect(describeDislike(BLANKS, rows(BLANKS, ['a', 'b'])).offerSettings).toBe(false);
  });
});

describe('a vote on an item that was never asked', () => {
  /*
   * Found by testing the live endpoint. An item with no `lastRungKey` writes a row with a null
   * rung, and the tally skips those — but the family lookup falls back to `opening`, so the
   * response used to name a family the vote had not been filed under.
   */
  it('names no family, because it was counted toward none', () => {
    expect(describeDislike(null, rows(BLANKS, ['a', 'b']))).toEqual({
      family: null,
      offerSettings: false,
    });
  });

  it('cannot reach the threshold, however many are cast', () => {
    const nulls: ReviewDislikeRow[] = ['a', 'b', 'c', 'd'].map((reviewItemId) => ({
      reviewItemId,
      rungKey: null,
    }));
    expect(describeDislike(null, nulls).offerSettings).toBe(false);
    expect(quietedFamilies(nulls).size).toBe(0);
  });
});

describe('the key set handed to the rung walk', () => {
  it('covers every rung in a quieted family, not just the one thumbed down', () => {
    const keys = quietedKeySet(rows(BLANKS, ['a', 'b', 'c']));
    for (const key of reviewPromptKeysInFamily('blanks')) expect(keys.has(key)).toBe(true);
  });

  it('is empty when nothing has reached the threshold', () => {
    expect(quietedKeySet(rows(BLANKS, ['a'])).size).toBe(0);
  });
});

describe('the window', () => {
  it('opens exactly REVIEW_DISLIKE_WINDOW_DAYS before now', () => {
    const now = new Date('2026-09-10T12:00:00.000Z');
    const start = reviewDislikeWindowStart(now);
    const days = (now.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
    expect(days).toBe(REVIEW_DISLIKE_WINDOW_DAYS);
  });
});

describe("folding dislikes into the reader's emphasis", () => {
  const none = { skip: new Set<ReviewPromptKey>(), prefer: new Set<ReviewPromptKey>() };
  const three = rows(BLANKS, ['a', 'b', 'c']);

  it('adds a quieted family to what the walk passes', () => {
    const merged = mergeRungPreferences(none, three);
    for (const key of reviewPromptKeysInFamily('blanks')) expect(merged.skip.has(key)).toBe(true);
  });

  it('never makes anything preferred, because a dislike is not a choice', () => {
    expect(mergeRungPreferences(none, three).prefer.size).toBe(0);
  });

  it('lets an explicit More outrank an inferred less', () => {
    const more = { skip: new Set<ReviewPromptKey>(), prefer: new Set(reviewPromptKeysInFamily('blanks')) };
    const merged = mergeRungPreferences(more, three);
    expect(merged.skip.has(BLANKS)).toBe(false);
    expect(merged.prefer.has(BLANKS)).toBe(true);
  });

  it("returns the reader's own choice untouched below the threshold", () => {
    const own = { skip: new Set<ReviewPromptKey>(['verse.theme']), prefer: new Set<ReviewPromptKey>() };
    expect(mergeRungPreferences(own, rows(BLANKS, ['a', 'b']))).toBe(own);
  });
});

describe('a rung Review no longer asks', () => {
  it('names no family, rather than the fallback it would otherwise be filed under', () => {
    // An item last answered on the retired folder question, disliked after the deploy.
    const rows = ['a', 'b', 'c'].map((id) => ({ reviewItemId: id, rungKey: 'note.folder' }));
    expect(describeDislike('note.folder', rows)).toEqual({ family: null, offerSettings: false });
  });
});

describe('not this, here: a dislike on one item', () => {
  const subjectRow = (
    rungKey: string | null,
    subject: { noteId?: string; scriptureReference?: string },
    reviewItemId = 'item',
  ): ReviewDislikeSubjectRow => ({
    reviewItemId,
    rungKey,
    noteId: subject.noteId ?? null,
    scriptureReference: subject.scriptureReference ?? null,
  });
  const none = { skip: new Set<ReviewPromptKey>(), prefer: new Set<ReviewPromptKey>() };
  const prefsFor = (keys: ReviewPromptKey[]) => withSubjectDislikes(none, new Set(keys));

  it('is filed under the note for a note rung and the passage for a passage rung', () => {
    const map = dislikedRungsBySubject([
      subjectRow('note.passage', { noteId: 'n1' }),
      subjectRow('verse.rebuild', { scriptureReference: ' John 15:5 ' }),
      subjectRow('chapter.order', { scriptureReference: 'Psalm 23' }),
    ]);
    expect([...(map.get(noteDislikeSubjectKey('n1')) ?? [])]).toEqual(['note.passage']);
    // The reference is matched as the item stores it, give or take case and whitespace.
    expect([...(map.get(passageDislikeSubjectKey('john 15:5')) ?? [])]).toEqual(['verse.rebuild']);
    expect([...(map.get(passageDislikeSubjectKey('Psalm 23')) ?? [])]).toEqual(['chapter.order']);
  });

  it('counts from the first vote, on one item, with no threshold', () => {
    // The family tally waits for three items; this is about the one the reader just answered.
    const map = dislikedRungsBySubject([subjectRow(BLANKS, { scriptureReference: 'John 15:5' })]);
    expect(map.get(passageDislikeSubjectKey('John 15:5'))?.has(BLANKS)).toBe(true);
    expect(quietedFamilies(rows(BLANKS, ['item'])).size).toBe(0);
  });

  it('files nothing for a vote with no rung, a retired rung, or nothing to file it under', () => {
    const map = dislikedRungsBySubject([
      subjectRow(null, { noteId: 'n1' }),
      subjectRow('note.folder', { noteId: 'n1' }),
      subjectRow('note.passage', {}),
      subjectRow('verse.rebuild', { scriptureReference: '  ' }),
    ]);
    expect(map.size).toBe(0);
  });

  it("hands back the reader's own preferences untouched when there is nothing to fold", () => {
    expect(withSubjectDislikes(none, undefined)).toBe(none);
    expect(withSubjectDislikes(none, new Set())).toBe(none);
  });

  it('outranks an explicit More, which is about every passage and not this one', () => {
    const more = { skip: new Set<ReviewPromptKey>(), prefer: new Set<ReviewPromptKey>([BLANKS]) };
    const folded = withSubjectDislikes(more, new Set<ReviewPromptKey>([BLANKS]));
    expect(folded.skip.has(BLANKS)).toBe(true);
    expect(folded.avoid?.has(BLANKS)).toBe(true);
    // Still preferred everywhere else: nothing about the reader's choice is rewritten.
    expect(folded.prefer).toBe(more.prefer);
  });

  describe('on a verse', () => {
    const verse = {
      citedInNotes: 2,
      themeCount: 2,
      personCount: 2,
      crossRefCount: 2,
      contentWordCount: 12,
      locateRivals: 5,
    };
    const seeds = Array.from({ length: 24 }, (_, i) => `review_x:${i}`);

    it('walks to the family sibling, for every seed', () => {
      for (const seed of seeds) {
        expect(verseRungFor(1, seed, { ...verse, ...prefsFor([BLANKS]) }).key).toBe('verse.initials');
      }
    });

    it('steps down to the floor where the family has no one else to ask', () => {
      // Family 7 is `verse.altered` alone. The reader's Less leaves it be; a dislike here does not.
      const altered = VERSE_FAMILIES.findIndex((family) => family.length === 1 && family[0] === ALWAYS_ON);
      expect(altered).toBeGreaterThan(-1);
      expect(verseRungFor(altered, seeds[0], verse).key).toBe(ALWAYS_ON);
      const less = { skip: new Set<ReviewPromptKey>([ALWAYS_ON]), prefer: new Set<ReviewPromptKey>() };
      expect(verseRungFor(altered, seeds[0], { ...verse, ...less }).key).toBe(ALWAYS_ON);
      expect(verseRungFor(altered, seeds[0], { ...verse, ...prefsFor([ALWAYS_ON]) }).key).toBe(VERSE_FLOOR_KEY);
    });

    it("steps down to the floor where the sibling can't be built", () => {
      // Three content words: too few for initials, so rebuild was the only member.
      const short = { ...verse, contentWordCount: 3 };
      expect(verseRungFor(1, seeds[0], short).key).toBe(BLANKS);
      expect(verseRungFor(1, seeds[0], { ...short, ...prefsFor([BLANKS]) }).key).toBe(VERSE_FLOOR_KEY);
    });

    it('still asks something when the floor is the thing they disliked', () => {
      expect(verseRungFor(0, seeds[0], { ...verse, ...prefsFor([VERSE_FLOOR_KEY]) }).key).toBe(VERSE_FLOOR_KEY);
    });
  });

  describe('on a chapter', () => {
    const chapter = { verseCount: 36, finishCandidates: 20, personCount: 3, placeCount: 0 };

    it('walks past it inside the family', () => {
      for (let i = 0; i < 12; i++) {
        expect(chapterRungFor(2, `c:${i}`, { ...chapter, ...prefsFor(['chapter.order']) }).key).toBe('chapter.person');
      }
    });

    it('walks past it on the floor too, and asks it only when there is nothing else', () => {
      // Family 1 is verse-level questions; a chapter that was only read has none and falls to the floor.
      const onlyRead = { ...chapter, finishCandidates: 0, engagedCount: 0, markedAnswerable: 0 };
      expect(chapterRungFor(1, 'c', onlyRead).key).toBe('chapter.order');
      expect(chapterRungFor(1, 'c', { ...onlyRead, ...prefsFor(['chapter.order']) }).key).toBe('chapter.person');
      const nobody = { ...onlyRead, personCount: 0 };
      expect(chapterRungFor(1, 'c', { ...nobody, ...prefsFor(['chapter.order']) }).key).toBe('chapter.order');
    });
  });

  describe('on a note', () => {
    it('asks the other rung, for every seed', () => {
      const both = { canPassage: true, canConnect: true, canTakeaway: false };
      for (let i = 0; i < 12; i++) {
        expect(resolveNoteRung(i % 3, { ...both, ...prefsFor(['note.passage']) }, `n:${i}`)).toBe('note.connect');
      }
    });

    it('still asks the one rung a note has, rather than nothing', () => {
      const onlyPassage = { canPassage: true, canConnect: false, canTakeaway: false };
      expect(resolveNoteRung(0, { ...onlyPassage, ...prefsFor(['note.passage']) }, 'n')).toBe('note.passage');
    });
  });
});
