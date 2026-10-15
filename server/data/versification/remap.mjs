/**
 * Renumber a Bible into Harvous's verse numbering.
 *
 * Harvous keys everything — pills, highlights, compare, cross-references, review — on one set of
 * verse numbers: the English numbering in `src/data/bible-chapters.json`. Most English Bibles use
 * it. Catholic Bibles don't: the NABRE follows the Hebrew numbering ("original", where a Psalm's
 * title is verse 1 and Joel has four chapters) and the Douay-Rheims follows the Latin Vulgate
 * (Psalm 22 is "The Lord ruleth me"). Stored as printed, "Psalm 51:10" would be a different verse
 * in those two than in the other eleven.
 *
 * So the import renumbers. The mapping tables are the Paratext versification files from United
 * Bible Societies (`eng.vrs`, `vul.vrs`, MIT — see LICENSE beside them). Each mapping line reads
 * `<this versification> = <original>`, so a Vulgate verse goes vul → original → English.
 *
 * What the renumbering does with text that has no English home:
 * - A verse that lands on English verse 0 (a Psalm title) is dropped, as our ESV already drops them.
 * - The Greek parts of Daniel and Esther keep the addresses Catholic Bibles give them where those
 *   don't collide with English: Daniel 13 (Susanna), Daniel 14 (Bel), Esther 10:4–16:24 in the
 *   Vulgate's layout. Daniel 3:24–90 does collide (English 3:24–30 is the fourth man in the fire),
 *   so it becomes the book "Prayer of Azariah", verse n = Daniel 3:n+23.
 * - Tobit, Judith and Sirach in the Douay-Rheims translate the Vulgate's Latin, a different text
 *   from the Greek the NABRE translates, with verses that don't correspond. No table maps them, so
 *   they keep their printed numbers, and the chapter table takes the longer of the two.
 * - Anything still outside the chapter table is dropped and listed in the report.
 * - Two source verses that land on one English verse are joined in order.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../../..');

/** USFM book codes for the 66 books, in Harvous `bookOrder` (and Bolls book id) order. */
export const USFM_BOOKS = [
  'GEN', 'EXO', 'LEV', 'NUM', 'DEU', 'JOS', 'JDG', 'RUT', '1SA', '2SA', '1KI', '2KI', '1CH', '2CH',
  'EZR', 'NEH', 'EST', 'JOB', 'PSA', 'PRO', 'ECC', 'SNG', 'ISA', 'JER', 'LAM', 'EZK', 'DAN', 'HOS',
  'JOL', 'AMO', 'OBA', 'JON', 'MIC', 'NAM', 'HAB', 'ZEP', 'HAG', 'ZEC', 'MAL',
  'MAT', 'MRK', 'LUK', 'JHN', 'ACT', 'ROM', '1CO', '2CO', 'GAL', 'EPH', 'PHP', 'COL', '1TH', '2TH',
  '1TI', '2TI', 'TIT', 'PHM', 'HEB', 'JAS', '1PE', '2PE', '1JN', '2JN', '3JN', 'JUD', 'REV',
];

/**
 * USFM codes for the books only the Catholic translations carry, in `bookOrder` 67–74 order (see
 * `src/data/deuterocanon-chapters.json`). Appended rather than placed in Catholic order so that
 * every stored `bookOrder` for Genesis–Revelation keeps its number. `S3Y` is Daniel 3:24–90,
 * which Harvous calls "Prayer of Azariah" because English Daniel 3:24–30 already has those
 * addresses. Susanna and Bel keep their Catholic addresses, Daniel 13–14.
 */
export const DEUTERO_BOOKS = ['TOB', 'JDT', 'WIS', 'SIR', 'BAR', '1MA', '2MA', 'S3Y'];

/** Every book Harvous knows, indexed by `bookOrder - 1`. */
export const ALL_BOOKS = [...USFM_BOOKS, ...DEUTERO_BOOKS];

/** Bolls' book ids for the deuterocanon (its 1–66 are Harvous's). */
export const BOLLS_DEUTERO_BOOK_IDS = { 68: 'TOB', 69: 'JDT', 70: 'WIS', 71: 'SIR', 73: 'BAR', 74: '1MA', 75: '2MA' };

/**
 * The tables carry Susanna and Bel as books of their own; Harvous keeps them where the Catholic
 * Bibles print them.
 */
