import { describe, it, expect } from 'vitest';
import {
  detectScriptureReferences,
  detectScriptureReferencesWithTranslation,
  detectScripture,
  parseScriptureReference,
  normalizeScriptureReference,
  normalizeText,
  formatReferenceForDisplay,
  formatReferenceForAPI,
  parseVerseGroups,
  getChapterVerseRange,
  validateVerseNumber,
  validateVerseRange,
  validateCrossChapterRange,
  normalizeChapterReference,
  canonicalizeScriptureReferenceDisplay,
  checkScriptureReferenceValidity,
  isResolvableScriptureReference,
  repairUnresolvableReference,
  matchTrailingTranslationAbbreviation,
  matchAnchoredTrailingTranslationAbbreviation,
  normalizeInlineTranslationAbbreviation,
  type ScriptureReference,
} from '../scripture-detector';

// ─── Helper ──────────────────────────────────────────────
function refStrings(refs: ScriptureReference[]): string[] {
  return refs.map(r => r.reference);
}

// ─── Unit: normalizeText ─────────────────────────────────
describe('normalizeText', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalizeText('Hello, World!')).toBe('hello world');
  });

  it('normalizes whitespace', () => {
    expect(normalizeText('  foo   bar  ')).toBe('foo bar');
  });

  it('removes dashes of all types', () => {
    expect(normalizeText('a-b–c—d')).toBe('abcd');
  });
});

// ─── Unit: verse validation ──────────────────────────────
describe('getChapterVerseRange', () => {
  it('returns range for a valid book and chapter', () => {
    const range = getChapterVerseRange('Genesis', 1);
    expect(range).not.toBeNull();
    expect(range!.start).toBe(1);
    expect(range!.end).toBe(31); // Genesis 1 has 31 verses
  });

  it('returns null for invalid book', () => {
    expect(getChapterVerseRange('FakeBook', 1)).toBeNull();
  });

  it('returns null for invalid chapter', () => {
    expect(getChapterVerseRange('Genesis', 999)).toBeNull();
  });
});

describe('validateVerseNumber', () => {
  it('accepts valid verse', () => {
    expect(validateVerseNumber('John', 3, 16)).toBe(true);
  });

  it('rejects verse beyond range', () => {
    expect(validateVerseNumber('John', 3, 999)).toBe(false);
  });

  it('rejects verse 0', () => {
    expect(validateVerseNumber('Psalms', 23, 0)).toBe(false);
  });
});

describe('validateVerseRange', () => {
  it('accepts valid range', () => {
    expect(validateVerseRange('Genesis', 1, 1, 5)).toBe(true);
  });

  it('rejects reversed range', () => {
    expect(validateVerseRange('Genesis', 1, 5, 1)).toBe(false);
  });

  it('rejects out-of-bounds range', () => {
    expect(validateVerseRange('Genesis', 1, 1, 999)).toBe(false);
  });
});

describe('normalizeChapterReference', () => {
  it('expands chapter to full verse range', () => {
    expect(normalizeChapterReference('Genesis', 1)).toBe('Genesis 1:1-31');
  });

  it('returns null for invalid chapter', () => {
    expect(normalizeChapterReference('Genesis', 999)).toBeNull();
  });
});

// ─── Unit: parseScriptureReference ───────────────────────
describe('parseScriptureReference', () => {
  it('parses single verse', () => {
    const result = parseScriptureReference('John 3:16');
    expect(result).toEqual({ book: 'John', chapter: 3, verse: 16 });
  });

  it('parses verse range', () => {
    const result = parseScriptureReference('Genesis 1:1-5');
    expect(result).toEqual({ book: 'Genesis', chapter: 1, verse: [1, 5] });
  });

  it('parses numbered book', () => {
    const result = parseScriptureReference('1 Corinthians 13:4');
    expect(result).toEqual({ book: '1 Corinthians', chapter: 13, verse: 4 });
  });

  it('parses chapter-only reference', () => {
    const result = parseScriptureReference('John 3');
    expect(result).not.toBeNull();
    expect(result!.book).toBe('John');
    expect(result!.chapter).toBe(3);
    // Chapter-only should expand to full verse range
    expect(Array.isArray(result!.verse)).toBe(true);
  });

  it('returns null for invalid text', () => {
    expect(parseScriptureReference('not a reference')).toBeNull();
  });

  it('handles en-dash in range', () => {
    const result = parseScriptureReference('John 3:16–17');
    expect(result).not.toBeNull();
    expect(result!.verse).toEqual([16, 17]);
  });

  it('handles em-dash in range', () => {
    const result = parseScriptureReference('John 3:16—17');
    expect(result).not.toBeNull();
    expect(result!.verse).toEqual([16, 17]);
  });
});

