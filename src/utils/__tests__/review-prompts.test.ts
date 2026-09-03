import { describe, it, expect } from 'vitest';
import { REVIEW_ITEM_KINDS } from '../review-item-kinds';
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

  it('capitalizes Thread wherever it names one', () => {
    const threadPrompts = REVIEW_PROMPT_KEYS.filter((k) => k.startsWith('thread.'));
    for (const key of threadPrompts) {
      const text = fillReviewPrompt(key, CTX);
      expect(text).toContain('Thread');
      expect(text).not.toMatch(/\bthread\b/);
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
  it('covers every review kind', () => {
    for (const kind of REVIEW_ITEM_KINDS) {
      const key = pickPromptKey(kind, 0, 0);
      expect(REVIEW_PROMPT_KEYS).toContain(key);
    }
  });

  it('is deterministic for the same review count', () => {
    expect(pickPromptKey('note', 4)).toBe(pickPromptKey('note', 4));
  });

  it('rotates so the same item is not asked the same way twice running', () => {
    expect(pickPromptKey('thread', 0)).not.toBe(pickPromptKey('thread', 1));
    expect(pickPromptKey('connection', 0)).not.toBe(pickPromptKey('connection', 1));
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
  it('returns the key alongside the rendered question', () => {
    const result = reviewPromptFor({ kind: 'thread', reviewCount: 0 }, CTX);
    expect(result.key).toBe('thread.central');
    // The Thread's own name, not the reference its representative note happens to cite.
    expect(result.prompt).toContain('Covenant Thread');
  });

  it('tolerates a null ladder step', () => {
    const result = reviewPromptFor({ kind: 'verse', reviewCount: 0, ladderStep: null }, CTX);
    expect(result.key).toBe(VERSE_LADDER[0]);
  });
});

describe('a fresh queue does not ask the same question three times', () => {
  it('starts brand-new items at different points in the rotation', () => {
    // Every new item has reviewCount 0, so without the id offset they all land on the first
    // phrasing — which is exactly how the first preview read.
    const keys = ['review_a1', 'review_b2', 'review_c3', 'review_d4'].map((id) =>
      pickPromptKey('connection', 0, 0, id),
    );
    expect(new Set(keys).size).toBeGreaterThan(1);
  });

  it('asks the same item the same question on every device', () => {
    expect(pickPromptKey('thread', 2, 0, 'review_x')).toBe(pickPromptKey('thread', 2, 0, 'review_x'));
  });

  it('still moves on as an item is answered', () => {
    const first = pickPromptKey('thread', 0, 0, 'review_t');
    const second = pickPromptKey('thread', 1, 0, 'review_t');
    expect(second).not.toBe(first);
  });

  it('ignores the id for the kinds that climb, whose rung is the ladder position', () => {
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
    expect(pickPromptKey('note', 0, 99)).toBe('note.connect');
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
     * `verse.recognize` owned "What comes next?" and meant "finish this verse"; `verse.next`
     * means "what follows it". One phrase across both would make the ladder feel like it was
     * asking the same thing twice while marking only one of them.
     */
    const recognize = fillReviewPrompt('verse.recognize', { reference: 'John 15:5', cue: 'I am the vine' });
    const next = fillReviewPrompt('verse.next', { reference: 'John 15:5' });
    // One finishes the verse in front of you; the other asks for the verse after it.
    expect(recognize).toContain('Finish');
    expect(next).toContain('follows');
    expect(recognize).not.toContain('follows');
  });

  it('knows which rungs the server marks, so three surfaces cannot disagree', () => {
    expect(reviewRungIsGraded({ kind: 'verse', ladderStep: VERSE_NEXT_STEP })).toBe(true);
    expect(reviewRungIsGraded({ kind: 'verse', ladderStep: VERSE_SEQUENCE_STEP })).toBe(true);
    expect(reviewRungIsGraded({ kind: 'verse', ladderStep: VERSE_LOCATE_STEP })).toBe(true);
    // The open rungs, where the reader judges themselves.
    expect(reviewRungIsGraded({ kind: 'verse', ladderStep: 0 })).toBe(false);
    expect(reviewRungIsGraded({ kind: 'verse', ladderStep: 4 })).toBe(false);
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
    const maintenanceRebuild = VERSE_LADDER.length + VERSE_MAINTENANCE.indexOf('verse.rebuild');
    expect(reviewRungIsGraded({ kind: 'verse', ladderStep: maintenanceRebuild })).toBe(false);
  });

  it('tolerates a nonsense step', () => {
    expect(verseRungFor(-4).key).toBe(VERSE_LADDER[0]);
    expect(verseRungFor(Number.NaN).key).toBe(VERSE_LADDER[0]);
    expect(verseRungFor(1e6).pass).toBeGreaterThan(0);
  });
});
