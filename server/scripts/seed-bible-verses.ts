/**
 * Seed script for populating BibleTranslations and BibleVerses tables.
 *
 * Usage:
 *   npx tsx server/scripts/seed-bible-verses.ts [translationId]
 *
 * Expects JSON files at server/data/bibles/{translationId}.json with format:
 *   [{ "book": "Genesis", "chapter": 1, "verse": 1, "text": "In the beginning..." }, ...]
 *
 * If a translationId is provided, only that translation is seeded.
 * Otherwise, all translations with data files are seeded.
 */

import 'dotenv/config';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { db } from '../db/client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { BibleTranslations, BibleVerses } from '../db/schema';
import { now } from '../db/dates';
import { TRANSLATIONS } from '../../src/data/translations';

// Canonical book names from bible-chapters.json
import bibleChaptersData from '../../src/data/bible-chapters.json';

interface BibleChapter {
  book: string;
  bookOrder: number;
  testament: 'old' | 'new';
  chapter: number;
  startVerse: number;
  endVerse: number;
}

interface VerseEntry {
  book: string;
  chapter: number;
  verse: number;
  text: string;
}

const BIBLES_DIR = resolve(__dirname, '../data/bibles');

// Common book name variants → canonical name
const BOOK_NAME_MAP: Record<string, string> = {
  'psalm': 'Psalms',
  'song of solomon': 'Song of Songs',
  'song of songs': 'Song of Songs',
  'canticles': 'Song of Songs',
  'sirach': 'Song of Songs',
  '1samuel': '1 Samuel',
  '2samuel': '2 Samuel',
  '1kings': '1 Kings',
  '2kings': '2 Kings',
  '1chronicles': '1 Chronicles',
  '2chronicles': '2 Chronicles',
  '1corinthians': '1 Corinthians',
  '2corinthians': '2 Corinthians',
  '1thessalonians': '1 Thessalonians',
  '2thessalonians': '2 Thessalonians',
  '1timothy': '1 Timothy',
  '2timothy': '2 Timothy',
  '1peter': '1 Peter',
  '2peter': '2 Peter',
  '1john': '1 John',
  '2john': '2 John',
  '3john': '3 John',
};

function buildCanonicalBooks(): Set<string> {
  const books = new Set<string>();
  for (const ch of bibleChaptersData as BibleChapter[]) {
    books.add(ch.book);
  }
  return books;
}

function buildExpectedVerseCounts(): Map<string, Map<number, number>> {
  const map = new Map<string, Map<number, number>>();
  for (const ch of bibleChaptersData as BibleChapter[]) {
    if (!map.has(ch.book)) map.set(ch.book, new Map());
    map.get(ch.book)!.set(ch.chapter, ch.endVerse);
  }
  return map;
}

function normalizeBookName(name: string, canonicalBooks: Set<string>): string | null {
  // Direct match
  if (canonicalBooks.has(name)) return name;

  // Case-insensitive match
  for (const canonical of canonicalBooks) {
    if (canonical.toLowerCase() === name.toLowerCase()) return canonical;
  }

  // Known variants
  const lower = name.toLowerCase().replace(/\s+/g, '');
  if (BOOK_NAME_MAP[lower]) return BOOK_NAME_MAP[lower];

  // Try without leading number space: "1 Samuel" vs "1Samuel"
  const withSpace = name.replace(/^(\d)(\w)/, '$1 $2');
  if (canonicalBooks.has(withSpace)) return withSpace;

  return null;
}

async function seedTranslations() {
  console.log('Seeding BibleTranslations table...');
  const timestamp = now();

  for (const t of Object.values(TRANSLATIONS)) {
    await db
      .insert(BibleTranslations)
      .values({
        id: t.id,
        name: t.name,
        abbreviation: t.abbreviation,
        publisher: t.publisher,
        copyrightNotice: t.copyright,
        websiteUrl: t.website,
        isPublicDomain: t.isPublicDomain,
        sortOrder: t.sortOrder,
        createdAt: timestamp,
      })
      .onConflictDoUpdate({
        target: BibleTranslations.id,
        set: {
          name: t.name,
          abbreviation: t.abbreviation,
          publisher: t.publisher,
          copyrightNotice: t.copyright,
          websiteUrl: t.website,
          isPublicDomain: t.isPublicDomain,
          sortOrder: t.sortOrder,
        },
      });
  }
  console.log(`  Seeded ${Object.keys(TRANSLATIONS).length} translations.`);
}