// ─── Unit: normalizeScriptureReference ───────────────────
describe('normalizeScriptureReference', () => {
  it('normalizes spaces around colon to a single verse reference', () => {
    const result = normalizeScriptureReference('John 3: 16');
    expect(result).toBe('John 3:16');
  });

  it('normalizes spaces around dash', () => {
    const result = normalizeScriptureReference('John 3:16 - 17');
    expect(result).toBe('John 3:16-17');
  });

  it('normalizes en-dash to hyphen', () => {
    const result = normalizeScriptureReference('John 3:16–17');
    expect(result).toBe('John 3:16-17');
  });

  it('normalizes comma-separated verse groups', () => {
    const result = normalizeScriptureReference('Matthew 26:6-13, 17-30');
    expect(result).toBe('Matthew 26:6-13,17-30');
  });

  it('returns input for non-reference strings', () => {
    expect(normalizeScriptureReference('hello')).toBe('hello');
  });

  it('handles null/undefined gracefully', () => {
    expect(normalizeScriptureReference(null as any)).toBeNull();
    expect(normalizeScriptureReference(undefined as any)).toBeUndefined();
  });
});

// ─── Unit: formatReferenceForDisplay / formatReferenceForAPI ──
describe('formatReferenceForDisplay', () => {
  it('adds pipe separator between verse groups', () => {
    expect(formatReferenceForDisplay('Matthew 26:6-13,17-30')).toBe('Matthew 26:6-13 | 17-30');
  });

  it('leaves single verse group unchanged', () => {
    expect(formatReferenceForDisplay('John 3:16')).toBe('John 3:16');
  });
});

describe('formatReferenceForAPI', () => {
  it('converts pipe separator to comma', () => {
    expect(formatReferenceForAPI('Matthew 26:6-13 | 17-30')).toBe('Matthew 26:6-13,17-30');
  });
});

// ─── Unit: parseVerseGroups ──────────────────────────────
describe('parseVerseGroups', () => {
  it('parses single range', () => {
    expect(parseVerseGroups('Matthew 26:6-13')).toEqual([{ start: 6, end: 13 }]);
  });

  it('parses comma-separated groups', () => {
    expect(parseVerseGroups('Matthew 26:6-13,17-30')).toEqual([
      { start: 6, end: 13 },
      { start: 17, end: 30 },
    ]);
  });

  it('parses single verse', () => {
    expect(parseVerseGroups('John 3:16')).toEqual([{ start: 16, end: 16 }]);
  });

  it('parses pipe-separated groups', () => {
    expect(parseVerseGroups('Matthew 26:6-13 | 17-30')).toEqual([
      { start: 6, end: 13 },
      { start: 17, end: 30 },
    ]);
  });

  it('returns empty array for no verse part', () => {
    expect(parseVerseGroups('Genesis')).toEqual([]);
  });
});