const RENAMED_CODES = { SUS: 'DAN 13', BEL: 'DAN 14' };

/** The Douay-Rheims prints Esther's Greek additions after the Hebrew book, as 10:4–16:24. */
const DRB_ESTHER = Object.fromEntries(Array.from({ length: 16 }, (_, i) => [i + 1, [i + 1, 0]]));

/**
 * NABRE Esther as Bolls serves it: the Hebrew chapters and the Greek additions (A–F) numbered as
 * one run of 18 "chapters". Bolls chapter → [chapter, verse offset], or a list of
 * [first source verse, chapter, verse offset] runs where one addition spans two chapters. The
 * additions go where the Douay-Rheims prints them (checked verse by verse against its text), so
 * "Esther 13:8" is the same verse in both. Bolls has no chapter 6, so NABRE Esther 3:14–15 is
 * missing from the source.
 */
const NABRE_ESTHER = {
  1: [[1, 11, 1], [12, 12, -11]], // Addition A: 11:2–12, 12:1–6
  2: [1, 0],
  3: [2, 0],
  4: [3, 0],
  5: [13, 0], // Addition B: 13:1–7
  6: [3, 13],
  7: [4, 0],
  8: [[1, 13, 7], [12, 14, -11]], // Addition C: 13:8–18, 14:1–19
  9: [15, 3], // Addition D: 15:4–19 (the Vulgate's 15:1–3 have no Greek)
  10: [5, 0],
  11: [6, 0],
  12: [7, 0],
  13: [8, 0],
  14: [16, 0], // Addition E: 16:1–24
  15: [8, 12],
  16: [9, 0],
  17: [10, 0],
  18: [[1, 10, 3], [11, 11, -10]], // Addition F: 10:4–13, 11:1
};

/** [chapter, verse offset] for one source verse under a chapter map entry. */
function chapterMapTarget(entry, verse) {
  if (!Array.isArray(entry[0])) return entry;
  const run = entry.filter(([first]) => verse >= first).at(-1);
  return [run[1], run[2]];
}

const ROMAN_SECTION = '(?:XII|XI|X|IX|VIII|VII|VI|V|IV|III|II|I)';

/**
 * Print marks the NABRE carries in Bolls' text that aren't words: a "t" before a footnote anchor
 * (a dagger, flattened), and the Roman numerals that divide a Psalm into stanzas ("I Have mercy
 * on me, God"). The numerals open a verse or follow its title, always before a capital.
 */
export function cleanNabreText(text, book) {
  let out = text.replace(/(^|\s)t(?=\s)/g, '$1').replace(/\s+/g, ' ').trim();
  if (book === 'PSA') {
    out = out.replace(new RegExp(`(^|[.:;,!?"”’]\\s)${ROMAN_SECTION}\\s+(?=["“‘']?[A-Z])`, 'g'), '$1');
  }
  return out;
}

/**
 * How each translation's raw file is numbered.
 * - `versification`: the source numbering ('org' Hebrew, 'vul' Vulgate).
 * - `books`: per-book or per-chapter exceptions. The NABRE's Daniel 3 and 13–14 are the Greek
 *   Daniel (3:24–90 is the Song of the Three), which is the Vulgate's layout; the rest of its
 *   Daniel is Hebrew.
 * - `chapterMaps`: a source-specific chapter layout to undo before renumbering.
 * - `verseShifts`: chapters the source numbers off by a fixed amount. The Vulgate's Psalms 115
 *   and 147 are the second halves of Hebrew 116 and 147 and run 10–19 and 12–20; the Challoner
 *   Douay-Rheims restarts both at 1. The NABRE prints John 7:53 as 8:1, so its John 8 runs one
 *   ahead; a shift below verse 1 lands at the end of the chapter before.
 * - `cleanText`: source-specific marks to remove from the text.
 * - `alignWith`: the corpus whose wording checks the tables' addresses (see `align`). The nearest
 *   in style: the KJV for the Douay-Rheims, the ESV for the NABRE.
 */
export const SOURCES = {
  NABRE: {
    versification: 'org',
    books: { 'DAN 3': 'vul', 'DAN 13': 'vul', 'DAN 14': 'vul' },
    chapterMaps: { EST: NABRE_ESTHER },
    verseShifts: { 'JHN 8': -1 },
    cleanText: cleanNabreText,
    alignWith: 'ESV',
  },
  DRB: {
    versification: 'vul',
    books: {},
    chapterMaps: { EST: DRB_ESTHER },
    verseShifts: { 'PSA 115': 9, 'PSA 147': 11 },
    alignWith: 'KJV',
  },
};

