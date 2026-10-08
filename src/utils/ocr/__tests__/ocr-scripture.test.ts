import { describe, expect, it } from 'vitest';
import { normalizeOcrScripture, cleanOcrCharacters } from '../normalize-ocr-scripture';
import { findScriptureInOcrText, ocrTextToParagraphs, type OcrSegment } from '../ocr-scripture';
import { detectScriptureReferences, parseScriptureReference } from '../../scripture-detector';

const refStrings = (text: string) => detectScriptureReferences(text).map((r) => r.reference);

function referenceSegments(text: string) {
  return findScriptureInOcrText(text)
    .paragraphs.flat()
    .filter((s): s is Extract<OcrSegment, { kind: 'reference' }> => s.kind === 'reference')
    .map((s) => ({ text: s.text, translation: s.translation }));
}

describe('normalizeOcrScripture — what a scan does to a reference', () => {
  it.each([
    ['John 3;16', 'John 3:16'],
    ['John 3.16', 'John 3:16'],
    ['John 3 : 16', 'John 3:16'],
    ['John 3:l6', 'John 3:16'],
    ['John 3:I6', 'John 3:16'],
    ['John l0:1O', 'John 10:10'],
    ['Jn. 3:16', 'John 3:16'],
    ['Jn 3:16', 'John 3:16'],
    ['1Co 13:4-7', '1 Corinthians 13:4-7'],
    ['1 Cor. 13:4', '1 Corinthians 13:4'],
    ['I John 3:16', '1 John 3:16'],
    ['II Kings 2:1', '2 Kings 2:1'],
    ['III John 1:4', '3 John 1:4'],
    ['IJohn 4:8', '1 John 4:8'],
    ['lCor 13:13', '1 Corinthians 13:13'],
    ['2Tim 3:16', '2 Timothy 3:16'],
    ['Eph. 2:8–9', 'Ephesians 2:8-9'],
    ['Phil 4:13', 'Philippians 4:13'],
    ['Phm 1:6', 'Philemon 1:6'],
    ['Php 4:6', 'Philippians 4:6'],
    ['Ps 23:1', 'Psalm 23:1'],
    ['Is. 53:5', 'Isaiah 53:5'],
    ['Matt 5:3-12', 'Matthew 5:3-12'],
    ['Romans 8:28 (ESV)', 'Romans 8:28 ESV'],
    ['Romans 8:28 [NIV]', 'Romans 8:28 NIV'],
    ['Romans 8:28 NASB95', 'Romans 8:28 NASB'],
    ['Romans 8:28 NASB 1995', 'Romans 8:28 NASB'],
    ['Exodus 6:28-7:7', 'Exodus 6:28-7:7'],
    ['Matthew 26:6-13, 17-30', 'Matthew 26:6-13, 17-30'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeOcrScripture(input)).toBe(expected);
  });

  it.each([
    'The service is 10:30 on Sunday.',
    'Doors open at 9:15 Am sharp',
    'Fellowship Hall, Rm 12',
    'Watch Ep 4 before group',
    'Read pp. 12-14 for next week',
    'Jon 3 asked a question',
    'And I John saw the holy city',
    'Psalm 23. 4 friends came.',
    'We covered Romans 8; 12 next week',
    'It was 2023 and John 316 people came',
    'net gain of 3:16 minutes',
  ])('leaves prose alone: %s', (input) => {
    // Unchanged except for character clean-up.
    expect(normalizeOcrScripture(input)).toBe(cleanOcrCharacters(input));
  });

  it('keeps a listed verse from swallowing the next book’s number', () => {
    expect(normalizeOcrScripture('John 3:16, 1 Peter 2:9')).toBe('John 3:16, 1 Peter 2:9');
    expect(normalizeOcrScripture('John 3:16, 18')).toBe('John 3:16, 18');
  });

  it('is idempotent', () => {
    const once = normalizeOcrScripture('Jn. 3;l6 (ESV) and 1Co 13:4-7 NIV, I John 4:8');
    expect(normalizeOcrScripture(once)).toBe(once);
  });

  it('cleans ligatures, smart quotes and no-break spaces', () => {
    expect(cleanOcrCharacters('“ﬁrst” and ‘ﬂock’')).toBe('"first" and \'flock\'');
  });
});

