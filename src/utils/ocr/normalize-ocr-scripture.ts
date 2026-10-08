/**
 * Repair Scripture references in text read off a photo, before the detector sees it.
 *
 * The detector is deliberately strict — it runs on what people type, where a loose match is a
 * pill nobody asked for. A scanned page breaks it in ways typing never does: a colon read as a
 * semicolon or a full stop ("John 3;16"), a 1 read as l or I ("John 3:l6"), the space dropped
 * from "1Co", the full stop printed after an abbreviation ("Jn."), the translation set in
 * brackets ("(ESV)"). Each of those either loses the reference or — worse — turns it into a
 * different one, so this rewrites them into the one shape the detector reads.
 *
 * It only ever touches a span that starts with a book it knows and continues with chapter
 * numbers. Prose is left exactly as it was read; a word that merely looks like an abbreviation
 * ("Is", "Am") needs the full stop that marks it as one.
 */
import { TRANSLATION_ORDER } from '@/data/translations';

/** Numbered books, by every spelling of the part after the number. */
const NUMBERED_BOOK_BASES: Record<string, string> = {
  samuel: 'Samuel', sam: 'Samuel', sa: 'Samuel', sm: 'Samuel',
  kings: 'Kings', kgs: 'Kings', ki: 'Kings', kg: 'Kings',
  chronicles: 'Chronicles', chron: 'Chronicles', chr: 'Chronicles', ch: 'Chronicles',
  corinthians: 'Corinthians', cor: 'Corinthians', co: 'Corinthians',
  thessalonians: 'Thessalonians', thess: 'Thessalonians', thes: 'Thessalonians', th: 'Thessalonians',
  timothy: 'Timothy', tim: 'Timothy', ti: 'Timothy', tm: 'Timothy',
  peter: 'Peter', pet: 'Peter', pe: 'Peter', pt: 'Peter',
  john: 'John', jn: 'John', jhn: 'John', jo: 'John',
};

/**
 * Every other book, by its name and the abbreviations printed Bibles, study guides and sermon
 * handouts use (SBL plus the common short forms). Values are the names the detector knows.
 */
