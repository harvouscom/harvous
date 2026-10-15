/**
 * Write src/data/deuterocanon-chapters.json: the chapters only the Catholic translations carry.
 *
 * Usage:
 *   node server/data/versification/_build_deuterocanon_table.mjs
 *
 * Each chapter's last verse is the longest of the English table (`eng.vrs`, the RSV's numbering)
 * and the NABRE and Douay-Rheims where they keep their own numbering (`KEPT_NUMBERING`), read
 * from their raw downloads. Re-run after re-downloading either translation, then re-run
 * `_remap.mjs` for both.
 *
 * Rows have the same shape as bible-chapters.json. The seven books and the Prayer of Azariah take
 * `bookOrder` 67–74 (appended, so no stored `bookOrder` for Genesis–Revelation moves). Esther 10
 * (from verse 4), 11–16 and Daniel 13–14 extend books the 66 already have, under their own order.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { DEUTERO_BOOKS, USFM_BOOKS } from './remap.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../../..');
const BIBLES = join(ROOT, 'server/data/bibles');

/** Harvous names for the appended books, in `DEUTERO_BOOKS` order. */
export const DEUTERO_NAMES = {
  TOB: 'Tobit',
  JDT: 'Judith',
  WIS: 'Wisdom',
  SIR: 'Sirach',
  BAR: 'Baruch',
  '1MA': '1 Maccabees',
  '2MA': '2 Maccabees',
  S3Y: 'Prayer of Azariah',
};

/** Chapters of shared books that only exist in the Catholic translations: [code, chapter, first verse]. */
const EXTENDED_CHAPTERS = [
  ['EST', 10, 4],
  ...[11, 12, 13, 14, 15, 16].map((c) => ['EST', c, 1]),
  ['DAN', 13, 1],
  ['DAN', 14, 1],
];

function engTable() {
  const out = new Map();
  for (const line of readFileSync(join(__dirname, 'eng.vrs'), 'utf-8').split(/\r?\n/)) {
    const m = /^([1-4A-Z]{3}) (\d+:\d+(?: \d+:\d+)*)\s*$/.exec(line);
    if (!m) continue;
    out.set(m[1], new Map(m[2].split(' ').map((cv) => cv.split(':').map(Number))));
  }
  return out;
}

/**
 * Books whose source numbering survives renumbering, per translation. The NABRE's deuterocanon
 * is numbered like the Greek, as `eng.vrs` is (give or take a verse). The Douay-Rheims' Wisdom,
 * Baruch and Maccabees are mapped onto that numbering by `vul.vrs`; its Tobit, Judith and Sirach
 * translate the Vulgate's longer Latin text, have no mapping, and keep their printed numbers.
 */
const KEPT_NUMBERING = {
  NABRE: DEUTERO_BOOKS,
  DRB: ['TOB', 'JDT', 'SIR'],
};

/** Highest verse per `code chapter` in one translation's raw download (source numbering). */
function corpusCounts(translationId) {
  const counts = new Map();
  const rawPath = join(BIBLES, 'raw', `${translationId}.json`);
  if (!existsSync(rawPath)) {
    console.warn(`  No raw download for ${translationId}; its longer chapters won't be in the table.`);
    return counts;
  }
  for (const v of JSON.parse(readFileSync(rawPath, 'utf-8'))) {
    if (!KEPT_NUMBERING[translationId].includes(v.book)) continue;
    const k = `${v.book} ${v.chapter}`;
    counts.set(k, Math.max(counts.get(k) ?? 0, v.verse));
  }
  return counts;
}

function main() {
  const eng = engTable();
  const corpora = ['NABRE', 'DRB'].map(corpusCounts);
  const longest = (code, chapter, fallback = 0) =>
    Math.max(fallback, eng.get(code)?.get(chapter) ?? 0, ...corpora.map((c) => c.get(`${code} ${chapter}`) ?? 0));

  const rows = [];
  for (const [code, chapter, startVerse] of EXTENDED_CHAPTERS) {
    const book = code === 'EST' ? 'Esther' : 'Daniel';
    const fixed = { 'EST 10': 13, 'EST 11': 12, 'EST 12': 6, 'EST 13': 18, 'EST 14': 19, 'EST 15': 19, 'EST 16': 24 };
    const endVerse = code === 'EST' ? fixed[`${code} ${chapter}`] : longest('DAN', chapter, chapter === 13 ? 64 : 42);
    rows.push({ book, bookOrder: USFM_BOOKS.indexOf(code) + 1, testament: 'old', chapter, startVerse, endVerse });
  }
  DEUTERO_BOOKS.forEach((code, i) => {
    const chapters = code === 'S3Y' ? new Map([[1, 67]]) : eng.get(code);
    for (const chapter of chapters.keys()) {
      rows.push({
        book: DEUTERO_NAMES[code],
        bookOrder: USFM_BOOKS.length + i + 1,
        testament: 'old',
        chapter,
        startVerse: 1,
        endVerse: code === 'S3Y' ? 67 : longest(code, chapter),
      });
    }
  });

  rows.sort((a, b) => a.bookOrder - b.bookOrder || a.chapter - b.chapter);
  const out = join(ROOT, 'src/data/deuterocanon-chapters.json');
  writeFileSync(out, `${JSON.stringify(rows, null, 2)}\n`);
  console.log(`${rows.length} chapters → ${out}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
