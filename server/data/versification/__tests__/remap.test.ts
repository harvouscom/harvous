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
    expect(report.outsideCanon).toEqual([]);
    expect(verses).toEqual([
      { book: 'Esther', chapter: 1, verse: 1, text: 'In the second year.' },
      // Addition A goes where the Douay-Rheims prints it.
      { book: 'Esther', chapter: 11, verse: 2, text: 'Addition A.' },
      { book: 'Psalms', chapter: 51, verse: 1, text: 'Have mercy on me, God.' },
      { book: 'Joel', chapter: 3, verse: 1, text: 'For see, in those days.' },
    ]);
  });

  it('keeps the Greek parts of Daniel and Esther at Catholic addresses that do not collide', () => {
    const { verses } = remapVerses(
      [
        { book: 'DAN', chapter: 3, verse: 23, text: 'fell bound into the furnace' },
        { book: 'DAN', chapter: 3, verse: 24, text: 'They walked about in the flames' },
        { book: 'DAN', chapter: 3, verse: 90, text: 'Bless the God of gods' },
        { book: 'DAN', chapter: 3, verse: 91, text: 'Then King Nebuchadnezzar was startled' },
        { book: 'DAN', chapter: 13, verse: 1, text: 'In Babylon there lived a man named Joakim' },
        { book: 'DAN', chapter: 14, verse: 2, text: 'Daniel was the king’s companion' },
        // Addition C runs across two Vulgate chapters: C11 is 13:18, C12 is 14:1.
        { book: 'EST', chapter: 8, verse: 11, text: 'All Israel cried out' },
        { book: 'EST', chapter: 8, verse: 12, text: 'Queen Esther fled to the Lord' },
        // Addition F: 10:4–13, then the colophon at 11:1.
        { book: 'EST', chapter: 18, verse: 1, text: 'This is the work of God' },
        { book: 'EST', chapter: 18, verse: 11, text: 'In the fourth year of Ptolemy' },
      ],
      'NABRE',
    );
    const at = (book: string, chapter: number, verse: number) =>
      verses.find((v) => v.book === book && v.chapter === chapter && v.verse === verse)?.text;
    expect(at('Daniel', 3, 23)).toBe('fell bound into the furnace');
    expect(at('Prayer of Azariah', 1, 1)).toBe('They walked about in the flames');
    expect(at('Prayer of Azariah', 1, 67)).toBe('Bless the God of gods');
    expect(at('Daniel', 3, 24)).toBe('Then King Nebuchadnezzar was startled');
    expect(at('Daniel', 13, 1)).toBe('In Babylon there lived a man named Joakim');
    expect(at('Daniel', 14, 2)).toBe('Daniel was the king’s companion');
    expect(at('Esther', 13, 18)).toBe('All Israel cried out');
    expect(at('Esther', 14, 1)).toBe('Queen Esther fled to the Lord');
    expect(at('Esther', 10, 4)).toBe('This is the work of God');
    expect(at('Esther', 11, 1)).toBe('In the fourth year of Ptolemy');
  });

  it('keeps the Douay-Rheims Tobit numbering, which no table maps', () => {
    const { verses, report } = remapVerses(
      [
        { book: 'TOB', chapter: 1, verse: 25, text: 'Tobias of the tribe of Nephtali' },
        { book: 'SIR', chapter: 1, verse: 40, text: 'Exalt not thyself' },
      ],
      'DRB',
      { reference: [{ book: 'Genesis', chapter: 1, verse: 1, text: 'In the beginning' }] },
    );
    expect(report.outsideCanon).toEqual([]);
    expect(report.moved).toEqual([]);
    expect(verses).toEqual([
      { book: 'Tobit', chapter: 1, verse: 25, text: 'Tobias of the tribe of Nephtali' },
      { book: 'Sirach', chapter: 1, verse: 40, text: 'Exalt not thyself' },
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