// ─── Integration: detectScriptureReferences ──────────────
describe('detectScriptureReferences', () => {
  describe('standard references', () => {
    it('detects single verse reference', () => {
      const refs = detectScriptureReferences('Read John 3:16 today');
      expect(refs).toHaveLength(1);
      expect(refs[0].book).toBe('John');
      expect(refs[0].chapter).toBe(3);
      expect(refs[0].verse).toBe(16);
    });

    it('detects verse range', () => {
      const refs = detectScriptureReferences('Read Genesis 1:1-5 today');
      expect(refs).toHaveLength(1);
      expect(refs[0].verse).toEqual([1, 5]);
    });

    it('detects Exodus chapter verse range', () => {
      const refs = detectScriptureReferences('Exodus 1:1-22');
      expect(refs).toHaveLength(1);
      expect(refs[0].reference).toBe('Exodus 1:1-22');
      expect(refs[0].book).toBe('Exodus');
    });

    it('detects Exodus multi-verse span', () => {
      const refs = detectScriptureReferences('Exodus 4:18-31');
      expect(refs).toHaveLength(1);
      expect(refs[0].reference).toBe('Exodus 4:18-31');
    });

    it('detects multiple references in text', () => {
      const refs = detectScriptureReferences('Compare John 3:16 with Romans 8:28');
      expect(refs).toHaveLength(2);
      expect(refs[0].book).toBe('John');
      expect(refs[1].book).toBe('Romans');
    });

    it('detects chapter-only reference', () => {
      const refs = detectScriptureReferences('Read Psalm 23');
      expect(refs).toHaveLength(1);
      expect(refs[0].book).toBe('Psalms');
      expect(refs[0].chapter).toBe(23);
    });
  });

  describe('numbered books', () => {
    it('detects 1 Corinthians', () => {
      const refs = detectScriptureReferences('1 Corinthians 13:4-7 is about love');
      expect(refs).toHaveLength(1);
      expect(refs[0].book).toBe('1 Corinthians');
      expect(refs[0].chapter).toBe(13);
    });

    it('detects 2 Samuel', () => {
      const refs = detectScriptureReferences('2 Samuel 7:12');
      expect(refs).toHaveLength(1);
      expect(refs[0].book).toBe('2 Samuel');
    });

    it('detects 3 John', () => {
      const refs = detectScriptureReferences('3 John 1:4');
      expect(refs).toHaveLength(1);
      expect(refs[0].book).toBe('3 John');
    });
  });

  describe('chapter ranges', () => {
    it('detects chapter range like Matthew 5-7', () => {
      const refs = detectScriptureReferences('The Sermon on the Mount is in Matthew 5-7');
      expect(refs).toHaveLength(1);
      expect(refs[0].book).toBe('Matthew');
      expect(refs[0].chapter).toBe(5);
    });
  });

  describe('comma-separated verse groups', () => {
    it('detects comma-separated groups', () => {
      const refs = detectScriptureReferences('Matthew 26:6-13, 17-30');
      expect(refs).toHaveLength(1);
      expect(refs[0].book).toBe('Matthew');
    });
  });

  describe('dash variations', () => {
    it('handles en-dash', () => {
      const refs = detectScriptureReferences('John 3:16–17');
      expect(refs).toHaveLength(1);
      expect(refs[0].book).toBe('John');
    });

    it('handles em-dash', () => {
      const refs = detectScriptureReferences('John 3:16—17');
      expect(refs).toHaveLength(1);
    });

    it('handles spaces around dash', () => {
      const refs = detectScriptureReferences('John 3:16 - 17');
      expect(refs).toHaveLength(1);
    });
  });

  describe('false positive rejection', () => {
    it('rejects "John 3 years ago"', () => {
      const refs = detectScriptureReferences('I met John 3 years ago');
      expect(refs).toHaveLength(0);
    });

    it('rejects "Mark 5 months later"', () => {
      const refs = detectScriptureReferences('Mark 5 months later');
      expect(refs).toHaveLength(0);
    });

    it('known limitation: preposition check does not reject due to .trim() on before text', () => {
      // isValidScriptureContext trims the "before" substring, removing the trailing
      // space between the preposition and the book name. This means the \s+$ in the
      // invalidBefore regex can never match. Documenting actual behavior here.
      const refs = detectScriptureReferences('I was thinking about John 3 and how it applies');
      // Currently this is NOT rejected (known limitation)
      expect(refs).toHaveLength(1);
    });
  });

  describe('deduplication', () => {
    it('does not return duplicate references', () => {
      const refs = detectScriptureReferences('John 3:16 and John 3:16 again');
      expect(refs).toHaveLength(1);
    });

    it('deduplicates when chapter-only matches existing chapter:verse', () => {
      const refs = detectScriptureReferences('Read John 3:16 and also John 3');
      // John 3 should be deduplicated since John 3:16 already covers that chapter
      const johnRefs = refs.filter(r => r.book === 'John' && r.chapter === 3);
      expect(johnRefs).toHaveLength(1);
    });
  });

  describe('edge cases', () => {
    it('returns empty array for empty string', () => {
      expect(detectScriptureReferences('')).toEqual([]);
    });

    it('returns empty array for text with no references', () => {
      expect(detectScriptureReferences('Just a regular sentence about nothing')).toEqual([]);
    });

    it('handles text with HTML-like content', () => {
      // detectScriptureReferences works on plain text; detectScripture strips HTML
      const refs = detectScriptureReferences('John 3:16');
      expect(refs).toHaveLength(1);
    });
  });
});

