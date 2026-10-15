/**
 * Import a public-domain Bible from an eBible.org USFM zip, then renumber it.
 *
 * Usage:
 *   node server/data/bibles/_import_usfm.mjs DRB
 *
 * Sources (add one here to import another eBible text):
 *   DRB — Douay-Rheims, 1899 American edition of the Challoner revision (eBible.org `engDRA`).
 *         Public domain. Vulgate numbering, so _remap.mjs renumbers it.
 *
 * Bolls also serves a DRB, but it has none of the deuterocanonical books and misnumbers the end of
 * the Psalms (152 of them), which is why this one comes from eBible.
 *
 * Writes: server/data/bibles/raw/<ID>.json, then server/data/bibles/<ID>.json via _remap.mjs.
 * Then:   npx tsx server/scripts/seed-bible-verses.ts <ID>
 *
 * Keeps the 66 books and the deuterocanon. Daniel 3:24–90 and 13–14 and Esther 10:4–16:24 arrive
 * inside DAN and EST and are placed by _remap.mjs.
 */

import { writeFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { ALL_BOOKS } from '../versification/remap.mjs';
import { writeRemapped } from './_remap.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const USFM_SOURCES = {
  DRB: 'https://ebible.org/Scriptures/engDRA_usfm.zip',
};

/** Paragraph, poetry and title markers that carry no text of their own worth keeping. */
const DROP_LINE = /^\\(id|ide|h|toc\d|mt\d?|ms\d?|s\d?|cl|d|r|rem)\b/;

/** Verse text with USFM character markup removed: `\w word|strong="H0835"\w*` → `word`. */
export function cleanUsfmText(text) {
  return text
    .replace(/\\f .*?\\f\*/g, '') // footnotes
    .replace(/\\x .*?\\x\*/g, '') // cross-references
    .replace(/\\\+?w ([^|\\]*?)(?:\|[^\\]*)?\\\+?w\*/g, '$1') // tagged words keep the word
    .replace(/\\\+?[a-z]+\d*\*?/g, '') // any other marker, open or close
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** `{ book, chapter, verse, text }` for every verse in one USFM book. */
export function parseUsfmBook(usfm) {
  const id = /\\id (\S+)/.exec(usfm)?.[1];
  const verses = [];
  let chapter = 0;
  let current = null;
  const flush = () => {
    if (current) {
      const text = cleanUsfmText(current.parts.join(' '));
      if (text) verses.push({ book: id, chapter, verse: current.verse, text });
    }
    current = null;
  };

  for (const rawLine of usfm.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || DROP_LINE.test(line)) continue;
    const c = /^\\c (\d+)/.exec(line);
    if (c) {
      flush();
      chapter = Number(c[1]);
      continue;
    }
    // A line can hold a paragraph marker, then a verse, then more verses.
    const pieces = line.split(/(?=\\v \d+ )/);
    for (const piece of pieces) {
      const v = /^\\v (\d+) (.*)$/.exec(piece);
      if (v) {
        flush();
        current = { verse: Number(v[1]), parts: [v[2]] };
      } else if (current) {
        current.parts.push(piece);
      }
    }
  }
  flush();
  return { id, verses };
}

function main() {
  const translationId = (process.argv[2] || '').trim().toUpperCase();
  const url = USFM_SOURCES[translationId];
  if (!url) {
    console.error(`Usage: node _import_usfm.mjs <${Object.keys(USFM_SOURCES).join('|')}>`);
    process.exit(1);
  }

  const work = mkdtempSync(join(tmpdir(), `harvous-usfm-${translationId}-`));
  try {
    const zip = join(work, 'source.zip');
    console.log(`Downloading ${url}...`);
    execFileSync('curl', ['-sSfL', '-o', zip, url]);
    execFileSync('unzip', ['-q', zip, '-d', join(work, 'usfm')]);

    const files = readdirSync(join(work, 'usfm')).filter((f) => f.endsWith('.usfm'));
    const byBook = new Map();
    for (const f of files) {
      const { id, verses } = parseUsfmBook(readFileSync(join(work, 'usfm', f), 'utf-8'));
      if (ALL_BOOKS.includes(id)) byBook.set(id, verses);
    }
    // S3Y never arrives as a book of its own: the source prints it inside Daniel 3.
    const missingBooks = ALL_BOOKS.filter((b) => b !== 'S3Y' && !byBook.has(b));
    if (missingBooks.length) throw new Error(`Source is missing books: ${missingBooks.join(', ')}`);

    const raw = ALL_BOOKS.filter((b) => byBook.has(b)).flatMap((b) => byBook.get(b));
    mkdirSync(join(__dirname, 'raw'), { recursive: true });
    const rawPath = join(__dirname, 'raw', `${translationId}.json`);
    writeFileSync(rawPath, JSON.stringify(raw, null, 2));
    console.log(`${raw.length} verses from ${byBook.size} books → ${rawPath}`);

    writeRemapped(translationId);
    console.log(`\nNext: npx tsx server/scripts/seed-bible-verses.ts ${translationId}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
