import { describe, it, expect } from 'vitest';
import { REVIEW_ASKABLE_KINDS, REVIEW_ITEM_KINDS, isReviewAskableKind } from '../review-item-kinds';
import { rungIdentityIsTheAnswer } from '../review-row-subtitle';
import {
  NOTE_LADDER,
  NOTE_LADDER_MAX_STEP,
  REVIEW_PROMPTS,
  REVIEW_PROMPT_KEYS,
  VERSE_LADDER,
  VERSE_LADDER_MAX_STEP,
  fillReviewPrompt,
  ladderMaxStepFor,
  nextLadderStep,
  pickPromptKey,
  reviewPromptFor,
  VERSE_NEXT_STEP,
  reviewRungIsGraded,
  VERSE_SEQUENCE_STEP,
  VERSE_LOCATE_STEP,
  VERSE_MAINTENANCE,
  verseRungFor,
  reviewTaskFor,
  VERSE_FAMILIES,
  VERSE_MAINTENANCE_FAMILIES,
  CHAPTER_FAMILIES,
  REVIEW_TASKS,
  CHAPTER_LADDER_MAX_STEP,
  chapterRungFor,
} from '../review-prompts';

const CTX = {
  reference: 'Romans 8:15',
  noteTitle: 'Adoption, not slavery',
  secondaryNoteTitle: 'Abba in Galatians',
  threadTitle: 'Covenant',
  cue: 'you did not receive',
};

describe('REVIEW_PROMPTS', () => {
  it('has an entry for every declared key', () => {
    for (const key of REVIEW_PROMPT_KEYS) {
      expect(typeof REVIEW_PROMPTS[key]).toBe('function');
    }
  });

  it('renders a real sentence for every key, with no placeholders left in', () => {
    for (const key of REVIEW_PROMPT_KEYS) {
      const text = fillReviewPrompt(key, CTX);
      expect(text.length).toBeGreaterThan(10);
      expect(text).not.toMatch(/\{|\}|undefined|null/);
    }
  });

  it('still reads as a sentence when nothing is known about the source', () => {
    for (const key of REVIEW_PROMPT_KEYS) {
      const text = fillReviewPrompt(key, {});
      expect(text).not.toMatch(/undefined|null/);
      expect(text.trim()).not.toBe('');
    }
  });


  it('gives an instruction rather than asking a question', () => {
    /*
     * A review is a thing to do. Phrasing it as a question made the app sound like it was
     * wondering aloud — "What comes after John 15:5?" — where "Pick the verse that follows"
     * says what the reader is being asked for.
     */
    for (const key of REVIEW_PROMPT_KEYS) {
      const text = fillReviewPrompt(key, CTX);
      expect(text.endsWith('.')).toBe(true);
      expect(text).not.toContain('?');
    }
  });

  it('never splices a bare "this" into a slot that wanted a name', () => {
    /*
     * The old fallback dropped the word into a slot built for a proper name: "your this Thread",
     * "You marked this in this." Written-out bare forms are the fix, so what this guards is the
     * shape of a splice — a possessive or preposition with "this" where a name belongs — not the
     * word itself, which is fine English in "Pick the note this line is from."
     */
    for (const key of REVIEW_PROMPT_KEYS) {
      const bare = fillReviewPrompt(key, {});
      // A possessive followed by the fallback: "your this Thread".
      expect(bare).not.toMatch(/\byour this\b/);
      // The word twice in one instruction: "You marked this in this." One is fine English —
      // "this verse", "this Thread" — and is what the written-out bare forms use.
      expect((bare.match(/\bthis\b/g) ?? []).length).toBeLessThanOrEqual(1);
    }
  });

  it('gives every key a task with no subject in it', () => {
    /*
     * The task sits under a title that already names the verse or the note, so a reference in
     * the task would print the same thing twice.
     */
    for (const key of REVIEW_PROMPT_KEYS) {
      const task = reviewTaskFor(key);
      expect(task.length).toBeGreaterThan(4);
      expect(task).not.toMatch(/\d+:\d+/);
      expect(task.endsWith('.')).toBe(false);
    }
  });
});