async function seedVerses(translationId: string) {
  const filePath = resolve(BIBLES_DIR, `${translationId}.json`);
  if (!existsSync(filePath)) {
    console.warn(`  Skipping ${translationId}: no data file at ${filePath}`);
    return;
  }

  console.log(`Seeding verses for ${translationId}...`);
  const canonicalBooks = buildCanonicalBooks();
  const expectedCounts = buildExpectedVerseCounts();

  const raw = readFileSync(filePath, 'utf-8');
  const verses: VerseEntry[] = JSON.parse(raw);
  console.log(`  Loaded ${verses.length} verse entries from file.`);

  // Validate and normalize book names
  const unmappedBooks = new Set<string>();
  const normalizedVerses: Array<{ book: string; chapter: number; verse: number; text: string }> = [];

  for (const v of verses) {
    const canonical = normalizeBookName(v.book, canonicalBooks);
    if (!canonical) {
      unmappedBooks.add(v.book);
      continue;
    }
    normalizedVerses.push({ book: canonical, chapter: v.chapter, verse: v.verse, text: v.text });
  }

  if (unmappedBooks.size > 0) {
    console.error(`  ERROR: Unmapped book names in ${translationId}: ${[...unmappedBooks].join(', ')}`);
    console.error('  Fix the data file or add mappings to BOOK_NAME_MAP. Aborting this translation.');
    return;
  }

  // Batch insert in chunks of 1000
  const BATCH_SIZE = 1000;
  let inserted = 0;
  let currentBook = '';

  for (let i = 0; i < normalizedVerses.length; i += BATCH_SIZE) {
    const batch = normalizedVerses.slice(i, i + BATCH_SIZE);
    const newBook = batch[0].book;
    if (newBook !== currentBook) {
      currentBook = newBook;
      process.stdout.write(`  ${currentBook}...`);
    }

    const values = batch.map((v) => ({
      id: `${translationId}_${v.book}_${v.chapter}_${v.verse}`,
      translationId,
      book: v.book,
      chapter: v.chapter,
      verse: v.verse,
      text: v.text,
    }));

    await db
      .insert(BibleVerses)
      .values(values)
      .onConflictDoNothing();

    inserted += batch.length;
  }
  console.log('');
  console.log(`  Inserted ${inserted} verses for ${translationId}.`);

  // Validation: compare verse counts against expected
  console.log(`  Validating verse counts...`);
  const actualCounts = new Map<string, Map<number, number>>();
  for (const v of normalizedVerses) {
    if (!actualCounts.has(v.book)) actualCounts.set(v.book, new Map());
    const bookMap = actualCounts.get(v.book)!;
    bookMap.set(v.chapter, (bookMap.get(v.chapter) ?? 0) + 1);
  }

  let warnings = 0;
  for (const [book, chapters] of expectedCounts) {
    const actualBook = actualCounts.get(book);
    if (!actualBook) {
      console.warn(`  WARNING: Missing entire book: ${book}`);
      warnings++;
      continue;
    }
    for (const [chapter, expectedEnd] of chapters) {
      const actualCount = actualBook.get(chapter) ?? 0;
      if (actualCount < expectedEnd) {
        // Only warn if significantly fewer (some translations legitimately omit verses)
        if (actualCount < expectedEnd - 2) {
          console.warn(`  WARNING: ${book} ${chapter} — expected ${expectedEnd} verses, got ${actualCount}`);
          warnings++;
        }
      }
    }
  }

  if (warnings === 0) {
    console.log(`  Validation passed.`);
  } else {
    console.log(`  Validation completed with ${warnings} warnings (some may be expected for this translation).`);
  }
}

async function main() {
  const targetTranslation = process.argv[2];

  await seedTranslations();

  if (targetTranslation) {
    if (!TRANSLATIONS[targetTranslation]) {
      console.error(`Unknown translation: ${targetTranslation}`);
      console.error(`Available: ${Object.keys(TRANSLATIONS).join(', ')}`);
      process.exit(1);
    }
    await seedVerses(targetTranslation);
  } else {
    for (const id of Object.keys(TRANSLATIONS)) {
      await seedVerses(id);
    }
  }

  console.log('\nDone.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