// ─── Unit: inline translation abbreviations ─────────────
describe('normalizeInlineTranslationAbbreviation', () => {
  it('maps NASB 1995 to NASB', () => {
    expect(normalizeInlineTranslationAbbreviation('NASB 1995')).toBe('NASB');
    expect(normalizeInlineTranslationAbbreviation('nasb  1995')).toBe('NASB');
  });

  it('uppercases single-token codes', () => {
    expect(normalizeInlineTranslationAbbreviation('esv')).toBe('ESV');
    expect(normalizeInlineTranslationAbbreviation('MSG')).toBe('MSG');
  });
});

describe('matchTrailingTranslationAbbreviation', () => {
  it('matches NASB 1995 with surrounding whitespace', () => {
    const m = matchTrailingTranslationAbbreviation('  NASB 1995  ');
    expect(m).not.toBeNull();
    expect(m!.canonicalId).toBe('NASB');
    expect(m!.consumed).toBe('  NASB 1995  ');
  });

  it('matches NASB alone', () => {
    const m = matchTrailingTranslationAbbreviation(' NASB');
    expect(m!.canonicalId).toBe('NASB');
  });

  it('returns null when extra words follow', () => {
    expect(matchTrailingTranslationAbbreviation(' ESV more')).toBeNull();
  });
});

describe('matchAnchoredTrailingTranslationAbbreviation', () => {
  it('matches NLT when prose follows on the same line', () => {
    const m = matchAnchoredTrailingTranslationAbbreviation(' NLT and see what we need');
    expect(m).not.toBeNull();
    expect(m!.canonicalId).toBe('NLT');
    expect(m!.consumed).toBe(' NLT');
  });

  it('matches NASB 1995 with following punctuation', () => {
    const m = matchAnchoredTrailingTranslationAbbreviation(' NASB 1995, clearer here');
    expect(m).not.toBeNull();
    expect(m!.canonicalId).toBe('NASB');
    expect(m!.consumed).toBe(' NASB 1995');
  });

  it('returns null when abbrev is part of a longer word', () => {
    expect(matchAnchoredTrailingTranslationAbbreviation(' NLTish')).toBeNull();
  });

  it('still matches block-end abbrev (parity with matchTrailingTranslationAbbreviation)', () => {
    const m = matchAnchoredTrailingTranslationAbbreviation('  NASB 1995  ');
    expect(m).not.toBeNull();
    expect(m!.canonicalId).toBe('NASB');
  });
});

describe('detectScriptureReferencesWithTranslation', () => {
  it('parses trailing NASB 1995 as translation NASB', () => {
    const refs = detectScriptureReferencesWithTranslation('John 3:16 NASB 1995');
    expect(refs).toHaveLength(1);
    expect(refs[0].translation).toBe('NASB');
  });

  it('parses trailing ESV', () => {
    const refs = detectScriptureReferencesWithTranslation('John 3:16 ESV');
    expect(refs).toHaveLength(1);
    expect(refs[0].translation).toBe('ESV');
  });
});

// ─── Integration: detectScripture (async, strips HTML) ───
describe('detectScripture', () => {
  it('returns isScripture: false for empty text', async () => {
    const result = await detectScripture('');
    expect(result.isScripture).toBe(false);
    expect(result.references).toEqual([]);
    expect(result.confidence).toBe(0);
  });

  it('strips HTML before detection', async () => {
    const result = await detectScripture('<p>Read <b>John 3:16</b> today</p>');
    expect(result.isScripture).toBe(true);
    expect(result.references).toHaveLength(1);
    expect(result.references[0].book).toBe('John');
  });

  it('returns high confidence for detected references', async () => {
    const result = await detectScripture('John 3:16');
    expect(result.confidence).toBe(0.9);
    expect(result.type).toBe('reference');
  });

  it('returns isScripture: false for non-scripture text', async () => {
    const result = await detectScripture('Hello world, this is a test');
    expect(result.isScripture).toBe(false);
    expect(result.type).toBeNull();
  });
});