describe('pickPromptKey', () => {

  it('is deterministic for the same review count', () => {
    expect(pickPromptKey('note', 4)).toBe(pickPromptKey('note', 4));
  });


  it('walks the verse ladder by step, not by review count', () => {
    expect(pickPromptKey('verse', 99, 0)).toBe(VERSE_LADDER[0]);
    expect(pickPromptKey('verse', 0, 2)).toBe(VERSE_LADDER[2]);
  });

  it('wraps a verse past the top rung and clamps it below the first', () => {
    // Past the top the ladder cycles into maintenance rather than stopping — see the wrap
    // tests below. Below zero there is nowhere to go but the first rung.
    expect(pickPromptKey('verse', 0, VERSE_LADDER.length)).toBe(VERSE_MAINTENANCE[0]);
    expect(pickPromptKey('verse', 0, -3)).toBe(VERSE_LADDER[0]);
  });
});

describe('reviewPromptFor', () => {

  it('tolerates a null ladder step', () => {
    const result = reviewPromptFor({ kind: 'verse', reviewCount: 0, ladderStep: null }, CTX);
    expect(result.key).toBe(VERSE_LADDER[0]);
  });
});

describe('a fresh queue does not ask the same question three times', () => {



  it('picks a rung by ladder position, not by how many times it has come round', () => {
    expect(pickPromptKey('verse', 5, 2, 'review_v')).toBe(VERSE_LADDER[2]);
    expect(pickPromptKey('note', 5, 1, 'review_n')).toBe(NOTE_LADDER[1]);
  });
});

describe('the note ladder', () => {
  it('has dropped the five reflective prompts entirely', () => {
    /*
     * They moved to Home as an invitation to mark a note. Asserted rather than assumed, because
     * leaving one behind would mean two surfaces asking the same question in different voices.
     */
    for (const gone of ['note.observe', 'note.central', 'note.carry', 'note.phrase', 'note.unclear']) {
      expect(REVIEW_PROMPT_KEYS).not.toContain(gone);
    }
  });

  it('climbs by rung, not by how many times it has come round', () => {
    expect(pickPromptKey('note', 0, 0)).toBe('note.recognize');
    expect(pickPromptKey('note', 0, 1)).toBe('note.passage');
    expect(pickPromptKey('note', 0, 2)).toBe('note.connect');
    // Review count is irrelevant now — the rung is the question.
    expect(pickPromptKey('note', 47, 0)).toBe('note.recognize');
  });

  it('clamps at the top rather than falling off it', () => {
    expect(pickPromptKey('note', 0, 99)).toBe('note.annotation');
    expect(pickPromptKey('note', 0, -3)).toBe('note.recognize');
  });

  it('instructs rather than asking about motive', () => {
    for (const key of NOTE_LADDER) {
      const rendered = fillReviewPrompt(key, {});
      expect(rendered).toMatch(/\.$/);
      // No "why did you", no "what made you" — those are the ones that left.
      expect(rendered).not.toMatch(/why did you|what made you|clearer/i);
    }
  });

  it('never names the note on the rung whose answer is the note', () => {
    const named = fillReviewPrompt('note.recognize', { noteTitle: 'Adoption, not slavery' });
    expect(named).not.toContain('Adoption');
  });

  it('every rung of every ladder has a prompt behind it', () => {
    for (const key of [...NOTE_LADDER, ...VERSE_LADDER]) {
      expect(REVIEW_PROMPTS[key]).toBeTypeOf('function');
    }
  });
});

describe('ladder advancement', () => {
  it('advances the kinds that climb and leaves the rest alone', () => {
    expect(nextLadderStep('note', 0)).toBe(1);
    expect(nextLadderStep('verse', 0)).toBe(1);
    expect(nextLadderStep('connection', 0)).toBe(0);
    expect(nextLadderStep('thread', 5)).toBe(5);
  });

  it('stops a note at its top rung, and lets a verse carry on', () => {
    /*
     * The note ladder ends: its three rungs are everything the app can ask about a note. The
     * verse ladder does not, because a memorised verse still needs keeping.
     */
    expect(nextLadderStep('note', NOTE_LADDER_MAX_STEP)).toBe(NOTE_LADDER_MAX_STEP);
    expect(nextLadderStep('verse', VERSE_LADDER_MAX_STEP)).toBe(VERSE_LADDER_MAX_STEP + 1);
  });

  it('knows which kinds have a ladder at all', () => {
    expect(ladderMaxStepFor('note')).toBe(NOTE_LADDER_MAX_STEP);
    expect(ladderMaxStepFor('verse')).toBe(VERSE_LADDER_MAX_STEP);
    expect(ladderMaxStepFor('highlight')).toBeNull();
  });
});

