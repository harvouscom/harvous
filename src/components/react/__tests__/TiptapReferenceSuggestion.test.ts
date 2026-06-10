import { describe, it, expect } from 'vitest';
import { Schema } from '@tiptap/pm/model';
import {
  isCapitalizedWord,
  createDictionaryReferenceProvider,
  buildReferenceSuggestionDecorations,
  shouldSkipPersonNameContext,
  isSuggestibleEastonEntry,
  REFERENCE_SUGGESTION_STOPLIST,
  REFERENCE_SUGGESTION_MIN_LENGTH,
  REFERENCE_SUGGESTION_HONORIFIC_PREFIXES,
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
  { slug: 'a', headword: 'A', category: 'thing' },
  { slug: 'ai', headword: 'Ai', category: 'place' },
  { slug: 'ed', headword: 'Ed', category: 'place' },
  { slug: 'abaddon', headword: 'Abaddon', category: 'thing' },
  { slug: 'luke', headword: 'Luke', category: 'person' },
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
  it('matches a capitalized thing when at least min length', () => {
    expect(REFERENCE_SUGGESTION_MIN_LENGTH).toBe(3);
    expect(provider.match('Water')).toEqual({ type: 'dictionary', word: 'Water', slug: 'water' });
    expect(provider.match('Abaddon')).toEqual({ type: 'dictionary', word: 'Abaddon', slug: 'abaddon' });
  });
  it('matches lowercase things', () => {
    expect(provider.match('water')).toEqual({ type: 'dictionary', word: 'water', slug: 'water' });
  });
  it('skips lowercase person and place even when the headword exists', () => {
    expect(provider.match('bethlehem')).toBeNull();
    expect(provider.match('paul')).toBeNull();
  });
  it('skips short dictionary rows and tokens', () => {
    expect(isSuggestibleEastonEntry({ headword: 'Ai' })).toBe(false);
    expect(provider.match('A')).toBeNull();
    expect(provider.match('Ai')).toBeNull();
    expect(provider.match('Ed')).toBeNull();
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
  it('decorates capitalized matches and lowercase things; skips short tokens', () => {
    const doc = schema.nodes.doc.create(null, [
      para(schema.text('We read about Bethlehem and Paul near water. A Ai Ed.')),
    ]);
    const set = buildReferenceSuggestionDecorations(doc, [provider]);
    const found = set.find();
    expect(found.length).toBe(3);
    const words = found.map((d) => doc.textBetween(d.from, d.to)).sort();
    expect(words).toEqual(['Bethlehem', 'Paul', 'water']);
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

  it('skips Bible book names when chapter digits follow in the same text node', () => {
    const exodusIndex = makeIndex([{ slug: 'exodus', headword: 'Exodus', category: 'place' }]);
    const exodusProvider = createDictionaryReferenceProvider(() => exodusIndex);
    const doc = schema.nodes.doc.create(null, [
      para(schema.text('Reading Exodus 1:1-22 today')),
    ]);
    const set = buildReferenceSuggestionDecorations(doc, [exodusProvider]);
    const words = set.find().map((d) => doc.textBetween(d.from, d.to));
    expect(words).not.toContain('Exodus');
  });

  it('skips honorific person-name context', () => {
    const lukeProvider = createDictionaryReferenceProvider(() =>
      makeIndex([{ slug: 'luke', headword: 'Luke', category: 'person' }]),
    );
    const doc = schema.nodes.doc.create(null, [para(schema.text('Ps Luke has shared a story'))]);
    const set = buildReferenceSuggestionDecorations(doc, [lukeProvider]);
    const words = set.find().map((d) => doc.textBetween(d.from, d.to));
    expect(words).not.toContain('Luke');
  });

  it('skips capitalized surname after first name', () => {
    const lukeProvider = createDictionaryReferenceProvider(() =>
      makeIndex([{ slug: 'luke', headword: 'Luke', category: 'person' }]),
    );
    const doc = schema.nodes.doc.create(null, [para(schema.text('Luke Smith arrived today'))]);
    const set = buildReferenceSuggestionDecorations(doc, [lukeProvider]);
    const words = set.find().map((d) => doc.textBetween(d.from, d.to));
    expect(words).not.toContain('Luke');
  });
});

describe('shouldSkipPersonNameContext', () => {
  it('is true for honorific prefix', () => {
    const text = 'Ps Luke has shared';
    const start = text.indexOf('Luke');
    expect(REFERENCE_SUGGESTION_HONORIFIC_PREFIXES.has('ps')).toBe(true);
    expect(shouldSkipPersonNameContext('Luke', text, start, start + 4)).toBe(true);
  });

  it('is true for capitalized surname after', () => {
    const text = 'Luke Smith arrived';
    const start = text.indexOf('Luke');
    expect(shouldSkipPersonNameContext('Luke', text, start, start + 4)).toBe(true);
  });

  it('is false for standalone apostle reference', () => {
    const text = 'the apostle Paul wrote';
    const start = text.indexOf('Paul');
    expect(shouldSkipPersonNameContext('Paul', text, start, start + 4)).toBe(false);
  });
});