const BOOKS: Record<string, string> = {
  genesis: 'Genesis', gen: 'Genesis', ge: 'Genesis', gn: 'Genesis',
  exodus: 'Exodus', exod: 'Exodus', exo: 'Exodus', ex: 'Exodus',
  leviticus: 'Leviticus', lev: 'Leviticus', le: 'Leviticus', lv: 'Leviticus',
  numbers: 'Numbers', num: 'Numbers', nu: 'Numbers', nm: 'Numbers',
  deuteronomy: 'Deuteronomy', deut: 'Deuteronomy', dt: 'Deuteronomy', de: 'Deuteronomy',
  joshua: 'Joshua', josh: 'Joshua', jos: 'Joshua',
  judges: 'Judges', judg: 'Judges', jdg: 'Judges', jg: 'Judges',
  ruth: 'Ruth', ru: 'Ruth', rth: 'Ruth',
  ezra: 'Ezra', ezr: 'Ezra',
  nehemiah: 'Nehemiah', neh: 'Nehemiah', ne: 'Nehemiah',
  esther: 'Esther', esth: 'Esther', est: 'Esther',
  job: 'Job', jb: 'Job',
  psalm: 'Psalm', psalms: 'Psalm', ps: 'Psalm', pss: 'Psalm', psa: 'Psalm', psm: 'Psalm',
  proverbs: 'Proverbs', prov: 'Proverbs', prv: 'Proverbs', pr: 'Proverbs',
  ecclesiastes: 'Ecclesiastes', eccl: 'Ecclesiastes', eccles: 'Ecclesiastes', ecc: 'Ecclesiastes', ec: 'Ecclesiastes', qoh: 'Ecclesiastes',
  isaiah: 'Isaiah', isa: 'Isaiah', is: 'Isaiah',
  jeremiah: 'Jeremiah', jer: 'Jeremiah', je: 'Jeremiah', jr: 'Jeremiah',
  lamentations: 'Lamentations', lam: 'Lamentations', la: 'Lamentations',
  ezekiel: 'Ezekiel', ezek: 'Ezekiel', eze: 'Ezekiel', ezk: 'Ezekiel',
  daniel: 'Daniel', dan: 'Daniel', da: 'Daniel', dn: 'Daniel',
  hosea: 'Hosea', hos: 'Hosea', ho: 'Hosea',
  joel: 'Joel', jl: 'Joel',
  amos: 'Amos', am: 'Amos',
  obadiah: 'Obadiah', obad: 'Obadiah', ob: 'Obadiah',
  jonah: 'Jonah', jon: 'Jonah', jnh: 'Jonah',
  micah: 'Micah', mic: 'Micah', mi: 'Micah',
  nahum: 'Nahum', nah: 'Nahum', na: 'Nahum',
  habakkuk: 'Habakkuk', hab: 'Habakkuk', hb: 'Habakkuk',
  zephaniah: 'Zephaniah', zeph: 'Zephaniah', zep: 'Zephaniah', zp: 'Zephaniah',
  haggai: 'Haggai', hag: 'Haggai', hg: 'Haggai',
  zechariah: 'Zechariah', zech: 'Zechariah', zec: 'Zechariah', zc: 'Zechariah',
  malachi: 'Malachi', mal: 'Malachi', ml: 'Malachi',
  matthew: 'Matthew', matt: 'Matthew', mat: 'Matthew', mt: 'Matthew',
  mark: 'Mark', mk: 'Mark', mrk: 'Mark', mr: 'Mark',
  luke: 'Luke', luk: 'Luke', lk: 'Luke',
  john: 'John', jn: 'John', jhn: 'John',
  acts: 'Acts', act: 'Acts', ac: 'Acts',
  // Not "Rm": on a bulletin that is a room ("Fellowship Hall, Rm 12").
  romans: 'Romans', rom: 'Romans', ro: 'Romans',
  galatians: 'Galatians', gal: 'Galatians', ga: 'Galatians',
  // Not "Ep" (an episode) nor "Pp" (pages).
  ephesians: 'Ephesians', eph: 'Ephesians', ephes: 'Ephesians',
  philippians: 'Philippians', phil: 'Philippians', php: 'Philippians',
  colossians: 'Colossians', col: 'Colossians',
  titus: 'Titus', tit: 'Titus',
  philemon: 'Philemon', philem: 'Philemon', phlm: 'Philemon', phm: 'Philemon',
  hebrews: 'Hebrews', heb: 'Hebrews',
  james: 'James', jas: 'James', jm: 'James',
  jude: 'Jude', jud: 'Jude', jd: 'Jude',
  revelation: 'Revelation', rev: 'Revelation', rv: 'Revelation', re: 'Revelation',
};

/**
 * Abbreviations that are also everyday English words. Only taken as a book when printed with
 * the full stop that marks an abbreviation — "Is. 53:5" is Isaiah, "the service is 10:30" is not.
 */
const NEEDS_ABBREVIATION_STOP = new Set(['is', 'am', 'ho', 're', 'na', 'ob', 'la', 'de', 'act']);

/** A book's own name ("Romans", "Psalms"), as opposed to an abbreviation of it. */
function isFullBookName(key: string): boolean {
  return BOOKS[key]?.toLowerCase() === key || key === 'psalms';
}

const ROMAN_PREFIX: Record<string, string> = { I: '1', II: '2', III: '3' };

/** Digits a scan commonly misreads as letters, inside a chapter or verse number only. */
const DIGIT_LOOKALIKES: Record<string, string> = { l: '1', I: '1', '|': '1', i: '1', O: '0', o: '0' };

/** Numeric token: digits plus their look-alikes, at most three long (Psalm 119 is the ceiling). */
const NUM = '[0-9lIi|Oo]{1,3}';

/*
 * prefix   — "1", "1st", "I", "II", "III", or a 1 misread as l or |; optional, and the space after
 *            it too ("1Co", "IJohn").
 * book     — a capitalised word; looked up in the tables above, never trusted on shape alone.
 * stop     — the full stop printed after an abbreviation.
 * ch, vs   — chapter, then an optional verse after a colon-like separator.
 * tail     — ranges and verse lists: "-18", "–4:2", ", 20-22".
 */