describe('the verse ladder after "what comes next" arrived', () => {
  it('has dropped the open contextualize rung, which the graded one replaced', () => {
    expect(REVIEW_PROMPT_KEYS).not.toContain('verse.contextualize');
    expect(VERSE_LADDER[VERSE_NEXT_STEP]).toBe('verse.next');
  });

  it('does not ask two rungs the same question in different words', () => {
    /*
     * Both rungs put openings on screen, so their questions have to be unmistakably different:
     * one asks which opening belongs to this reference, the other which verse comes after it.
     * `verse.recognize` used to say "Finish…", which was the same words as the rung that
     * actually finishes a verse — and it asked for production while marking nothing.
     */
    const recognize = fillReviewPrompt('verse.recognize', { reference: 'John 15:5' });
    const next = fillReviewPrompt('verse.next', { reference: 'John 15:5' });
    expect(recognize).toContain('begins');
    expect(next).toContain('follows');
    expect(recognize).not.toContain('follows');
    expect(next).not.toContain('begins');
  });

  it('knows which rungs the server marks, so three surfaces cannot disagree', () => {
    expect(reviewRungIsGraded({ kind: 'verse', ladderStep: VERSE_NEXT_STEP })).toBe(true);
    expect(reviewRungIsGraded({ kind: 'verse', ladderStep: VERSE_SEQUENCE_STEP })).toBe(true);
    expect(reviewRungIsGraded({ kind: 'verse', ladderStep: VERSE_LOCATE_STEP })).toBe(true);
    /*
     * Every verse rung is marked now. The last two open ones asked the reader to write the
     * verse out and then judge themselves, which put the strongest exercise in the feature
     * behind the weakest feedback — and rung 0 is the first thing anyone ever sees.
     */
    expect(reviewRungIsGraded({ kind: 'verse', ladderStep: 0 })).toBe(true);
    expect(reviewRungIsGraded({ kind: 'verse', ladderStep: 2 })).toBe(true);
    expect(reviewRungIsGraded({ kind: 'verse', ladderStep: 4 })).toBe(true);
    // Every note rung is a multiple choice.
    expect(reviewRungIsGraded({ kind: 'note', ladderStep: 2 })).toBe(true);
    expect(reviewRungIsGraded({ kind: 'thread', ladderStep: 0 })).toBe(false);
  });
});

describe('the ladder wraps rather than ending', () => {
  /*
   * The top rung used to be terminal: a verse someone had worked all the way up asked "where is
   * this from?" every time it came round, forever, so the passage they knew best was the one
   * the app had nothing left to say about.
   */
  it('keeps climbing past the top instead of clamping', () => {
    expect(nextLadderStep('verse', VERSE_LADDER_MAX_STEP)).toBe(VERSE_LADDER_MAX_STEP + 1);
    expect(nextLadderStep('verse', 47)).toBe(48);
  });

  it('cycles the rungs worth repeating, and only those', () => {
    const first = VERSE_LADDER.length;
    const cycle = VERSE_MAINTENANCE.map((_, i) => verseRungFor(first + i).key);
    expect(cycle).toEqual([...VERSE_MAINTENANCE]);
    // Learning rungs do not come back: "what does this verse say?" of something memorised
    // months ago is a question with no work in it.
    expect(VERSE_MAINTENANCE).not.toContain('verse.recognize');
    expect(VERSE_MAINTENANCE).not.toContain('verse.recall');
  });

  it('raises the pass each time round, and never before', () => {
    const first = VERSE_LADDER.length;
    for (let i = 0; i < VERSE_MAINTENANCE.length; i++) {
      expect(verseRungFor(first + i).pass).toBe(1);
    }
    expect(verseRungFor(first + VERSE_MAINTENANCE.length).pass).toBe(2);
    expect(verseRungFor(first + VERSE_MAINTENANCE.length * 3).pass).toBe(4);
    // Still climbing: pass 0 is the ladder itself.
    for (let step = 0; step <= VERSE_LADDER_MAX_STEP; step++) {
      expect(verseRungFor(step).pass).toBe(0);
    }
  });

  it('asks the same rung the same way whether climbing or maintaining', () => {
    // A maintenance `locate` is a locate: graded, and it still hides the reference.
    const maintenanceLocate = VERSE_LADDER.length + VERSE_MAINTENANCE.indexOf('verse.locate');
    expect(verseRungFor(maintenanceLocate).key).toBe('verse.locate');
    expect(reviewRungIsGraded({ kind: 'verse', ladderStep: maintenanceLocate })).toBe(true);
    // Rebuild is graded now: its gaps are the question, and the words that fill them are the
    // answer. It was the one rung whose exercise the dock never rendered.
    const maintenanceRebuild = VERSE_LADDER.length + VERSE_MAINTENANCE.indexOf('verse.rebuild');
    expect(reviewRungIsGraded({ kind: 'verse', ladderStep: maintenanceRebuild })).toBe(true);
    // Recall — write the whole verse from memory — is marked too, forgivingly: the content
    // words, in order, with case, punctuation and the small words all forgiven.
    const recall = VERSE_LADDER.indexOf('verse.recall');
    expect(reviewRungIsGraded({ kind: 'verse', ladderStep: recall })).toBe(true);
  });

  it('tolerates a nonsense step', () => {
    expect(verseRungFor(-4).key).toBe(VERSE_LADDER[0]);
    expect(verseRungFor(Number.NaN).key).toBe(VERSE_LADDER[0]);
    expect(verseRungFor(1e6).pass).toBeGreaterThan(0);
  });
});

