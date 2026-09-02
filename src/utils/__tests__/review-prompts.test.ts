import { describe, it, expect } from 'vitest';
import { REVIEW_ITEM_KINDS } from '../review-item-kinds';
import {
  REVIEW_PROMPTS,
  REVIEW_PROMPT_KEYS,
  VERSE_LADDER,
  VERSE_LADDER_MAX_STEP,
  fillReviewPrompt,
  pickPromptKey,
  reviewPromptFor,
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
    expect(pickPromptKey('note', 0)).not.toBe(pickPromptKey('note', 1));
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
  it('starts three brand-new items at different points in the rotation', () => {
    // Every new item has reviewCount 0, so without the id offset all three land on
    // 'note.observe' — which is exactly how the first preview read.
    const keys = ['review_a1', 'review_b2', 'review_c3'].map((id) =>
      pickPromptKey('note', 0, 0, id),
    );
    expect(new Set(keys).size).toBeGreaterThan(1);
  });

  it('asks the same item the same question on every device', () => {
    expect(pickPromptKey('note', 2, 0, 'review_x')).toBe(pickPromptKey('note', 2, 0, 'review_x'));
  });

  it('still moves on as an item is answered', () => {
    const first = pickPromptKey('thread', 0, 0, 'review_t');
    const second = pickPromptKey('thread', 1, 0, 'review_t');
    expect(second).not.toBe(first);
  });

  it('ignores the id for a verse, whose rung is the ladder position', () => {
    expect(pickPromptKey('verse', 5, 2, 'review_v')).toBe(VERSE_LADDER[2]);
  });
});

describe('note questions speak to the reader, not about the note', () => {
  const noteKeys = REVIEW_PROMPT_KEYS.filter((k) => k.startsWith('note.'));

  it('never falls back to "this note", which named nothing', () => {
    for (const key of noteKeys) {
      const rendered = fillReviewPrompt(key, {});
      expect(rendered).not.toMatch(/this note/i);
    }
  });

  it('drops the worksheet vocabulary', () => {
    for (const key of noteKeys) {
      const rendered = fillReviewPrompt(key, { noteTitle: 'Adoption' });
      expect(rendered).not.toMatch(/central idea|carry forward|the text itself|your note on/i);
      expect(rendered).toMatch(/\byou\b/i);
    }
  });

  it('puts a named subject inside the sentence', () => {
    expect(fillReviewPrompt('note.observe', { noteTitle: 'Romans 8' })).toBe(
      'What did you see in Romans 8?',
    );
  });

  it('lets the note own words lead instead, since a fragment cannot follow "in"', () => {
    expect(
      fillReviewPrompt('note.observe', { notePhrase: 'God chose us before the foundation' }),
    ).toBe('God chose us before the foundation — what did you see?');
  });

  it('prefers a name over the note own words when it has one', () => {
    expect(
      fillReviewPrompt('note.central', { noteTitle: 'Adoption', notePhrase: 'God chose us' }),
    ).toBe('What were you working out in Adoption?');
  });

  it('does not run two stops together when joining a phrase', () => {
    // The excerpt ends wherever the sentence did.
    expect(fillReviewPrompt('note.phrase', { notePhrase: 'He wept for the city.' })).toBe(
      'He wept for the city — what made you write it?',
    );
  });
});
