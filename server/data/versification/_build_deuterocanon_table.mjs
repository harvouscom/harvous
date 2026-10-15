/**
 * Write src/data/deuterocanon-chapters.json: the chapters only the Catholic translations carry.
 *
 * Usage:
 *   node server/data/versification/_build_deuterocanon_table.mjs
 *
 * Each chapter's last verse is the longest of the English table (`eng.vrs`, the RSV's numbering)
 * and the NABRE and Douay-Rheims as Harvous stores them. Where a corpus file doesn't carry the
 * deuterocanon yet, its raw download stands in, so the first import isn't cut short by a table
 * built before it. Re-run after re-importing either translation, then re-run `_remap.mjs` for both.
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

/** Highest verse per `code chapter` in one translation: its stored corpus, else its raw download. */
function corpusCounts(translationId) {
  const counts = new Map();
  const bump = (code, chapter, verse) => {
    const k = `${code} ${chapter}`;
    counts.set(k, Math.max(counts.get(k) ?? 0, verse));
  };
  const finalPath = join(BIBLES, `${translationId}.json`);
  const codeByName = new Map([
    ...Object.entries(DEUTERO_NAMES).map(([code, name]) => [name, code]),
    ['Esther', 'EST'],
    ['Daniel', 'DAN'],
  ]);
  const final = existsSync(finalPath) ? JSON.parse(readFileSync(finalPath, 'utf-8')) : [];
  if (final.some((v) => v.book === 'Tobit')) {
    for (const v of final) if (codeByName.has(v.book)) bump(codeByName.get(v.book), v.chapter, v.verse);
    return counts;
  }
  const rawPath = join(BIBLES, 'raw', `${translationId}.json`);
  if (!existsSync(rawPath)) return counts;
  for (const v of JSON.parse(readFileSync(rawPath, 'utf-8'))) {
    // Raw Esther and Daniel are in the source's own layout; only the books themselves count here.
    if (DEUTERO_BOOKS.includes(v.book)) bump(v.book, v.chapter, v.verse);
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