const REFERENCE_PATTERN = new RegExp(
  // A lead character instead of a lookbehind, which Safari only learned in 16.4.
  '(?<lead>^|[^A-Za-z0-9])' +
    '(?:(?<prefix>[123](?:st|nd|rd)?|III|II|I|l|\\|)\\s?)?' +
    '(?<book>[A-Z][A-Za-z]{1,13})' +
    '(?<stop>\\.)?' +
    '\\s*' +
    `(?<ch>${NUM})` +
    // ":" may have spaces round it; "." and ";" may not, or "Psalm 23. 4 friends" and the
    // chapter list "Romans 8; 12" would both be read as a chapter and verse.
    `(?:(?:\\s*[:∶]\\s*|[;.])(?<vs>${NUM}))?` +
    // A listed verse must not run into the next reference: in "3:16, 1 Peter 2:9" the 1 is Peter's.
    `(?<tail>(?:\\s*[-–—]\\s*${NUM}(?:(?:\\s*[:∶]\\s*|[;.])${NUM})?)?(?:\\s*,\\s*${NUM}(?:\\s*[-–—]\\s*${NUM})?(?!\\s*[A-Z]))*)` +
    '(?![A-Za-z0-9])',
  'g',
);

function hasRealDigit(s: string): boolean {
  return /[0-9]/.test(s);
}

/** "l6" → "16", "1O" → "10". Null when the token is not a number once repaired. */
function repairNumber(token: string): string | null {
  const repaired = token.replace(/[lIi|Oo]/g, (ch) => DIGIT_LOOKALIKES[ch] ?? ch);
  if (!/^[0-9]+$/.test(repaired)) return null;
  const value = Number(repaired);
  if (value <= 0 || value > 176) return null;
  return String(value);
}

/** Every number in the tail repaired, separators made canonical. Null when any one fails. */
function repairTail(tail: string): string | null {
  if (!tail.trim()) return '';
  let failed = false;
  const repaired = tail.replace(new RegExp(NUM, 'g'), (token) => {
    const value = repairNumber(token);
    if (value == null) failed = true;
    return value ?? token;
  });
  if (failed) return null;
  return repaired
    .replace(/\s*[-–—]\s*/g, '-')
    .replace(/(\d)(?:\s*[:∶]\s*|[;.])(\d)/g, '$1:$2')
    .replace(/\s*,\s*/g, ', ');
}

function numberedPrefixDigit(prefix: string): string | null {
  if (/^[123]/.test(prefix)) return prefix[0]!;
  if (ROMAN_PREFIX[prefix]) return ROMAN_PREFIX[prefix]!;
  if (prefix === 'l' || prefix === '|') return '1';
  return null;
}

/**
 * Translation codes as printed next to a reference: bare, bracketed, or with an edition
 * ("NASB95", "NASB 1995"). Upper case only — "net" in a sentence is a word, "NET" by a
 * reference is a Bible.
 */
const TRANSLATION_CODES = [...TRANSLATION_ORDER].sort((a, b) => b.length - a.length);
const TRANSLATION_AFTER_REFERENCE = new RegExp(
  `^\\s*[(\\[]?\\s*(${TRANSLATION_CODES.join('|')})(?:\\s*(?:19)?95)?\\s*[)\\]]?(?![A-Za-z0-9])`,
);

/** Characters a scan produces that the detector and the note would rather not see. */
export function cleanOcrCharacters(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[   ]/g, ' ')
    .replace(/ﬁ/g, 'fi')
    .replace(/ﬂ/g, 'fl')
    .replace(/ﬀ/g, 'ff')
    .replace(/ﬃ/g, 'ffi')
    .replace(/ﬄ/g, 'ffl')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/ +\n/g, '\n')
    .trim();
}

/**
 * A reference the scan did not read cleanly: a number that was a letter ("3:l6"), a colon that
 * was a semicolon or full stop, or a roman or misread book number ("I John", "lCor"). These are
 * the ones a reader should check against the photo. Spelling out an abbreviation ("Jn." →
 * "John") is not a guess and is not listed.
 */