const key = (book, chapter, verse) => `${book} ${chapter}:${verse}`;

function parseKey(k) {
  const m = /^(\S+) (\d+):(\d+)$/.exec(k);
  return { book: m[1], chapter: Number(m[2]), verse: Number(m[3]) };
}

function expandSide(book, chapter, start, end) {
  const out = [];
  for (let v = start; v <= (end ?? start); v++) out.push(key(book, chapter, v));
  return out;
}

/**
 * Parse the `=` lines of a .vrs file into this-versification → original verse keys. Lines with
 * lettered part-verses (`ESG 1:1 = ESG 1:1a`) are skipped; none of them touch the 66 books.
 */
export function parseVrsMappings(text) {
  const map = new Map();
  const line = /^([1-4A-Z]{3}) (\d+):(\d+)(?:-(\d+))? = ([1-4A-Z]{3}) (\d+):(\d+)(?:-(\d+))?$/;
  for (const raw of text.split(/\r?\n/)) {
    const m = line.exec(raw.trim());
    if (!m) continue;
    const left = expandSide(m[1], Number(m[2]), Number(m[3]), m[4] && Number(m[4]));
    const right = expandSide(m[5], Number(m[6]), Number(m[7]), m[8] && Number(m[8]));
    const pairs = [];
    if (left.length === right.length) left.forEach((l, i) => pairs.push([l, right[i]]));
    else if (left.length === 1) right.forEach((r) => pairs.push([left[0], r]));
    else if (right.length === 1) left.forEach((l) => pairs.push([l, right[0]]));
    // The vendored file has one malformed line (`DAG 3:52-23`), in a book Harvous doesn't carry.
    else if (ALL_BOOKS.includes(m[1])) {
      throw new Error(`Unequal ranges in versification line: ${raw}`);
    }
    for (const [l, r] of pairs) {
      if (!map.has(l)) map.set(l, []);
      map.get(l).push(r);
    }
  }
  return map;
}

function invert(map) {
  const inv = new Map();
  for (const [from, tos] of map) {
    for (const to of tos) {
      if (!inv.has(to)) inv.set(to, []);
      inv.get(to).push(from);
    }
  }
  return inv;
}

let tables;
function loadTables() {
  if (!tables) {
    const read = (f) => readFileSync(join(__dirname, f), 'utf-8');
    tables = {
      vulToOrg: parseVrsMappings(read('vul.vrs')),
      orgToEng: invert(parseVrsMappings(read('eng.vrs'))),
    };
  }
  return tables;
}

/**
 * Every English address one source verse may land on, in table order. A verse the tables split
 * (a Vulgate verse that is half title, half verse 1) has more than one; the caller takes the first
 * that is a real verse.
 */
export function englishCandidates(book, chapter, verse, versification) {
  const { vulToOrg, orgToEng } = loadTables();
  const source = key(book, chapter, verse);
  let orgs = [source];
  if (versification === 'vul') {
    orgs = vulToOrg.get(source);
    // Past the end of a mapped range (an edition with one more verse than the tables, like the
    // Douay-Rheims' Psalm 15:11), continue from the verse before rather than fall back to the
    // same number, which would land it in a different Psalm.
    for (let back = 1; !orgs && back <= 2; back++) {
      const prev = vulToOrg.get(key(book, chapter, verse - back));
      if (prev) orgs = prev.slice(-1).map((k) => {
        const p = parseKey(k);
        return key(p.book, p.chapter, p.verse + back);
      });
    }
    orgs ??= [source];
  }
  return orgs.flatMap((org) => orgToEng.get(org) ?? [org]).map(parseKey).map(harvousAddress);
}

/** The tables' Greek-Daniel codes, at the addresses Harvous keeps them. */
function harvousAddress(c) {
  if (c.book === 'DAG') return { ...c, book: 'DAN' };
  const renamed = RENAMED_CODES[c.book];
  if (!renamed) return c;
  const [book, chapter] = renamed.split(' ');
  return { book, chapter: Number(chapter), verse: c.verse };
}

/**
 * The chapter table every Catholic translation is renumbered into: the 66 books, extended by the
 * deuterocanon table (its own books, and the extra chapters and verses of Esther and Daniel).
 */
