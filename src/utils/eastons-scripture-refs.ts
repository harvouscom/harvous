const DASH = '[-–—]';

const EASTONS_ABBREV_MAP: Record<string, string> = {
  'Gen.': 'Genesis',
  'Ex.': 'Exodus',
  'Lev.': 'Leviticus',
  'Num.': 'Numbers',
  'Deut.': 'Deuteronomy',
  'Josh.': 'Joshua',
  'Judg.': 'Judges',
  '1 Sam.': '1 Samuel',
  '2 Sam.': '2 Samuel',
  '1 Chr.': '1 Chronicles',
  '2 Chr.': '2 Chronicles',
  'Neh.': 'Nehemiah',
  'Esth.': 'Esther',
  'Ps.': 'Psalms',
  'Prov.': 'Proverbs',
  'Eccl.': 'Ecclesiastes',
  'Cant.': 'Song of Solomon',
  'Isa.': 'Isaiah',
  'Jer.': 'Jeremiah',
  'Lam.': 'Lamentations',
  'Ezek.': 'Ezekiel',
  'Dan.': 'Daniel',
  'Hos.': 'Hosea',
  'Obad.': 'Obadiah',
  'Nah.': 'Nahum',
  'Hab.': 'Habakkuk',
  'Zeph.': 'Zephaniah',
  'Hag.': 'Haggai',
  'Zech.': 'Zechariah',
  'Mal.': 'Malachi',
  'Matt.': 'Matthew',
  'Rom.': 'Romans',
  '1 Cor.': '1 Corinthians',
  '2 Cor.': '2 Corinthians',
  'Gal.': 'Galatians',
  'Eph.': 'Ephesians',
  'Phil.': 'Philippians',
  'Col.': 'Colossians',
  '1 Thess.': '1 Thessalonians',
  '2 Thess.': '2 Thessalonians',
  '1 Tim.': '1 Timothy',
  '2 Tim.': '2 Timothy',
  'Heb.': 'Hebrews',
  '1 Pet.': '1 Peter',
  '2 Pet.': '2 Peter',
  'Rev.': 'Revelation',
};

const FULL_NAME_BOOKS = [
  'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy',
  'Joshua', 'Judges', 'Ruth',
  '1 Samuel', '2 Samuel', '1 Kings', '2 Kings',
  '1 Chronicles', '2 Chronicles',
  'Ezra', 'Nehemiah', 'Esther',
  'Job', 'Psalms', 'Psalm', 'Proverbs', 'Ecclesiastes', 'Song of Solomon',
  'Isaiah', 'Jeremiah', 'Lamentations', 'Ezekiel', 'Daniel',
  'Hosea', 'Joel', 'Amos', 'Obadiah', 'Jonah', 'Micah',
  'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah', 'Malachi',
  'Matthew', 'Mark', 'Luke', 'John', 'Acts',
  'Romans', '1 Corinthians', '2 Corinthians', 'Galatians', 'Ephesians',
  'Philippians', 'Colossians', '1 Thessalonians', '2 Thessalonians',
  '1 Timothy', '2 Timothy', 'Titus', 'Philemon',
  'Hebrews', 'James', '1 Peter', '2 Peter',
  '1 John', '2 John', '3 John', 'Jude', 'Revelation',
];

const FULL_NAME_BOOKS_SET = new Set(FULL_NAME_BOOKS.map((b) => b.toLowerCase()));

const FULL_NAME_CANONICAL: Record<string, string> = { Psalm: 'Psalms' };

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildPattern(): RegExp {
  const abbrevKeys = Object.keys(EASTONS_ABBREV_MAP).sort((a, b) => b.length - a.length);
  const fullNames = [...FULL_NAME_BOOKS].sort((a, b) => b.length - a.length);

  const abbrevAlts = abbrevKeys.map(escapeRegex);
  const fullAlts = fullNames.map(escapeRegex);
  const bookAlts = [...abbrevAlts, ...fullAlts].join('|');

  const verseGroup = `\\d+(?:\\s*${DASH}\\s*\\d+)?`;
  const commaGroups = `(?:,\\s*${verseGroup})*`;
  const crossChapter = `(?:\\s*${DASH}\\s*\\d+:\\d+)?`;

  return new RegExp(
    `(?:Comp\\.\\s+)?` +
      `(${bookAlts})` +
      `\\s+(\\d+)` +
      `(?::(${verseGroup}${commaGroups})${crossChapter})?` +
      `(?=[\\s;,.)\\]!?]|$)`,
    'g',
  );
}

const PATTERN = buildPattern();

export interface EastonsScriptureRef {
  raw: string;
  canonical: string;
}

function canonicalBook(matched: string): string {
  const trimmed = matched.trim();
  if (EASTONS_ABBREV_MAP[trimmed]) return EASTONS_ABBREV_MAP[trimmed];
  if (FULL_NAME_CANONICAL[trimmed]) return FULL_NAME_CANONICAL[trimmed];
  return trimmed;
}

function dedupe(refs: EastonsScriptureRef[]): EastonsScriptureRef[] {
  const seen = new Set<string>();
  return refs.filter((r) => {
    const key = r.canonical.replace(/\s+/g, ' ').replace(/[–—]/g, '-');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Detect scripture references in Easton's dictionary entry body text.
 * When `headwordBook` is a Bible book name, also picks up bare `chapter:verse`
 * references (e.g. "3:15; 12:3") contextual to that book.
 */
export function detectEastonsScriptureRefs(
  body: string,
  headwordBook?: string | null,
): EastonsScriptureRef[] {
  const refs: EastonsScriptureRef[] = [];
  PATTERN.lastIndex = 0;

  let m: RegExpExecArray | null;
  while ((m = PATTERN.exec(body)) !== null) {
    const fullMatch = m[0];
    const bookRaw = m[1];
    const book = canonicalBook(bookRaw);

    const compPrefix = /^Comp\.\s+/i;
    const compMatch = fullMatch.match(compPrefix);
    const refRaw = fullMatch.slice(compMatch ? compMatch[0].length : 0);

    const afterBook = refRaw.slice(bookRaw.length);
    const canonical = book + afterBook.replace(/[–—]/g, '-');

    refs.push({ raw: refRaw, canonical });
  }

  // Bare chapter:verse references when headword is a Bible book
  if (headwordBook && FULL_NAME_BOOKS_SET.has(headwordBook.toLowerCase())) {
    const canonBook =
      FULL_NAME_CANONICAL[headwordBook] ?? FULL_NAME_BOOKS.find((b) => b.toLowerCase() === headwordBook.toLowerCase()) ?? headwordBook;

    const barePattern = new RegExp(
      `(?<=[(;,\\s])` +
        `(\\d+):(\\d+(?:\\s*${DASH}\\s*\\d+)?)` +
        `(?=[\\s;,.)\\]!?]|$)`,
      'g',
    );

    let bm: RegExpExecArray | null;
    while ((bm = barePattern.exec(body)) !== null) {
      const raw = bm[0];
      const canonical = `${canonBook} ${raw.replace(/[–—]/g, '-')}`;
      refs.push({ raw, canonical });
    }
  }

  return dedupe(refs);
}
