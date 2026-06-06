import { describe, it, expect } from 'vitest';
import { Schema } from '@tiptap/pm/model';
import {
  isCapitalizedWord,
  createDictionaryReferenceProvider,
  buildReferenceSuggestionDecorations,
  REFERENCE_SUGGESTION_STOPLIST,
  type EastonsIndex,
} from '../TiptapReferenceSuggestion';

// ─── Fake Easton's index ─────────────────────────────────
// Map slug → { slug, headword, category }, mirroring useEastonsSlugIndex.
function makeIndex(
  entries: { slug: string; headword: string; category: 'person' | 'place' | 'thing' }[],
): EastonsIndex {
  const m = new Map<string, { slug: string; headword: string; category: 'person' | 'place' | 'thing' }>();
  for (const e of entries) m.set(e.slug, e);
  return m as EastonsIndex;
}

const INDEX = makeIndex([
  { slug: 'bethlehem', headword: 'Bethlehem', category: 'place' },
  { slug: 'paul', headword: 'Paul', category: 'person' },
  { slug: 'water', headword: 'Water', category: 'thing' },
  { slug: 'god', headword: 'God', category: 'person' },
]);

const provider = createDictionaryReferenceProvider(() => INDEX);

// ─── isCapitalizedWord ───────────────────────────────────
describe('isCapitalizedWord', () => {
  it('is true for an uppercase-initial word', () => {
    expect(isCapitalizedWord('Bethlehem')).toBe(true);
  });
  it('is false for a lowercase word', () => {
    expect(isCapitalizedWord('bethlehem')).toBe(false);
  });
  it('is false for a non-letter leading char', () => {
    expect(isCapitalizedWord('123')).toBe(false);
    expect(isCapitalizedWord('')).toBe(false);
  });
});

// ─── dictionary provider ─────────────────────────────────
describe('createDictionaryReferenceProvider', () => {
  it('matches a capitalized place', () => {
    expect(provider.match('Bethlehem')).toEqual({ type: 'dictionary', word: 'Bethlehem', slug: 'bethlehem' });
  });
  it('matches a capitalized person', () => {
    expect(provider.match('Paul')).toEqual({ type: 'dictionary', word: 'Paul', slug: 'paul' });
  });
  it('skips lowercase even when the headword exists', () => {
    expect(provider.match('bethlehem')).toBeNull();
  });
  it('skips a "thing" category entry', () => {
    expect(provider.match('Water')).toBeNull();
  });
  it('skips stoplisted ultra-common names', () => {
    expect(REFERENCE_SUGGESTION_STOPLIST.has('god')).toBe(true);
    expect(provider.match('God')).toBeNull();
  });
  it('returns null for an unknown word', () => {
    expect(provider.match('Spaceship')).toBeNull();
  });
  it('tolerates a not-yet-loaded index', () => {
    const p = createDictionaryReferenceProvider(() => undefined);
    expect(p.match('Bethlehem')).toBeNull();
  });
});

// ─── buildReferenceSuggestionDecorations ─────────────────
// Minimal schema with the marks the builder excludes.
const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*', toDOM: () => ['p', 0] },
    text: { group: 'inline' },
  },
  marks: {
    highlight: { toDOM: () => ['mark', 0] },
    scripturePill: { toDOM: () => ['span', 0] },
  },
});

function para(...inline: ReturnType<typeof schema.text>[]) {
  return schema.nodes.paragraph.create(null, inline);
}

describe('buildReferenceSuggestionDecorations', () => {
  it('decorates proper-noun matches and skips common words', () => {
    const doc = schema.nodes.doc.create(null, [
      para(schema.text('We read about Bethlehem and Paul near the water.')),
    ]);
    const set = buildReferenceSuggestionDecorations(doc, [provider]);
    const found = set.find();
    expect(found.length).toBe(2);
    const words = found.map((d) => doc.textBetween(d.from, d.to)).sort();
    expect(words).toEqual(['Bethlehem', 'Paul']);
  });

  it('skips words already inside an excluded mark (highlight)', () => {
    const doc = schema.nodes.doc.create(null, [
      para(schema.text('Bethlehem', [schema.marks.highlight.create()])),
    ]);
    const set = buildReferenceSuggestionDecorations(doc, [provider]);
    expect(set.find().length).toBe(0);
  });

  it('returns an empty set with no providers', () => {
    const doc = schema.nodes.doc.create(null, [para(schema.text('Bethlehem'))]);
    expect(buildReferenceSuggestionDecorations(doc, []).find().length).toBe(0);
  });
});