export function loadChapterTable() {
  const read = (f) => JSON.parse(readFileSync(join(ROOT, 'src/data', f), 'utf-8'));
  const byCode = new Map(); // 'PSA' → { name, order, chapters: Map<chapter, endVerse> }
  for (const r of [...read('bible-chapters.json'), ...read('deuterocanon-chapters.json')]) {
    const code = ALL_BOOKS[r.bookOrder - 1];
    if (!byCode.has(code)) byCode.set(code, { name: r.book, order: r.bookOrder, chapters: new Map() });
    const chapters = byCode.get(code).chapters;
    chapters.set(r.chapter, Math.max(chapters.get(r.chapter) ?? 0, r.endVerse));
  }
  for (const book of byCode.values()) book.chapters = new Map([...book.chapters].sort((a, b) => a[0] - b[0]));
  return byCode;
}

/** Content-word stems for comparing two translations of one verse. */
const STOP = new Set(
  ('the and of to in that he his him for with they them is be it was not shall will thou thy thee ye you ' +
    'your all their this which unto my me from but as are by have hath upon on so at were an we our us or ' +
    'when there then what who said had into no her she its these those do did').split(' '),
);
export function stems(text) {
  return new Set(
    (text.toLowerCase().match(/[a-z]+/g) ?? []).filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.slice(0, 5)),
  );
}
function similarity(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / Math.min(a.size, b.size);
}

/** How far the tables are trusted over the wording, and what a join or a gap costs. */
const PRIOR = 0.35;
const JOIN_COST = 0.15;
const GAP_COST = 0.15;
const BAND = 6;

/**
 * Correct the tables' addresses against a reference translation, one book at a time.
 *
 * The tables describe the Vulgate and the Hebrew, not every edition of them. The Challoner
 * Douay-Rheims divides verses its own way in dozens of places (1 Thessalonians 4, Exodus 39,
 * Jonah 1:17, which it prints as 2:1), and a one-verse slip early in a chapter misplaces every
 * verse after it. So each source verse keeps its order and its table address as a prior, and a
 * banded alignment against the reference's wording may move it a few verses either way: onto the
 * next address, onto the same one (two source verses printed as one English verse), or past one
 * (an English verse the source folds into its neighbour). It moves only where the wording
 * outweighs the prior.
 */
function align(units, targets, refStems) {
  const index = new Map(targets.map((t, i) => [t, i]));
  const m = units.length;
  const n = targets.length;
  const sims = units.map((u) => stems(u.text));
  const lo = (i) => Math.max(0, index.get(units[i].proposed) - BAND);
  const hi = (i) => Math.min(n - 1, index.get(units[i].proposed) + BAND);
  const score = (i, j) =>
    similarity(sims[i], refStems.get(targets[j]) ?? new Set()) + (targets[j] === units[i].proposed ? PRIOR : 0);

  const best = [];
  const from = [];
  for (let i = 0; i < m; i++) {
    best.push(new Map());
    from.push(new Map());
    for (let j = lo(i); j <= hi(i); j++) {
      let top = -Infinity;
      let arg = -1;
      if (i === 0) {
        top = -GAP_COST * j;
      } else {
        for (const [pj, prev] of best[i - 1]) {
          if (pj > j || j - pj > 3) continue;
          const cost = pj === j ? JOIN_COST : GAP_COST * (j - pj - 1);
          if (prev - cost > top) {
            top = prev - cost;
            arg = pj;
          }
        }
      }
      if (top === -Infinity) continue;
      best[i].set(j, top + score(i, j));
      from[i].set(j, arg);
    }
  }

  let j = -1;
  let top = -Infinity;
  for (const [cj, val] of best[m - 1]) {
    const total = val - GAP_COST * (n - 1 - cj);
    if (total > top) {
      top = total;
      j = cj;
    }
  }
  if (j < 0) return units.map((x) => x.proposed); // no monotone path inside the band; keep the tables
  const out = new Array(m);
  for (let i = m - 1; i >= 0; i--) {
    out[i] = targets[j];
    j = from[i].get(j);
  }
  return out;
}

/**
 * Renumber raw verses (`{ book: USFM code, chapter, verse, text }`, in source order) into Harvous
 * verses (`{ book: Harvous name, chapter, verse, text }`, in canonical order), plus a report of
 * everything that didn't map one-to-one.
 */