describe('the kinds Review no longer asks about', () => {
  it('has no question left for a highlight, a connection or a Thread', () => {
    /*
     * They asked open questions — "why did you connect these?" — which is the shape the note
     * prompts were retired for. Worth asking, not worth marking, and a queue that mixes things
     * you can be right about with things you cannot is not a review. They are Home suggestions.
     */
    for (const key of REVIEW_PROMPT_KEYS) {
      expect(key.startsWith('highlight.')).toBe(false);
      expect(key.startsWith('connection.')).toBe(false);
      expect(key.startsWith('thread.')).toBe(false);
    }
  });

  it('keeps every remaining key in a verse family or on the note ladder', () => {
    // A step is a family now; a key that belongs to none of them can never be reached.
    const reachable = new Set([...NOTE_LADDER, ...VERSE_FAMILIES.flat(), ...CHAPTER_FAMILIES.flat()]);
    for (const key of REVIEW_PROMPT_KEYS) expect(reachable.has(key)).toBe(true);
  });

  it('still names the retired kinds, because rows for them exist', () => {
    // What may be *created* narrowed; what may be *read* did not, or old rows would break.
    expect(REVIEW_ITEM_KINDS).toContain('thread');
    expect(REVIEW_ASKABLE_KINDS).toEqual(['note', 'verse', 'chapter']);
    expect(isReviewAskableKind('thread')).toBe(false);
    expect(isReviewAskableKind('verse')).toBe(true);
  });
});

