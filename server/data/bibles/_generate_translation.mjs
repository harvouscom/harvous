/**
 * Generate a full-Bible JSON file for a given translation using Claude.
 * Same approach as existing ESV/NIV/KJV/etc. — AI-generated verse text per chapter.
 *
 * Usage (one translation):
 *   ANTHROPIC_API_KEY=... node server/data/bibles/_generate_translation.mjs NASB
 *
 * Or via npm scripts (reads .env automatically):
 *   npm run bible:generate -- NASB
 *   npm run bible:generate:all           (NASB 1995, CSB, AMP, MSG in sequence)
 *
 * Output: server/data/bibles/<ID>.json
 * Then:   npx tsx server/scripts/seed-bible-verses.ts <ID>
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config as loadEnv } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../../..');
loadEnv({ path: join(ROOT, '.env') });

const chaptersPath = join(ROOT, 'src/data/bible-chapters.json');

// Translation style prompts — how to frame the generation for each version
const TRANSLATION_STYLES = {
  NASB: {
    name: 'New American Standard Bible (NASB 1995)',
    style: `The New American Standard Bible (NASB 1995). NASB 1995 is known for its extremely literal, word-for-word (formal equivalence) translation philosophy. It closely mirrors the original Hebrew and Greek grammatical structures. It uses modern vocabulary but maintains precise fidelity to the original languages, including retaining Hebraisms, keeping literal renderings of tenses and participles, and using "And" to start sentences where the Hebrew does. Maintain a reverent, study-Bible tone.`,
  },
  CSB: {
    name: 'Christian Standard Bible (CSB)',
    style: `The Christian Standard Bible (CSB). CSB uses "optimal equivalence" — balancing word-for-word accuracy with natural, readable English. It is accessible to modern readers while remaining faithful to the original languages. It uses gender-accurate language where the original is clearly inclusive, avoids overly archaic phrasing, and produces smooth, readable sentences that still follow the source closely. The tone is clear and contemporary.`,
  },
  AMP: {
    name: 'Amplified Bible (AMP)',
    style: `The Amplified Bible (AMP). The AMP expands on key words and phrases using brackets and parentheses to reveal the full, rich meaning of the original Greek and Hebrew text. It provides multiple English words or synonyms in brackets [like this] to amplify the meaning of key words, and sometimes adds parenthetical explanatory phrases (like this) to clarify context. Maintain the Amplified's distinctive expansive style — go deeper into the nuances of meaning than a standard translation would.`,
  },
  MSG: {
    name: 'The Message (MSG)',
    style: `The Message (MSG) by Eugene Peterson. The Message is a highly idiomatic, thought-for-thought paraphrase that renders Scripture in contemporary everyday American English — the language of the street, the marketplace, and the living room. It prioritizes feel and rhythm over word-for-word accuracy. Sentences are often colloquial and conversational. Metaphors are updated for a modern audience. It does not use traditional "thee/thou" or formal religious language. Eugene Peterson's goal was to make the Bible sound fresh and immediate to modern readers.`,
  },
};

const BOOKS_PER_BATCH = 1; // chapters are the real unit; one API call per chapter

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function buildCanonicalChapters(chaptersData) {
  // Returns Map<book, Map<chapter, { startVerse, endVerse }>>
  const map = new Map();
  for (const row of chaptersData) {
    if (!map.has(row.book)) map.set(row.book, new Map());
    map.get(row.book).set(row.chapter, { startVerse: row.startVerse, endVerse: row.endVerse });
  }
  return map;
}

function parseVersesFromResponse(text, book, chapter, startVerse, endVerse) {
  const verses = [];
  const lines = text.split('\n');
  const verseMap = new Map();

  for (const line of lines) {
    // Match patterns like: "1 In the beginning..." or "v1 ..." or "[1] ..." or "1. ..."
    const m = line.match(/^\s*(?:\[?v?(\d+)\]?[.:)\s]+)(.*)/);
    if (m) {
      const v = parseInt(m[1], 10);
      const t = m[2].trim();
      if (v >= startVerse && v <= endVerse && t) {
        verseMap.set(v, t);
      }
    }
  }

  // If parsing failed (the model returned a paragraph), try to split on verse numbers in text
  if (verseMap.size < (endVerse - startVerse + 1) * 0.5) {
    // Try inline verse numbering: "1 text 2 text"
    const inlineRe = /\b(\d+)\s+([^0-9][^0-9]*?)(?=\s+\d+\s+[A-Z]|$)/g;
    let im;
    while ((im = inlineRe.exec(text)) !== null) {
      const v = parseInt(im[1], 10);
      if (v >= startVerse && v <= endVerse && !verseMap.has(v)) {
        verseMap.set(v, im[2].trim());
      }
    }
  }

  for (let v = startVerse; v <= endVerse; v++) {
    const t = verseMap.get(v);
    if (t) {
      verses.push({ book, chapter, verse: v, text: t });
    } else {
      console.warn(`  Missing verse ${book} ${chapter}:${v} — will be omitted`);
    }
  }
  return verses;
}

async function generateChapter(client, translationId, book, chapter, startVerse, endVerse) {
  const style = TRANSLATION_STYLES[translationId];
  const verseRange = startVerse === endVerse ? `verse ${startVerse}` : `verses ${startVerse}–${endVerse}`;

  const prompt = `You are a biblical scholar producing the text of ${style.name}.

Style guidance: ${style.style}

Please write the text for ${book} chapter ${chapter}, ${verseRange}.

Rules:
- Output ONLY the verse text, numbered. Format each line as: <verse number> <verse text>
- Do not include chapter headings, section titles, footnotes, or any other text.
- Do not include the book name or chapter number in the output.
- Number every verse from ${startVerse} to ${endVerse} sequentially.
- Keep the full verse text on one line per verse.
- Verses must be complete and accurate to the source text in the style described.

Example format:
1 In the beginning God created the heavens and the earth.
2 The earth was formless and empty...`;

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const msg = await client.messages.create({
        model: 'claude-opus-4-5',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      });
      const text = msg.content.find((c) => c.type === 'text')?.text ?? '';
      return parseVersesFromResponse(text, book, chapter, startVerse, endVerse);
    } catch (e) {
      const isOverload = e?.status === 529 || /overload|rate/i.test(e?.message ?? '');
      if (attempt < 3) {
        const wait = isOverload ? 30000 : 5000 * (attempt + 1);
        console.warn(`  Retry ${attempt + 1} for ${book} ${chapter}: ${e.message} (waiting ${wait}ms)`);
        await sleep(wait);
      } else {
        console.error(`  FAILED ${book} ${chapter} after 4 attempts: ${e.message}`);
        return [];
      }
    }
  }
  return [];
}

async function main() {
  const translationId = (process.argv[2] || '').trim().toUpperCase();
  if (!translationId || !TRANSLATION_STYLES[translationId]) {
    console.error(`Usage: node _generate_translation.mjs <TRANSLATION_ID>`);
    console.error(`Available: ${Object.keys(TRANSLATION_STYLES).join(', ')}`);
    process.exit(1);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    console.error('Set ANTHROPIC_API_KEY in .env');
    process.exit(1);
  }

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
      console.log(`Resuming from ${outPath}: ${existingVerses.length} verses, ${doneChapters.size} chapters done.`);
    } catch {
      existingVerses = [];
    }
  }

  const client = new Anthropic({ apiKey });
  const chaptersData = JSON.parse(readFileSync(chaptersPath, 'utf-8'));
  const chapterMap = buildCanonicalChapters(chaptersData);

  const allVerses = [...existingVerses];
  const totalChapters = chaptersData.length;
  let n = 0;

  console.log(`Generating ${TRANSLATION_STYLES[translationId].name}...`);
  console.log(`${totalChapters} chapters total, ${doneChapters.size} already done.\n`);

  for (const { book, chapter, startVerse, endVerse } of chaptersData) {
    n++;
    const key = `${book}:${chapter}`;
    if (doneChapters.has(key)) {
      process.stdout.write(`\r[${n}/${totalChapters}] ${book} ${chapter} (skipped)    `);
      continue;
    }

    process.stdout.write(`\r[${n}/${totalChapters}] ${book} ${chapter} (vv ${startVerse}-${endVerse})...   `);

    const verses = await generateChapter(client, translationId, book, chapter, startVerse, endVerse);
    allVerses.push(...verses);

    // Save after every chapter so we can resume
    writeFileSync(outPath, JSON.stringify(allVerses, null, 2));

    // Polite pacing — avoid overwhelming the API
    await sleep(800);
  }

  console.log(`\n\nTotal verses: ${allVerses.length}`);
  console.log(`Saved to ${outPath}`);
  console.log(`\nNext: npx tsx server/scripts/seed-bible-verses.ts ${translationId}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