export type OcrScriptureRepair = {
  /** As it was read off the page, e.g. "Jn. 3;l6". */
  readAs: string;
  /** What it became, without any translation code, e.g. "John 3:16". */
  reference: string;
};

/** Numbers and separators as written, ready to compare: dashes and spacing made uniform. */
function numericShape(raw: string): string {
  return raw.replace(/[–—]/g, '-').replace(/∶/g, ':').replace(/\s+/g, '');
}

/**
 * Rewrite every reference-shaped span into the detector's shape. Idempotent: running it over
 * its own output changes nothing.
 */
export function normalizeOcrScripture(text: string): string {
  return normalizeOcrScriptureWithRepairs(text).text;
}

/** `normalizeOcrScripture`, plus which references were guesses worth checking. */
export function normalizeOcrScriptureWithRepairs(text: string): { text: string; repairs: OcrScriptureRepair[] } {
  const repairs: OcrScriptureRepair[] = [];
  const cleaned = cleanOcrCharacters(text);
  let out = '';
  let cursor = 0;
  REFERENCE_PATTERN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = REFERENCE_PATTERN.exec(cleaned)) !== null) {
    const groups = m.groups ?? {};
    const start = m.index + (groups.lead ?? '').length;
    const prefix = groups.prefix ?? '';
    const bookToken = groups.book ?? '';
    const bookKey = bookToken.toLowerCase();
    const hasStop = Boolean(groups.stop);
    const chToken = groups.ch ?? '';
    const vsToken = groups.vs ?? '';
    const tailToken = groups.tail ?? '';

    let book: string | null = null;
    let keepPrefix = '';
    const prefixDigit = prefix ? numberedPrefixDigit(prefix) : null;
    if (prefixDigit && NUMBERED_BOOK_BASES[bookKey]) {
      book = `${prefixDigit} ${NUMBERED_BOOK_BASES[bookKey]}`;
    } else if (
      BOOKS[bookKey] &&
      (!NEEDS_ABBREVIATION_STOP.has(bookKey) || hasStop) &&
      // An abbreviation with a bare number ("Jon 3", "Gen 2") is as likely a name or a word;
      // it needs a verse or the abbreviation's full stop to count.
      (isFullBookName(bookKey) || hasStop || Boolean(vsToken))
    ) {
      book = BOOKS[bookKey]!;
      // A prefix that is not a book number ("I", the pronoun, before "Mark 5:1") stays as text.
      keepPrefix = prefix ? `${prefix} ` : '';
    }
    // A chapter needs at least one digit the scanner was sure of: "John Ollie" is a name.
    const numeric = `${chToken}${vsToken}${tailToken}`;
    const chapter = book && hasRealDigit(numeric) ? repairNumber(chToken) : null;
    const verse = vsToken ? repairNumber(vsToken) : '';
    const tail = repairTail(tailToken);
    if (!book || !chapter || verse == null || tail == null) {
      // Not a reference after all. Re-scan from the next character so a real one inside it
      // (the "John 3:16" in "I John 3:16" when "I" was not a prefix) is still found.
      REFERENCE_PATTERN.lastIndex = start + 1;
      continue;
    }

    let reference = `${keepPrefix}${book} ${chapter}${verse ? `:${verse}` : ''}${tail}`;
    let end = m.index + m[0].length;
    const numbersAsRead = numericShape(cleaned.slice(start, end).slice(prefix.length).replace(/^\s*[A-Za-z]+\.?/, ''));
    const numbersAsWritten = numericShape(`${chapter}${verse ? `:${verse}` : ''}${tail}`);
    const guessedBookNumber = Boolean(prefixDigit) && !/^[123]/.test(prefix);
    if (numbersAsRead !== numbersAsWritten || guessedBookNumber) {
      repairs.push({ readAs: cleaned.slice(start, end).trim(), reference });
    }
    const translation = cleaned.slice(end).match(TRANSLATION_AFTER_REFERENCE);
    if (translation) {
      reference += ` ${translation[1]}`;
      end += translation[0].length;
    }
    out += cleaned.slice(cursor, start) + reference;
    cursor = end;
    REFERENCE_PATTERN.lastIndex = end;
  }
  return { text: out + cleaned.slice(cursor), repairs };
}
