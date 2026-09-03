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

  it('asks open questions rather than stating conclusions', () => {
    for (const key of REVIEW_PROMPT_KEYS) {
      const text = fillReviewPrompt(key, CTX);
      expect(text.endsWith('?') || text.endsWith('.')).toBe(true);
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

  it('clamps a ladder step past the top rung', () => {
    expect(pickPromptKey('verse', 0, 99)).toBe(VERSE_LADDER[VERSE_LADDER_MAX_STEP]);
    expect(pickPromptKey('verse', 0, -3)).toBe(VERSE_LADDER[0]);
  });
});

describe('reviewPromptFor', () => {
  it('returns the key alongside the rendered question', () => {
    const result = reviewPromptFor({ kind: 'thread', reviewCount: 0 }, CTX);
    expect(result.key).toBe('thread.central');
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

  it('asks questions with an answer, not questions about motive', () => {
    for (const key of NOTE_LADDER) {
      const rendered = fillReviewPrompt(key, {});
      expect(rendered).toMatch(/\?$/);
      // No "why did you", no "what made you" — those are the ones that left.
      expect(rendered).not.toMatch(/why did you|what made you|clearer/i);
    }
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

  it('stops at the top of each ladder', () => {
    expect(nextLadderStep('note', NOTE_LADDER_MAX_STEP)).toBe(NOTE_LADDER_MAX_STEP);
    expect(nextLadderStep('verse', VERSE_LADDER_MAX_STEP)).toBe(VERSE_LADDER_MAX_STEP);
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
    expect(next).toContain('What comes after');
    expect(recognize).not.toContain('What comes next');
    expect(recognize).not.toContain('What comes after');
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