// ─── Cross-chapter ranges ────────────────────────────────
describe('cross-chapter ranges', () => {
  it('detects "Exodus 6:28-7:7" as a single reference with endChapter', () => {
    const refs = detectScriptureReferences('Read Exodus 6:28-7:7 tonight');
    expect(refs).toHaveLength(1);
    expect(refs[0].book).toBe('Exodus');
    expect(refs[0].chapter).toBe(6);
    expect(refs[0].endChapter).toBe(7);
    expect(refs[0].verse).toEqual([28, 7]);
    expect(refs[0].reference).toBe('Exodus 6:28-7:7');
  });

  it('does not orphan the end chapter into a second pill', () => {
    const refs = detectScriptureReferences('Exodus 6:28-7:7');
    expect(refStrings(refs)).toEqual(['Exodus 6:28-7:7']);
  });

  it('detects "Genesis 1:31-2:3"', () => {
    const refs = detectScriptureReferences('Genesis 1:31-2:3');
    expect(refs).toHaveLength(1);
    expect(refs[0].chapter).toBe(1);
    expect(refs[0].endChapter).toBe(2);
    expect(refs[0].verse).toEqual([31, 3]);
  });

  it('parseScriptureReference surfaces endChapter', () => {
    const parsed = parseScriptureReference('Exodus 6:28-7:7');
    expect(parsed).not.toBeNull();
    expect(parsed!.chapter).toBe(6);
    expect(parsed!.endChapter).toBe(7);
    expect(parsed!.verse).toEqual([28, 7]);
  });

  it('canonicalizes spacing/abbreviation', () => {
    expect(normalizeScriptureReference('Ex 6:28 - 7:7')).toBe('Exodus 6:28-7:7');
  });

  it('does not treat a same-chapter range as cross-chapter', () => {
    const refs = detectScriptureReferences('Exodus 6:28-31');
    expect(refs).toHaveLength(1);
    expect(refs[0].endChapter).toBeUndefined();
    expect(refs[0].verse).toEqual([28, 31]);
  });

  it('leaves chapter-only ranges ("Matthew 5-7") working', () => {
    const refs = detectScriptureReferences('Matthew 5-7');
    expect(refs).toHaveLength(1);
    expect(refs[0].reference).toBe('Matthew 5-7');
    expect(refs[0].endChapter).toBeUndefined();
  });

  it('rejects an out-of-range end verse', () => {
    // Exodus 7 has 25 verses — 7:99 is invalid, so it should not detect a valid cross-chapter ref.
    expect(validateCrossChapterRange('Exodus', 6, 28, 7, 99)).toBe(false);
  });

  it('validates a real cross-chapter range', () => {
    expect(validateCrossChapterRange('Exodus', 6, 28, 7, 7)).toBe(true);
  });

  it('rejects a backwards cross-chapter range', () => {
    expect(validateCrossChapterRange('Exodus', 7, 7, 6, 28)).toBe(false);
  });
});

// ─── Canonical display form ──────────────────────────────
describe('canonicalizeScriptureReferenceDisplay', () => {
  it('capitalizes a lowercase book name', () => {
    expect(canonicalizeScriptureReferenceDisplay('exodus 16:13')).toBe('Exodus 16:13');
  });

  it('expands an abbreviation to the canonical book name', () => {
    expect(canonicalizeScriptureReferenceDisplay('ex 16:13')).toBe('Exodus 16:13');
    expect(canonicalizeScriptureReferenceDisplay('1 cor 13:4-7')).toBe('1 Corinthians 13:4-7');
  });

  it('preserves chapter-only shape instead of expanding it', () => {
    // normalizeScriptureReference expands to a verse range; pill text must stay chapter-only.
    // "Psalms" (not "Psalm") is the canonical name in bible-study-keywords + bible-chapters.json.
    expect(canonicalizeScriptureReferenceDisplay('psalm 23')).toBe('Psalms 23');
    expect(normalizeScriptureReference('psalm 23')).toBe('Psalms 23:1-6');
  });

  it('preserves a chapter range', () => {
    expect(canonicalizeScriptureReferenceDisplay('matthew 5-7')).toBe('Matthew 5-7');
  });

  it('preserves a cross-chapter verse range', () => {
    expect(canonicalizeScriptureReferenceDisplay('exodus 6:28-7:7')).toBe('Exodus 6:28-7:7');
  });

  it('tightens spacing around colons and dashes', () => {
    expect(canonicalizeScriptureReferenceDisplay('John 3: 16 - 17')).toBe('John 3:16-17');
  });

  it('leaves an unrecognized book untouched', () => {
    expect(canonicalizeScriptureReferenceDisplay('Zorblax 3:16')).toBe('Zorblax 3:16');
  });

  it('is idempotent', () => {
    const once = canonicalizeScriptureReferenceDisplay('exodus 16:13-15');
    expect(canonicalizeScriptureReferenceDisplay(once)).toBe(once);
  });
});

