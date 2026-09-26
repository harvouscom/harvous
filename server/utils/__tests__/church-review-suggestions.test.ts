import { describe, expect, it, vi } from 'vitest';

vi.mock('../../db', () => ({ db: {} }));

import { rankSuggestions, suggestionShapeFor } from '../church-review-suggestions';

describe('suggestionShapeFor', () => {
  it('keeps one to three contiguous verses as a verse question', () => {
    expect(suggestionShapeFor('John 15:5')).toEqual({ kind: 'verse', reference: 'John 15:5' });
    expect(suggestionShapeFor('John 15:5-7')).toEqual({ kind: 'verse', reference: 'John 15:5-7' });
  });

  it('turns a longer passage, or a whole chapter, into a chapter question', () => {
    expect(suggestionShapeFor('John 15:1-11')).toEqual({ kind: 'chapter', reference: 'John 15' });
    expect(suggestionShapeFor('John 15')).toEqual({ kind: 'chapter', reference: 'John 15' });
  });

  it('spells one passage one way, so it is suggested once', () => {
    expect(suggestionShapeFor('Psalms 23:1')?.reference).toBe(suggestionShapeFor('Psalm 23:1')?.reference);
  });

  it('leaves out what crosses chapters, and what is not a reference', () => {
    expect(suggestionShapeFor('Exodus 6:28-7:7')).toBeNull();
    expect(suggestionShapeFor('not scripture')).toBeNull();
    expect(suggestionShapeFor('')).toBeNull();
  });
});

describe('rankSuggestions', () => {
  const at = (reference: string, noteId: string) => ({
    reference,
    noteId,
    noteTitle: `Note ${noteId}`,
    serviceId: null,
    serviceTitle: null,
  });

  it('dedupes by passage and puts the most-cited first', () => {
    const out = rankSuggestions(
      [at('Romans 8:1', 'n1'), at('John 3:16', 'n2'), at('John 3:16', 'n3'), at('John 3:16', 'n3')],
      new Set(),
    );
    expect(out.map((s) => [s.key, s.citedIn])).toEqual([
      ['John 3:16', 2],
      ['Romans 8:1', 1],
    ]);
    expect(out[0].sourceNoteId).toBe('n2');
  });

  it('never suggests a passage the channel already answered, whatever its row says', () => {
    const out = rankSuggestions([at('John 3:16', 'n1'), at('Romans 8:1', 'n2')], new Set(['John 3:16']));
    expect(out.map((s) => s.key)).toEqual(['Romans 8:1']);
  });

  it('is bounded', () => {
    const many = Array.from({ length: 40 }, (_, i) => at(`Psalm ${i + 1}:1`, `n${i}`));
    expect(rankSuggestions(many, new Set(), 10)).toHaveLength(10);
  });
});