describe('detector regressions the scan exposed', () => {
  it('reads "I John" as 1 John, not the Gospel of John', () => {
    const refs = detectScriptureReferences('I John 3:16');
    expect(refs).toHaveLength(1);
    expect(refs[0]!.book).toBe('1 John');
    expect(parseScriptureReference('II Kings 2:1')?.book).toBe('2 Kings');
  });

  it('does not turn "John 3.16" or "John 3;16" into the whole of John 3', () => {
    expect(refStrings('John 3.16')).toEqual([]);
    expect(refStrings('John 3;16')).toEqual([]);
    expect(refStrings('Matthew 5-7.2')).toEqual([]);
  });

  it('still finds a chapter at the end of a sentence', () => {
    expect(refStrings('Read Psalm 23.')).toEqual(['Psalm 23']);
    expect(refStrings('Read Psalm 23; then pray.')).toEqual(['Psalm 23']);
  });
});

describe('findScriptureInOcrText', () => {
  it('fixture: a sermon handout', () => {
    const handout = [
      'Week 3 — Rooted in Love',
      '',
      'Read Jn. 3;l6 (ESV) together, then 1Co 13:4-7 NIV.',
      'Memory verse: I John 4:8',
      '',
      '• Romans 8:28',
      '• Eph. 2:8–9',
    ].join('\n');
    expect(referenceSegments(handout)).toEqual([
      { text: 'John 3:16', translation: 'ESV' },
      { text: '1 Corinthians 13:4-7', translation: 'NIV' },
      { text: '1 John 4:8', translation: null },
      { text: 'Romans 8:28', translation: null },
      { text: 'Ephesians 2:8-9', translation: null },
    ]);
  });

  it('gives each citation its own translation, not the last one on the page', () => {
    expect(referenceSegments('Rom 8:28 ESV; 1 Cor 13:4 NIV')).toEqual([
      { text: 'Romans 8:28', translation: 'ESV' },
      { text: '1 Corinthians 13:4', translation: 'NIV' },
    ]);
  });

  it('pills a reference every time it is cited, and summarises it once', () => {
    const result = findScriptureInOcrText('John 3:16 says it. Later, John 3:16 again.');
    expect(referenceSegments('John 3:16 says it. Later, John 3:16 again.')).toHaveLength(2);
    expect(result.references).toMatchObject([
      { key: 'john 3:16', text: 'John 3:16', translation: null, occurrences: 2, readAs: null },
    ]);
  });

  it('does not let "John 3" claim the front of "John 3:16"', () => {
    expect(referenceSegments('John 3 is long; John 3:16 is the centre.')).toEqual([
      { text: 'John 3:16', translation: null },
    ]);
  });

  it('keeps every character of the text across the segments', () => {
    const text = 'Read Romans 8:28 ESV today, and Psalm 23.';
    const joined = findScriptureInOcrText(text)
      .paragraphs.flat()
      .map((s) => (s.kind === 'text' ? s.text : `${s.text}${s.translationText}`))
      .join('');
    expect(joined).toBe(text);
  });
});

describe('what the reader should check', () => {
  it('flags only the references the scan had to guess at, with how it read them', () => {
    const result = findScriptureInOcrText(
      'Read Jn. 3;l6 (ESV), then Romans 8:28, Eph. 2:8–9, I John 4:8 and John 3 : 17.',
    );
    const readAs = Object.fromEntries(result.references.map((r) => [r.text, r.readAs]));
    expect(readAs).toEqual({
      'John 3:16': 'Jn. 3;l6',
      'Romans 8:28': null,
      // An abbreviation spelled out and an en dash are not guesses.
      'Ephesians 2:8-9': null,
      // "I" could have been the pronoun.
      '1 John 4:8': 'I John 4:8',
      // Spacing round a real colon is not a misread.
      'John 3:17': null,
    });
  });

  it('keeps the words around each citation, so a card can say where it came from', () => {
    const [ref] = findScriptureInOcrText('This week we read Romans 8:28 ESV together in group.').references;
    expect(ref!.context).toBe('This week we read Romans 8:28 ESV together in group.');
  });
});

describe('ocrTextToParagraphs', () => {
  it('rejoins lines the page broke, mends hyphenation, and keeps short lines and lists apart', () => {
    const text = [
      'For God so loved the world, that he gave his only Son, that whoever be-',
      'lieves in him should not perish but have eternal life.',
      'Discussion',
      '1. What does loved mean here?',
      '2. Who is the world?',
    ].join('\n');
    expect(ocrTextToParagraphs(text)).toEqual([
      'For God so loved the world, that he gave his only Son, that whoever believes in him should not perish but have eternal life.',
      'Discussion',
      '1. What does loved mean here?',
      '2. Who is the world?',
    ]);
  });
});
