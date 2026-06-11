import { describe, it, expect } from 'vitest';
import { Schema } from '@tiptap/pm/model';
import {
  isCapitalizedWord,
  createDictionaryReferenceProvider,
  buildReferenceSuggestionDecorations,
  findReferenceSuggestionRanges,
  decoratePassageHtmlWithReferenceSuggestions,
  decoratePassageHtmlWithSavedHighlights,
  resolvePassagePaintRanges,
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

describe('findReferenceSuggestionRanges', () => {
  it('matches a dictionary word and skips a scripture reference in progress', () => {
    const exodusIndex = makeIndex([
      { slug: 'bethlehem', headword: 'Bethlehem', category: 'place' },
      { slug: 'exodus', headword: 'Exodus', category: 'place' },
    ]);
    const verseProvider = createDictionaryReferenceProvider(() => exodusIndex);
    const verse = 'They traveled to Bethlehem. Reading Exodus 1 today.';
    const ranges = findReferenceSuggestionRanges(verse, [verseProvider]);
    const words = ranges.map((r) => r.word);
    expect(words).toContain('Bethlehem');
    expect(words).not.toContain('Exodus');
  });
});


describe('decoratePassageHtmlWithReferenceSuggestions', () => {
  const genesisIndex = makeIndex([
    { slug: 'jabal', headword: 'Jabal', category: 'person' },
    { slug: 'jubal', headword: 'Jubal', category: 'person' },
    { slug: 'genesis', headword: 'Genesis', category: 'thing' },
  ]);
  const genesisProvider = createDictionaryReferenceProvider(() => genesisIndex);

  it('wraps dictionary words in reference-suggestion spans', () => {
    const html =
      '<sup class="verse-num">20</sup>Adah gave birth to Jabal; his brother\'s name was Jubal.';
    const out = decoratePassageHtmlWithReferenceSuggestions(html, [genesisProvider]);
    expect(out).toContain('class="reference-suggestion"');
    expect(out).toContain('data-reference-word="Jabal"');
    expect(out).toContain('data-reference-word="Jubal"');
    expect(out).toContain('>Jabal<');
    expect(out).toContain('>Jubal<');
  });

  it('skips Bible book names when chapter digits follow in the same text node', () => {
    const html = 'Reading Genesis 1 today in the garden.';
    const out = decoratePassageHtmlWithReferenceSuggestions(html, [genesisProvider]);
    expect(out).not.toContain('data-reference-word="Genesis"');
  });
});

describe('resolvePassagePaintRanges', () => {
  it('orders duplicate substrings by forward cursor', () => {
    const text = 'Adam knew Adam again';
    const paints = [
      { id: 'a', excerpt: 'Adam', accentRaw: 'warmAmber', entryKind: 'reference' },
      { id: 'b', excerpt: 'Adam', accentRaw: 'skyBlue', entryKind: 'reference' },
    ];
    const ranges = resolvePassagePaintRanges(text, paints);
    expect(ranges).toHaveLength(2);
    expect(ranges[0]).toMatchObject({ paint: { id: 'a' }, start: 0, end: 4 });
    expect(ranges[1]).toMatchObject({ paint: { id: 'b' }, start: 10, end: 14 });
  });
});

describe('decoratePassageHtmlWithSavedHighlights', () => {
  it('wraps a saved reference word with mark[data-reference]', () => {
    const html = '<p>Adam knew his wife again, and she gave birth to a son.</p>';
    const out = decoratePassageHtmlWithSavedHighlights(html, [
      { id: 'thread-1', excerpt: 'Adam', accentRaw: 'warmAmber', entryKind: 'reference' },
    ]);
    expect(out).toContain('<mark');
    expect(out).toContain('data-reference="Adam"');
    expect(out).toContain('data-color="warmAmber"');
    expect(out).toContain('data-study-thread-id="thread-1"');
    expect(out).toContain('>Adam<');
  });

  it('does not re-suggest a word already inside a saved mark', () => {
    const genesisIndex = makeIndex([{ slug: 'adam', headword: 'Adam', category: 'person' }]);
    const genesisProvider = createDictionaryReferenceProvider(() => genesisIndex);
    const html = '<p>Adam knew his wife again.</p>';
    const painted = decoratePassageHtmlWithSavedHighlights(html, [
      { id: 'thread-1', excerpt: 'Adam', accentRaw: 'warmAmber', entryKind: 'reference' },
    ]);
    const out = decoratePassageHtmlWithReferenceSuggestions(painted, [genesisProvider]);
    expect(out).toContain('data-reference="Adam"');
    expect(out).not.toContain('class="reference-suggestion"');
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
