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
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../../..');

// Map our translation IDs to Bolls.life translation codes
const BOLLS_CODES = {
  NASB: 'NASB',   // New American Standard Bible (1995)
  CSB:  'CSB17',  // Christian Standard Bible (2017)
  AMP:  'AMP',    // Amplified Bible (2015)
  MSG:  'MSG',    // The Message (2002)
};

// Bolls book name → Harvous canonical book name (only differences listed)
const BOOK_NAME_MAP = {
  'Psalm': 'Psalms',
  'Song of Songs': 'Song of Solomon',
};

function canonicalize(bollsName) {
  return BOOK_NAME_MAP[bollsName] ?? bollsName;
}

function stripHtml(html) {
  return html
    .replace(/<[^>]*>/g, '')                 // strip all HTML tags
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
  const outPath = join(__dirname, `${translationId}.json`);

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
  const books = await fetchJson(`https://bolls.life/get-books/${bollsCode}/`);
  console.log(`${books.length} books found.\n`);

  const allVerses = [...existingVerses];
  const totalChapters = books.reduce((sum, b) => sum + b.chapters, 0);
  let chaptersProcessed = 0;

  for (const book of books) {
    const canonicalBook = canonicalize(book.name);

    for (let ch = 1; ch <= book.chapters; ch++) {
      chaptersProcessed++;
      const key = `${canonicalBook}:${ch}`;

      if (doneChapters.has(key)) {
        process.stdout.write(`\r[${chaptersProcessed}/${totalChapters}] ${canonicalBook} ${ch} (skipped)    `);
        continue;
      }

      process.stdout.write(`\r[${chaptersProcessed}/${totalChapters}] ${canonicalBook} ${ch}...   `);

      const verses = await fetchJson(`https://bolls.life/get-text/${bollsCode}/${book.bookid}/${ch}/`);

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
  console.log(`\nNext: npx tsx server/scripts/seed-bible-verses.ts ${translationId}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