describe('rung families', () => {
  const rich = { citedInNotes: 2, themeCount: 3, personCount: 1, crossRefCount: 2 };
  const bare = { citedInNotes: 0, themeCount: 0, personCount: 0, crossRefCount: 0 };

  it('resolves to the family default with no seed, exactly as before families existed', () => {
    for (let step = 0; step < VERSE_FAMILIES.length; step++) {
      expect(verseRungFor(step).key).toBe(VERSE_FAMILIES[step][0]);
    }
    expect(VERSE_LADDER).toEqual(VERSE_FAMILIES.map((f) => f[0]));
  });

  it('picks the same member for the same seed, so the list, the reveal and the grader agree', () => {
    const a = verseRungFor(4, 'review_x:4', rich);
    const b = verseRungFor(4, 'review_x:4', rich);
    expect(a.key).toBe(b.key);
    expect(VERSE_FAMILIES[4]).toContain(a.key);
  });

  it('spreads different items across a family', () => {
    const seen = new Set(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].map((id) => verseRungFor(4, `${id}:4`, rich).key),
    );
    expect(seen.size).toBeGreaterThan(1);
  });

  it('never asks what the verse has no material for', () => {
    /*
     * A verse no note cites is never asked which note cites it, however the seed falls; a verse
     * with no themes is never asked for one. The pick falls forward within the family.
     */
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) {
      const key = verseRungFor(4, `${id}:4`, bare).key;
      expect(key).toBe('verse.connect'); // the default, which always builds
    }
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) {
      const key = verseRungFor(4, `${id}:4`, { ...bare, themeCount: 2 }).key;
      expect(['verse.connect', 'verse.theme']).toContain(key);
    }
  });

  it('cycles families on maintenance, and never the two learning rungs', () => {
    const first = VERSE_FAMILIES.length;
    for (let i = 0; i < VERSE_MAINTENANCE_FAMILIES.length * 2; i++) {
      const rung = verseRungFor(first + i, `m:${first + i}`, rich);
      expect(rung.family).toBe(VERSE_MAINTENANCE_FAMILIES[i % VERSE_MAINTENANCE_FAMILIES.length]);
      expect(['verse.recognize', 'verse.recall']).not.toContain(rung.key);
      expect(rung.pass).toBe(1 + Math.floor(i / VERSE_MAINTENANCE_FAMILIES.length));
    }
  });

  it('marks every context-step member and hides nothing on it', () => {
    for (const key of VERSE_FAMILIES[4]) {
      expect(reviewRungIsGraded({ kind: 'verse', ladderStep: 4, promptKey: key })).toBe(true);
    }
    // A caller that knows the resolved rung is believed over the step's default.
    expect(reviewRungIsGraded({ kind: 'verse', ladderStep: 0, promptKey: 'verse.theme' })).toBe(true);
    // A rung the caller resolved wins over the step's default — both are graded, so the
    // check that the resolved key is believed is the one below, on a kind that is not.
    expect(reviewRungIsGraded({ kind: 'thread', ladderStep: 4, promptKey: 'verse.theme' })).toBe(false);
  });
});

describe('the text-keyed families', () => {
  const rich = { citedInNotes: 2, themeCount: 3, personCount: 1, crossRefCount: 2, locateRivals: 9, contentWordCount: 12 };

  it('pairs each learning step with its easier twin', () => {
    expect(VERSE_FAMILIES[1]).toEqual(['verse.rebuild', 'verse.initials']);
    expect(VERSE_FAMILIES[2]).toEqual(['verse.recall', 'verse.keywords']);
    expect(VERSE_FAMILIES[3]).toEqual(['verse.next', 'verse.before']);
  });

  it('offers the book only while the reader own reference pool is thin', () => {
    /*
     * With enough of the reader's own references, locate is a fair question and the book is not
     * offered at all; below the floor the seed may pick either, and the canned references keep
     * locate buildable.
     */
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      expect(verseRungFor(6, `${id}:6`, rich).key).toBe('verse.locate');
    }
    const thin = { ...rich, locateRivals: 1 };
    const seen = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => verseRungFor(6, `${id}:6`, thin).key));
    expect(seen.has('verse.book')).toBe(true);
  });

  it('never asks for three words of a verse that has not got them', () => {
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) {
      expect(verseRungFor(2, `${id}:2`, { ...rich, contentWordCount: 2 }).key).toBe('verse.recall');
    }
  });

  it('hides the subject on the book rung, since the book is the answer', () => {
    expect(rungIdentityIsTheAnswer({ kind: 'verse', ladderStep: 6, promptKey: 'verse.book' })).toBe(true);
    expect(rungIdentityIsTheAnswer({ kind: 'verse', ladderStep: 6, promptKey: 'verse.locate' })).toBe(true);
    expect(rungIdentityIsTheAnswer({ kind: 'verse', ladderStep: 3, promptKey: 'verse.before' })).toBe(false);
  });

  it('names the chapter and never the verse on "which comes first"', () => {
    const text = fillReviewPrompt('verse.before', { reference: 'John 15:5' });
    expect(text).toContain('John 15');
    expect(text).not.toContain('15:5');
  });
});

