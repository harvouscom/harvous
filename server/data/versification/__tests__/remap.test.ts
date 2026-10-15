import { describe, it, expect } from 'vitest';
import { cleanNabreText, englishCandidates, parseVrsMappings, remapVerses } from '../remap.mjs';

const first = (book: string, chapter: number, verse: number, versification: 'org' | 'vul') =>
  englishCandidates(book, chapter, verse, versification).find((c) => c.verse > 0);

describe('parseVrsMappings', () => {
  it('pairs equal ranges verse by verse and fans a single verse out over a range', () => {
    const map = parseVrsMappings('PSA 51:1-2 = PSA 51:3-4\nPSA 51:0 = PSA 51:1-2\n# comment\nESG 1:1 = ESG 1:1a');
    expect(map.get('PSA 51:1')).toEqual(['PSA 51:3']);
    expect(map.get('PSA 51:2')).toEqual(['PSA 51:4']);
    expect(map.get('PSA 51:0')).toEqual(['PSA 51:1', 'PSA 51:2']);
    expect(map.has('ESG 1:1')).toBe(false);
  });
});

describe('englishCandidates', () => {
  it('takes Hebrew numbering to English', () => {
    expect(first('PSA', 51, 12, 'org')).toEqual({ book: 'PSA', chapter: 51, verse: 10 });
    expect(first('JOL', 3, 1, 'org')).toEqual({ book: 'JOL', chapter: 2, verse: 28 });
    expect(first('JOL', 4, 1, 'org')).toEqual({ book: 'JOL', chapter: 3, verse: 1 });
    expect(first('MAL', 3, 23, 'org')).toEqual({ book: 'MAL', chapter: 4, verse: 5 });
  });

  it('takes Vulgate numbering through the Hebrew to English', () => {
    expect(first('PSA', 50, 12, 'vul')).toEqual({ book: 'PSA', chapter: 51, verse: 10 });
    expect(first('PSA', 22, 1, 'vul')).toEqual({ book: 'PSA', chapter: 23, verse: 1 });
  });

  it('leaves a Psalm title on verse 0', () => {
    expect(englishCandidates('PSA', 51, 1, 'org').every((c) => c.verse === 0)).toBe(true);
  });
});

describe('remapVerses', () => {
  it('drops titles, renumbers, and joins two source verses that share an English verse', () => {
    const { verses, report } = remapVerses(
      [
        { book: 'PSA', chapter: 51, verse: 1, text: 'For the leader.' },
        { book: 'PSA', chapter: 51, verse: 2, text: 'when Nathan came to him.' },
        { book: 'PSA', chapter: 51, verse: 3, text: 'Have mercy on me, God.' },
        { book: 'JOL', chapter: 4, verse: 1, text: 'For see, in those days.' },
        { book: 'EST', chapter: 2, verse: 1, text: 'In the second year.' },
        { book: 'EST', chapter: 1, verse: 1, text: 'Addition A.' },
      ],
      'NABRE',
    );
    expect(report.titlesDropped).toBe(2);
    expect(report.outsideCanon).toEqual(['EST 1:1']);
    expect(verses).toEqual([
      { book: 'Esther', chapter: 1, verse: 1, text: 'In the second year.' },
      { book: 'Psalms', chapter: 51, verse: 1, text: 'Have mercy on me, God.' },
      { book: 'Joel', chapter: 3, verse: 1, text: 'For see, in those days.' },
    ]);
  });

  it('moves a verse the tables misplace when the reference wording says so', () => {
    // The source prints English 1:17 as 2:1, as the Douay-Rheims does in Jonah.
    const reference = [
      { book: 'Jonah', chapter: 1, verse: 16, text: 'the sailors feared and offered sacrifice' },
      { book: 'Jonah', chapter: 1, verse: 17, text: 'great fish swallowed Jonah three days nights' },
      { book: 'Jonah', chapter: 2, verse: 1, text: 'Jonah prayed from the belly of the fish' },
      { book: 'Jonah', chapter: 2, verse: 2, text: 'distress called answered Sheol voice' },
    ];
    const { verses, report } = remapVerses(
      [
        { book: 'JON', chapter: 1, verse: 16, text: 'the sailors feared and offered sacrifice' },
        { book: 'JON', chapter: 2, verse: 1, text: 'great fish swallowed Jonah three days nights' },
        { book: 'JON', chapter: 2, verse: 2, text: 'Jonah prayed from the belly of the fish' },
        { book: 'JON', chapter: 2, verse: 3, text: 'distress called answered Sheol voice' },
      ],
      'DRB',
      { reference },
    );
    expect(report.moved).toContain('JON 2:1 → 1:17');
    expect(verses.find((v) => v.chapter === 1 && v.verse === 17)?.text).toMatch(/great fish/);
  });
});

describe('cleanNabreText', () => {
  it('removes flattened daggers and Psalm stanza numerals, and nothing else', () => {
    expect(cleanNabreText('t It shall come to pass', 'JOL')).toBe('It shall come to pass');
    expect(cleanNabreText('I Have mercy on me, God', 'PSA')).toBe('Have mercy on me, God');
    expect(cleanNabreText('He said: I I love you, Lord', 'PSA')).toBe('He said: I love you, Lord');
    expect(cleanNabreText('A psalm of David. I The Lord is my shepherd;', 'PSA')).toBe(
      'A psalm of David. The Lord is my shepherd;',
    );
    expect(cleanNabreText('I will bless you', 'PSA')).toBe('I will bless you');
    expect(cleanNabreText('I Have it', 'GEN')).toBe('I Have it');
  });
});
