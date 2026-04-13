/**
 * Fix missing spaces in Bible verse text caused by poetry line breaks being stripped
 * during import without inserting a space.
 *
 * Patterns fixed (applied in order until stable):
 *   1. Period/bang/question followed directly by a letter: "image.In" → "image. In"
 *   2. Comma/semicolon/colon followed directly by a letter: "listen,I" → "listen, I"
 *   3. Lowercase immediately before uppercase: "eLord" → "e Lord"
 *
 * Note: all-lowercase fusions (e.g. "voiceand") cannot be reliably fixed without a
 * dictionary — any generic function-word regex produces false positives mid-word.
 * Those require cleaned source data.
 *
 * Usage:
 *   npx tsx scripts/fix-bible-verse-spaces.ts [translationId]
 *
 * If no translationId is given, all translations with JSON files are processed.
 */

import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { db, BibleVerses, VerseTextCache, eq } from '../server/db';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BIBLES_DIR = resolve(__dirname, '../server/data/bibles');

const TRANSLATIONS = ['AMP', 'BSB', 'CSB', 'ESV', 'KJV', 'MSG', 'NASB', 'NET', 'NIV', 'NKJV', 'NLT'];

/**
 * Manual fixes for confirmed all-lowercase fusions that the regex patterns can't safely detect.
 * Format: { [translationId]: { [verseId]: correctedText } }
 * verseId = `${translationId}_${book}_${chapter}_${verse}` (same as BibleVerses.id)
 */
const MANUAL_FIXES: Record<string, Record<string, string>> = {
  NLT: {
    // Psalms 116:1 — "my voiceand" (line-break poetry fusion)
    'NLT_Psalms_116_1': 'I love the Lord because he hears my voice and my prayer for mercy.',
  },
  ESV: {
    // Psalms 116:1 — "heardmy" (line-break poetry fusion)
    'ESV_Psalms_116_1': 'I love the Lord, because he has heard my voice and my pleas for mercy.',
  },
};

function fixSpaces(text: string): string {
  let prev = '';
  let current = text;
  // Iterate until no more changes (handles cascading fixes like ".In" → ". In")
  while (current !== prev) {
    prev = current;
    // Pattern 1: sentence-ending punctuation followed directly by a letter
    current = current.replace(/([.!?])([A-Za-z])/g, '$1 $2');
    // Pattern 2: list/clause punctuation followed directly by a letter
    current = current.replace(/([,;:])([A-Za-z])/g, '$1 $2');
    // Pattern 3: lowercase→uppercase transition (camelCase-style join)
    current = current.replace(/([a-z])([A-Z])/g, '$1 $2');
  }
  return current;
}

interface VerseEntry {
  book: string;
  chapter: number;
  verse: number;
  text: string;
}

async function processTranslation(translationId: string): Promise<void> {
  const filePath = resolve(BIBLES_DIR, `${translationId}.json`);
  if (!existsSync(filePath)) {
    console.log(`  Skipping ${translationId}: no JSON file found.`);
    return;
  }

  console.log(`\nProcessing ${translationId}...`);
  const raw = readFileSync(filePath, 'utf-8');
  const verses: VerseEntry[] = JSON.parse(raw);

  const manualForTranslation = MANUAL_FIXES[translationId] ?? {};

  let fixedCount = 0;
  const fixedVerses: VerseEntry[] = verses.map((v) => {
    const id = `${translationId}_${v.book}_${v.chapter}_${v.verse}`;
    // Apply manual fix first (takes precedence over regex)
    if (manualForTranslation[id] !== undefined) {
      if (manualForTranslation[id] !== v.text) {
        fixedCount++;
      }
      return { ...v, text: manualForTranslation[id] };
    }
    const fixed = fixSpaces(v.text);
    if (fixed !== v.text) {
      fixedCount++;
    }
    return { ...v, text: fixed };
  });

  console.log(`  Fixed ${fixedCount} of ${verses.length} verses.`);

  // Write cleaned JSON back to disk
  writeFileSync(filePath, JSON.stringify(fixedVerses, null, 2) + '\n', 'utf-8');
  console.log(`  Updated JSON file.`);

  // Update DB records in batches
  const changed = fixedVerses.filter((v, i) => v.text !== verses[i].text);
  if (changed.length === 0) {
    console.log(`  No DB updates needed.`);
    return;
  }

  const BATCH_SIZE = 200;
  let updated = 0;
  for (let i = 0; i < changed.length; i += BATCH_SIZE) {
    const batch = changed.slice(i, i + BATCH_SIZE);
    for (const v of batch) {
      const id = `${translationId}_${v.book}_${v.chapter}_${v.verse}`;
      await db
        .update(BibleVerses)
        .set({ text: v.text })
        .where(eq(BibleVerses.id, id));
    }
    updated += batch.length;
    process.stdout.write(`\r  DB updated: ${updated}/${changed.length}`);
  }
  console.log(`\r  DB updated: ${updated}/${changed.length} rows.          `);
}

async function clearVerseTextCache(): Promise<void> {
  console.log('\nClearing VerseTextCache...');
  await db.delete(VerseTextCache);
  console.log('  Done.');
}

async function main() {
  const target = process.argv[2]?.toUpperCase();
  const toProcess = target ? [target] : TRANSLATIONS;

  for (const id of toProcess) {
    await processTranslation(id);
  }

  await clearVerseTextCache();

  console.log('\nAll done. Re-publish the current VOTD from the admin panel to pick up the fixed text.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
