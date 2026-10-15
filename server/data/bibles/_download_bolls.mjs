/**
 * Download a Bible translation from the Bolls.life API and save as Harvous JSON.
 * No API key required. Same output format as other translation JSON files.
 *
 * Usage (one translation):
 *   node server/data/bibles/_download_bolls.mjs NASB
 *
 * Or via npm scripts:
 *   npm run bible:download:bolls -- NASB
 *   npm run bible:download:bolls:all   (NASB 1995, CSB, AMP, MSG in sequence)
 *
 * Output: server/data/bibles/<ID>.json
 * Then:   npx tsx server/scripts/seed-bible-verses.ts <ID>
 *
 * Translations numbered differently from Harvous (NABRE) are saved raw, deuterocanon included, to
 * server/data/bibles/raw/<ID>.json and renumbered by _remap.mjs on the way out.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { SOURCES, USFM_BOOKS, BOLLS_DEUTERO_BOOK_IDS } from '../versification/remap.mjs';
import { writeRemapped } from './_remap.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../../..');

// Map our translation IDs to Bolls.life translation codes
// KJV excluded — bolls serves Strong's-numbered KJV; our KJV is from a clean public-domain source.
const BOLLS_CODES = {
  ESV:  'ESV',    // English Standard Version (2016)
  NIV:  'NIV2011',// New International Version (2011)
  NLT:  'NLT',   // New Living Translation (2015)
  NKJV: 'NKJV',  // New King James Version (1982)
  BSB:  'BSB',    // Berean Standard Bible (2020)
  NET:  'NET',    // NET Bible (2019)
  NASB: 'NASB',   // New American Standard Bible (1995)
  CSB:  'CSB17',  // Christian Standard Bible (2017)
  AMP:  'AMP',    // Amplified Bible (2015)
  MSG:  'MSG',    // The Message (2002)
  NABRE: 'NABRE', // New American Bible, Revised Edition (2011) — Hebrew numbering, renumbered by _remap.mjs
};

// Bolls book name → Harvous canonical book name (only differences listed)
const BOOK_NAME_MAP = {
  'Psalm': 'Psalms',
  'Song of Songs': 'Song of Solomon',
};

/** USFM code for a Bolls book id: 1–66 are Harvous's order, the deuterocanon has its own ids. */
function bollsUsfmCode(bookid) {
  return USFM_BOOKS[bookid - 1] ?? BOLLS_DEUTERO_BOOK_IDS[bookid] ?? null;
}

function canonicalize(bollsName) {
  return BOOK_NAME_MAP[bollsName] ?? bollsName;
}

function stripHtml(html) {
  return html
    .replace(/<[^>]*>/g, ' ')               // replace HTML tags with spaces (prevents word concatenation)
    .replace(/\[\d+\]/g, '')                 // strip bracketed footnote anchors (e.g. [5] in CSB)
    .replace(/\[[A-Z]{1,3}\]/g, '')           // strip lettered cross-reference anchors (e.g. [AA] in NABRE)
    .replace(/[\u2460-\u24FF]/g, '')          // strip circled letter/number cross-reference markers (e.g. ⓒ in CSB)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.error(`  HTTP ${res.status} for ${url}, attempt ${attempt + 1}`);
        await sleep(2000);
        continue;
      }
      return await res.json();
    } catch (e) {
      console.error(`  Error fetching ${url}: ${e.message}, attempt ${attempt + 1}`);
      await sleep(2000);
    }
  }
  throw new Error(`Failed to fetch ${url} after 3 attempts`);
}

async function main() {
  const translationId = (process.argv[2] || '').trim().toUpperCase();
  if (!translationId || !BOLLS_CODES[translationId]) {
    console.error(`Usage: node _download_bolls.mjs <TRANSLATION_ID>`);
    console.error(`Available: ${Object.keys(BOLLS_CODES).join(', ')}`);
    process.exit(1);
  }

  const bollsCode = BOLLS_CODES[translationId];
  // A renumbered translation is saved raw, keyed by USFM book code: the 66 books plus the
  // deuterocanon, which only the renumbered (Catholic) translations carry.
  const remap = Boolean(SOURCES[translationId]);
  if (remap) mkdirSync(join(__dirname, 'raw'), { recursive: true });
  const outPath = remap
    ? join(__dirname, 'raw', `${translationId}.json`)
    : join(__dirname, `${translationId}.json`);

  // Resume from partial file if it exists
  let existingVerses = [];
  let doneChapters = new Set();
  if (existsSync(outPath)) {
    try {
      existingVerses = JSON.parse(readFileSync(outPath, 'utf-8'));
      for (const v of existingVerses) {
        doneChapters.add(`${v.book}:${v.chapter}`);
      }
      console.log(`Resuming ${outPath}: ${existingVerses.length} verses, ${doneChapters.size} chapters done.`);
    } catch {
      existingVerses = [];
    }
  }

  console.log(`Fetching book list for ${translationId} (Bolls code: ${bollsCode})...`);
  const books = (await fetchJson(`https://bolls.life/get-books/${bollsCode}/`))
    .filter((b) => !remap || bollsUsfmCode(b.bookid));
  console.log(`${books.length} books found.\n`);

  const allVerses = [...existingVerses];
  const totalChapters = books.reduce((sum, b) => sum + b.chapters, 0);
  let chaptersProcessed = 0;

  for (const book of books) {
    const canonicalBook = remap ? bollsUsfmCode(book.bookid) : canonicalize(book.name);

    // Bolls' book list can undercount (it gives NABRE Ezekiel 47 chapters and serves 48), so
    // keep asking past the advertised count until a chapter comes back empty.
    for (let ch = 1; ch <= book.chapters + 3; ch++) {
      chaptersProcessed++;
      const key = `${canonicalBook}:${ch}`;

      if (doneChapters.has(key)) {
        process.stdout.write(`\r[${chaptersProcessed}/${totalChapters}] ${canonicalBook} ${ch} (skipped)    `);
        continue;
      }

      process.stdout.write(`\r[${chaptersProcessed}/${totalChapters}] ${canonicalBook} ${ch}...   `);

      const verses = await fetchJson(`https://bolls.life/get-text/${bollsCode}/${book.bookid}/${ch}/`);
      if (ch > book.chapters && verses.length === 0) break;

      for (const v of verses) {
        const text = stripHtml(v.text);
        if (text) {
          allVerses.push({ book: canonicalBook, chapter: ch, verse: v.verse, text });
        }
      }

      // Save after every chapter so we can resume
      writeFileSync(outPath, JSON.stringify(allVerses, null, 2));

      await sleep(150);
    }
  }

  console.log(`\n\nTotal verses: ${allVerses.length}`);
  console.log(`Saved to ${outPath}`);
  if (remap) writeRemapped(translationId);
  console.log(`\nNext: npx tsx server/scripts/seed-bible-verses.ts ${translationId}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