// ─── Canonical resolvability gate ────────────────────────
describe('checkScriptureReferenceValidity', () => {
  it('accepts a valid single verse and range', () => {
    expect(checkScriptureReferenceValidity('Exodus 16:13')).toEqual({ ok: true });
    expect(checkScriptureReferenceValidity('Exodus 16:13-15')).toEqual({ ok: true });
  });

  it('rejects the dropped-dash typo that produced unloadable pills', () => {
    // "Exodus 16:1315" is what you get when the "-" is swallowed on iOS.
    const result = checkScriptureReferenceValidity('Exodus 16:1315');
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('Exodus 16 has 36 verses.');
  });

  it('accepts the last verse of the longest chapter', () => {
    expect(checkScriptureReferenceValidity('Psalm 119:176')).toEqual({ ok: true });
  });

  it('rejects a verse past the end of the chapter', () => {
    expect(checkScriptureReferenceValidity('Psalm 119:177').ok).toBe(false);
  });

  it('accepts a valid cross-chapter range', () => {
    expect(checkScriptureReferenceValidity('Exodus 6:28-7:7')).toEqual({ ok: true });
  });

  it('rejects a cross-chapter range whose end verse is out of range', () => {
    expect(checkScriptureReferenceValidity('Exodus 6:28-7:99').ok).toBe(false);
  });

  it('accepts chapter-only and chapter-range shapes', () => {
    expect(checkScriptureReferenceValidity('Psalm 23')).toEqual({ ok: true });
    expect(checkScriptureReferenceValidity('Matthew 5-7')).toEqual({ ok: true });
  });

  it('rejects a chapter past the end of the book', () => {
    const result = checkScriptureReferenceValidity('Jude 2');
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('Jude has 1 chapter.');
  });

  it('rejects an incomplete reference', () => {
    expect(checkScriptureReferenceValidity('Exodus').ok).toBe(false);
    expect(checkScriptureReferenceValidity('').ok).toBe(false);
  });

  it('accepts lowercase input (validity is independent of casing)', () => {
    expect(checkScriptureReferenceValidity('exodus 16:13')).toEqual({ ok: true });
  });
});

describe('repairUnresolvableReference', () => {
  it('recovers the range when a hyphen was dropped and the split is unambiguous', () => {
    // What iOS predictive text does to "Exodus 16:16-20".
    expect(repairUnresolvableReference('Exodus 16:1620')).toBe('Exodus 16:16-20');
  });

  it('returns null when more than one split would be valid', () => {
    // Psalm 119 has 176 verses, so both 1-156 and 11-56 are real ranges. Guessing
    // between them would silently rewrite the user's reference.
    expect(repairUnresolvableReference('Psalm 119:1156')).toBeNull();
  });

  it('recovers where a long chapter still leaves only one real range', () => {
    // 1|234 is past 176 and 123|4 runs backwards, so 12-34 is the only candidate.
    expect(repairUnresolvableReference('Psalm 119:1234')).toBe('Psalms 119:12-34');
  });

  it('returns null for a reference that already resolves', () => {
    expect(repairUnresolvableReference('Exodus 16:16-20')).toBeNull();
    expect(repairUnresolvableReference('John 3:16')).toBeNull();
  });

  it('returns null when no split lands inside the chapter', () => {
    expect(repairUnresolvableReference('John 3:9999')).toBeNull();
  });

  it('returns null for an unknown book', () => {
    expect(repairUnresolvableReference('Hezekiah 4:1620')).toBeNull();
  });

  it('ignores splits that would invent a leading zero', () => {
    // 1|05 is not something a user typed; only a genuine 10-5 style split counts,
    // and that runs backwards, so there is nothing to recover.
    expect(repairUnresolvableReference('John 3:105')).toBeNull();
  });

  it('normalizes the book name in the repaired output', () => {
    expect(repairUnresolvableReference('exodus 16:1620')).toBe('Exodus 16:16-20');
  });
});

describe('unresolvable references are rejected, not just warned about', () => {
  it('treats a dropped-hyphen range as unresolvable', () => {
    expect(isResolvableScriptureReference('Exodus 16:1620')).toBe(false);
  });

  it('still detects it, because detection is deliberately permissive', () => {
    // This is exactly why the resolvability gate exists: a `.length === 0` check
    // on detection passes here and let the broken pill through.
    expect(detectScriptureReferences('Exodus 16:1620').length).toBeGreaterThan(0);
  });
});
