import { describe, expect, it } from 'vitest';
import {
  CARRIED,
  IS_HIS,
  decorateRedLetter,
  detectQuoteStyle,
  quoteSegments,
  redLetterRanges,
  type RedLetterData,
} from '../red-letter';

const data = (patterns: RedLetterData['patterns'], extra: Partial<RedLetterData> = {}): RedLetterData => ({
  patterns,
  ranges: {},
  overrides: {},
  ...extra,
});

/** The verse with its red stretches bracketed, so expectations read like the page. */
function marked(
  verses: { number: number; text: string }[],
  d: RedLetterData,
  translation = 'NET',
  book = 'John',
  chapter = 4,
): string[] {
  const ranges = redLetterRanges(book, chapter, translation, verses, d);
  return verses.map(({ number, text }) => {
    let t = text;
    for (const [s, e] of [...(ranges.get(number) ?? [])].reverse()) {
      t = `${t.slice(0, s)}[${t.slice(s, e)}]${t.slice(e)}`;
    }
    return t;
  });
}

describe('detectQuoteStyle', () => {
  it('reads the style off the chapter', () => {
    expect(detectQuoteStyle(['Jesus replied, “I tell you…”'])).toBe('curly');
    expect(detectQuoteStyle(['Jesus said, "You\'re right."'])).toBe('double');
    expect(detectQuoteStyle(["Jesus said, 'Truly.'"])).toBe('single');
    expect(detectQuoteStyle(['Jesus answered and said unto him, Verily'])).toBe('none');
  });
});