describe('the chapter ladder', () => {
  const full = { verseCount: 36, finishCandidates: 10, personCount: 3 };

  it('climbs tap → finish → order-or-who, reaching the closing member only as a fallback', () => {
    /*
     * A seeded draw across the whole family would show "pick the verse" on step 1 to half of
     * all readers while the cloze was there to be asked. So the draw runs over the real members
     * and the closer is reached only when none of them builds.
     */
    expect(chapterRungFor(0, 'any', full).key).toBe('chapter.verse');
    for (const seed of ['a', 'b', 'c', 'd']) expect(chapterRungFor(1, seed, full).key).toBe('chapter.finish');
    const drawn = new Set(['a', 'b', 'c', 'd', 'e', 'f'].map((seed) => chapterRungFor(2, seed, full).key));
    // Both real members come up across seeds; the closer never does while both can be built.
    expect(drawn).toEqual(new Set(['chapter.order', 'chapter.person']));
    expect(chapterRungFor(2, 'a', full)).toEqual(chapterRungFor(2, 'a', full));
  });

  it('falls forward to what the chapter can actually be asked', () => {
    expect(chapterRungFor(1, 's', { ...full, finishCandidates: 0 }).key).toBe('chapter.verse');
    expect(chapterRungFor(2, 's', { ...full, verseCount: 2 }).key).toBe('chapter.person');
    expect(chapterRungFor(2, 's', { ...full, verseCount: 2, personCount: 0 }).key).toBe('chapter.verse');
    // With no material at all only the member that always builds is offered.
    expect(chapterRungFor(2, 's').key).toBe('chapter.verse');
  });

  it('wraps into maintenance over the two families with work in them', () => {
    const top = CHAPTER_LADDER_MAX_STEP;
    expect(chapterRungFor(top + 1, 's', full)).toMatchObject({ family: 1, pass: 1 });
    expect(chapterRungFor(top + 2, 's', full)).toMatchObject({ family: 2, pass: 1 });
    expect(chapterRungFor(top + 3, 's', full)).toMatchObject({ family: 1, pass: 2 });
    expect(nextLadderStep('chapter', top)).toBe(top + 1);
  });

  it('is graded on every rung, and never read as a note', () => {
    // The quiet else-branches: a third kind read as a note gets `note.recognize` and a
    // question about a note it does not have.
    expect(pickPromptKey('chapter', 0, 0, 'review_1', undefined, full)).toBe('chapter.verse');
    expect(pickPromptKey('chapter', 0, 1, 'review_1', undefined, full)).toBe('chapter.finish');
    for (const step of [0, 1, 2, 5]) {
      expect(reviewRungIsGraded({ kind: 'chapter', ladderStep: step })).toBe(true);
    }
  });

  it('names the chapter in every prompt, because it is never the answer', () => {
    for (const key of CHAPTER_FAMILIES.flat()) {
      expect(REVIEW_PROMPTS[key]({ reference: 'John 3' })).toContain('John 3');
      expect(REVIEW_TASKS[key]).not.toContain('John');
    }
  });
});

describe('a family with two members draws both', () => {
  /*
   * The bug this pins: `hashSeed(seed) % 2` keeps FNV-1a's low bit, which is the XOR of the
   * seed's character parities and not a hash of it. With seeds of `${id}:${step}` every step of
   * the same digit parity drew the same member, so one member of a two-member family was
   * unreachable for a given item — forever, on every maintenance pass.
   */
  const chapterMaterial = { verseCount: 36, finishCandidates: 20, personCount: 3 };
  const verseMaterial = {
    citedInNotes: 2,
    themeCount: 2,
    personCount: 2,
    crossRefCount: 2,
    contentWordCount: 12,
    locateRivals: 5,
  };

  it('reaches "who appears" as well as "put them in order" across a chapter\'s passes', () => {
    const steps = [2, 4, 6, 8, 10, 12];
    const drawn = new Set(steps.map((s) => chapterRungFor(s, `review_x:${s}`, chapterMaterial).key));
    expect(drawn.has('chapter.order')).toBe(true);
    expect(drawn.has('chapter.person')).toBe(true);
  });

  it('alternates rebuild and initials across a verse\'s maintenance passes', () => {
    // Family 1 comes round every six steps, so every recurrence has the same step parity.
    const steps = [1, 8, 14, 20, 26, 32];
    const drawn = new Set(steps.map((s) => verseRungFor(s, `review_x:${s}`, verseMaterial).key));
    expect(drawn).toEqual(new Set(['verse.rebuild', 'verse.initials']));
  });

  it('is still the same question on the same seed, which is what the grader relies on', () => {
    expect(chapterRungFor(2, 'review_x:2', chapterMaterial)).toEqual(
      chapterRungFor(2, 'review_x:2', chapterMaterial),
    );
  });
});