export function remapVerses(raw, translationId, { reference } = {}) {
  const source = SOURCES[translationId];
  if (!source) throw new Error(`No versification source configured for ${translationId}`);
  const books = loadChapterTable();

  const report = { titlesDropped: 0, outsideCanon: [], moved: [], joined: [], missing: [] };
  const unitsByBook = new Map(); // USFM code → [{ proposed: eng key, text, order }]

  raw.forEach((v, order) => {
    let { chapter, verse } = v;
    const chapterMap = source.chapterMaps[v.book];
    if (chapterMap) {
      const to = chapterMap[chapter];
      if (to === undefined) throw new Error(`${translationId} ${v.book} ${chapter} is not in its chapter map`);
      const [toChapter, offset] = chapterMapTarget(to, verse);
      chapter = toChapter;
      verse += offset;
    }

    const versification =
      source.books[`${v.book} ${chapter}`] ?? source.books[v.book] ?? source.versification;
    verse += source.verseShifts?.[`${v.book} ${chapter}`] ?? 0;
    if (verse < 1) {
      chapter -= 1;
      verse += books.get(v.book).chapters.get(chapter);
    }

    const candidates = englishCandidates(v.book, chapter, verse, versification);
    const endOf = (c) => books.get(c.book)?.chapters.get(c.chapter) ?? 0;
    let eng = candidates.find((c) => c.verse > 0 && c.verse <= endOf(c));
    // A verse or two past a chapter's end is a different verse division, not missing text: start
    // it on the last verse and let the alignment place it. (Not for a mapped book, where the
    // overflow is an addition, like Esther 10:4–13.)
    const over = candidates.find((c) => endOf(c) && c.verse > endOf(c) && c.verse <= endOf(c) + 2);
    if (!eng && over && !chapterMap) eng = { ...over, verse: endOf(over) };
    if (!eng) {
      if (candidates.some((c) => c.verse === 0)) report.titlesDropped++;
      else report.outsideCanon.push(`${key(v.book, chapter, verse)} → ${key(candidates[0].book, candidates[0].chapter, candidates[0].verse)}`);
      return;
    }
    if (!unitsByBook.has(eng.book)) unitsByBook.set(eng.book, []);
    const text = source.cleanText ? source.cleanText(v.text, v.book) : v.text;
    unitsByBook.get(eng.book).push({ proposed: key(eng.book, eng.chapter, eng.verse), text, order });
  });

  const refStems = new Map();
  if (reference) {
    const codeByName = new Map([...books].map(([code, b]) => [b.name, code]));
    for (const r of reference) refStems.set(key(codeByName.get(r.book), r.chapter, r.verse), stems(r.text));
  }

  const byTarget = new Map(); // eng key → texts[]
  for (const [code, units] of unitsByBook) {
    const targets = [];
    for (const [chapter, endVerse] of books.get(code).chapters) {
      for (let verse = 1; verse <= endVerse; verse++) targets.push(key(code, chapter, verse));
    }
    const rank = new Map(targets.map((t, i) => [t, i]));
    units.sort((a, b) => rank.get(a.proposed) - rank.get(b.proposed) || a.order - b.order);
    const placed = reference ? align(units, targets, refStems) : units.map((x) => x.proposed);
    units.forEach((unit, i) => {
      if (placed[i] !== unit.proposed) report.moved.push(`${unit.proposed} → ${placed[i].split(' ')[1]}`);
      if (!byTarget.has(placed[i])) byTarget.set(placed[i], []);
      byTarget.get(placed[i]).push(unit.text);
      if (byTarget.get(placed[i]).length === 2) report.joined.push(placed[i]);
    });
  }

  const verses = [...byTarget]
    .map(([k, texts]) => {
      const { book, chapter, verse } = parseKey(k);
      return { order: books.get(book).order, book: books.get(book).name, chapter, verse, text: texts.join(' ') };
    })
    .sort((a, b) => a.order - b.order || a.chapter - b.chapter || a.verse - b.verse)
    .map(({ order, ...v }) => v);

  for (const [code, book] of books) {
    for (const [chapter, endVerse] of book.chapters) {
      for (let verse = 1; verse <= endVerse; verse++) {
        if (!byTarget.has(key(code, chapter, verse))) report.missing.push(key(code, chapter, verse));
      }
    }
  }

  return { verses, report };
}