describe('redLetterRanges', () => {
  it('colours the quotation and leaves the narration black (John 3:3)', () => {
    const d = data({ 'John 3:3': [IS_HIS] });
    const verse = (text: string) => marked([{ number: 3, text }], d, 'X', 'John', 3)[0];
    expect(verse('Jesus replied, “I tell you the solemn truth.”')).toBe(
      'Jesus replied, [“I tell you the solemn truth.”]',
    );
    expect(verse("Jesus answered, 'Truly, truly, I say to you.'")).toBe(
      "Jesus answered, ['Truly, truly, I say to you.']",
    );
    expect(verse('Jesus said, "You\'re absolutely right."')).toBe('Jesus said, ["You\'re absolutely right."]');
  });

  it('follows WEB on which quotation is His in a dialogue verse', () => {
    const d = data({ 'John 4:17': [0, IS_HIS] });
    expect(
      marked(
        [{ number: 17, text: 'The woman replied, “I have no husband.” Jesus said to her, “Right you are.”' }],
        d,
      ),
    ).toEqual(['The woman replied, “I have no husband.” Jesus said to her, [“Right you are.”]']);
  });

  it('carries a speech across verses and reopened paragraphs', () => {
    const d = data({ 'Matthew 5:3': [IS_HIS], 'Matthew 5:4': [IS_HIS | CARRIED], 'Matthew 5:5': [IS_HIS | CARRIED] });
    const verses = [
      { number: 2, text: 'Then he began to teach them by saying:' },
      { number: 3, text: '“Blessed are the poor in spirit,' },
      { number: 4, text: '“Blessed are those who mourn,' },
      { number: 5, text: 'for they will inherit the earth.”' },
    ];
    expect(marked(verses, d, 'NET', 'Matthew', 5)).toEqual([
      'Then he began to teach them by saying:',
      '[“Blessed are the poor in spirit,]',
      '[“Blessed are those who mourn,]',
      '[for they will inherit the earth.”]',
    ]);
  });

  it('keeps quotations nested three deep inside the speech', () => {
    const d = data({ 'Matthew 22:4': [IS_HIS | CARRIED], 'Matthew 22:5': [IS_HIS | CARRIED] });
    const verses = [
      { number: 2, text: '“The kingdom of heaven is like a king.' },
      { number: 4, text: 'He sent slaves, saying, ‘Tell them, “Look! The feast is ready.”’' },
      { number: 5, text: 'But they were indifferent.”' },
    ];
    expect(marked(verses, d, 'NET', 'Matthew', 22).slice(1)).toEqual([
      '[He sent slaves, saying, ‘Tell them, “Look! The feast is ready.”’]',
      '[But they were indifferent.”]',
    ]);
  });

  it('treats apostrophes and possessives as words, not quotes, in single-quoted text', () => {
    const verses = [
      { number: 7, text: "Jesus said to her, 'Give Me My Father's cup; don't fear the disciples' doubt.'" },
    ];
    const segs = quoteSegments(verses, 'single').get(7)!;
    expect(segs).toHaveLength(1);
    expect(verses[0].text.slice(segs[0].start, segs[0].end)).toBe(
      "'Give Me My Father's cup; don't fear the disciples' doubt.'",
    );
  });

  it('closes NASB doubled marks and spaced marks', () => {
    const verses = [
      { number: 3, text: "when he said, 'THE VOICE OF ONE, 'MAKE READY THE WAY!''" },
      { number: 4, text: 'Now John himself had a garment.' },
      { number: 5, text: "Is it easier to say, 'Get up, and walk '?" },
      { number: 6, text: 'And he got up.' },
    ];
    const segs = quoteSegments(verses, 'single');
    expect(segs.has(4)).toBe(false);
    expect(segs.get(5)).toHaveLength(1);
    expect(segs.has(6)).toBe(false);
  });

  it('reads AMP opening quotes with a space inside them', () => {
    const d = data({ 'Matthew 4:19': [IS_HIS] });
    expect(
      marked([{ number: 19, text: 'And He said to them, " Follow Me, and I will make you fishers of men."' }], d, 'AMP', 'Matthew', 4),
    ).toEqual(['And He said to them, [" Follow Me, and I will make you fishers of men."]']);
  });

  it('joins a quotation broken by its speech tag, leaving the tag black', () => {
    const d = data({ 'Matthew 15:34': [IS_HIS, 0] });
    expect(
      marked(
        [{ number: 34, text: '“How many loaves do you have?” Jesus asked them. “Seven,” they said, “and a few fish.”' }],
        d,
        'CSB',
        'Matthew',
        15,
      ),
    ).toEqual(['[“How many loaves do you have?”] Jesus asked them. “Seven,” they said, “and a few fish.”']);

    const d2 = data({ 'Mark 8:29': [IS_HIS] });
    expect(
      marked([{ number: 29, text: '“But you,” he asked them, “who do you say that I am?”' }], d2, 'CSB', 'Mark', 8),
    ).toEqual(['[“But you,”] he asked them, [“who do you say that I am?”]']);
  });

  it('does not join two speakers just because a comma sits between them', () => {
    const d = data({ 'Matthew 17:26': [0, IS_HIS] });
    expect(
      marked(
        [{ number: 26, text: 'After he said, “From foreigners,” Jesus said to him, “Then the sons are free.”' }],
        d,
        'NET',
        'Matthew',
        17,
      ),
    ).toEqual(['After he said, “From foreigners,” Jesus said to him, [“Then the sons are free.”]']);
  });

  it('leaves a verse black when its quotations do not line up with WEB', () => {
    const d = data({ 'Mark 8:29': [IS_HIS, 0] });
    expect(
      marked(
        [{ number: 29, text: '“But what about you?” he asked. “Who do you say I am?” Peter answered, “The Messiah.”' }],
        d,
        'NIV',
        'Mark',
        8,
      ),
    ).toEqual(['“But what about you?” he asked. “Who do you say I am?” Peter answered, “The Messiah.”']);
  });

  it('never colours a carried speech WEB says the verse does not open in', () => {
    // A misread mark upstream left a quotation open; the verse starts in narration in WEB.
    const d = data({ 'Matthew 9:9': [IS_HIS] });
    const verses = [
      { number: 8, text: '“Something unclosed' },
      { number: 9, text: 'He saw Matthew and said to him, “Follow Me!” And he got up.' },
    ];
    expect(marked(verses, d, 'NET', 'Matthew', 9)[1]).toBe(verses[1].text);
  });

  it('uses explicit ranges for translations without quotation marks', () => {
    const d = data({ 'John 3:3': [IS_HIS] }, { ranges: { KJV: { 'John 3:3': [[34, 49]] } } });
    expect(
      marked([{ number: 3, text: 'Jesus answered and said unto him, Verily, verily.' }], d, 'KJV', 'John', 3),
    ).toEqual(['Jesus answered and said unto him, [Verily, verily.]']);
  });

  it('lets an override replace the pattern or blank a verse', () => {
    const text = 'Jesus replied, “Yes.” They said, “No.”';
    const base = { 'John 1:1': [IS_HIS, 0] };
    expect(marked([{ number: 1, text }], data(base, { overrides: { 'NET|John 1:1': [0, IS_HIS] } }), 'NET', 'John', 1)).toEqual([
      'Jesus replied, “Yes.” They said, [“No.”]',
    ]);
    expect(marked([{ number: 1, text }], data(base, { overrides: { 'NET|John 1:1': [] } }), 'NET', 'John', 1)).toEqual([text]);
  });
});

describe('decorateRedLetter', () => {
  it('wraps ranges across existing markup without moving any text', () => {
    // "Jesus said, “Go <mark>and</mark> sin no more.”" — the highlight splits the quotation.
    const html = 'Jesus said, “Go <mark data-x="1">and</mark> sin no more.”';
    const out = decorateRedLetter(html, [[12, 33]]);
    expect(out).toBe(
      'Jesus said, <span class="pds-reader__wj">“Go </span><mark data-x="1"><span class="pds-reader__wj">and</span></mark><span class="pds-reader__wj"> sin no more.”</span>',
    );
  });

  it('counts entities as the characters they stand for', () => {
    const out = decorateRedLetter('A &amp; B said, “C.”', [[12, 16]]);
    expect(out).toBe('A &amp; B said, <span class="pds-reader__wj">“C.”</span>');
  });

  it('returns the markup untouched with no ranges', () => {
    expect(decorateRedLetter('<b>x</b>', [])).toBe('<b>x</b>');
  });
});
