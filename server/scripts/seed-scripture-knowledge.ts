/**
 * Seed the shared scripture-knowledge tables from normalized JSON.
 *
 * Currently seeds: ScriptureCrossReferences (from cross-references.json).
 * Topics / people / places follow once their importers land.
 *
 * Usage:   npx tsx server/scripts/seed-scripture-knowledge.ts
 * Prereq:  run import-cross-references.ts to produce cross-references.json, and
 *          `npm run db:push` so the canonical tables exist in Supabase.
 *
 * Like BibleVerses, these tables are shared reference data (no userId) written with the
 * service-role key. See docs/future/SCRIPTURE_KNOWLEDGE_LAYER.md.
 */

import 'dotenv/config';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { db } from '../db/client';
import { ScriptureCrossReferences } from '../db/schema';
import type { CrossReferenceRow } from './import-cross-references';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = resolve(__dirname, '../data/scripture-knowledge');

const slug = (book: string) => book.replace(/\s+/g, '');

function crossRefId(r: CrossReferenceRow): string {
  return `cr_${slug(r.fromBook)}.${r.fromChapter}.${r.fromVerse}__${slug(r.toBook)}.${r.toChapterStart}.${r.toVerseStart}`;
}

async function seedCrossReferences(): Promise<void> {
  // Prefer the full generated file; fall back to the committed sample for a smoke seed.
  const full = resolve(DATA_DIR, 'cross-references.json');
  const sample = resolve(DATA_DIR, 'cross-references.sample.json');
  const file = existsSync(full) ? full : sample;
  if (!existsSync(file)) {
    console.warn(`No cross-reference data found. Run import-cross-references.ts first.`);
    return;
  }

  const rows: CrossReferenceRow[] = JSON.parse(readFileSync(file, 'utf-8'));
  console.log(`Seeding ${rows.length.toLocaleString()} cross-references from ${file}...`);

  const BATCH = 1000;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const values = rows.slice(i, i + BATCH).map((r) => ({
      id: crossRefId(r),
      fromBook: r.fromBook,
      fromChapter: r.fromChapter,
      fromVerse: r.fromVerse,
      toBook: r.toBook,
      toChapterStart: r.toChapterStart,
      toChapterEnd: r.toChapterEnd,
      toVerseStart: r.toVerseStart,
      toVerseEnd: r.toVerseEnd,
      votes: r.votes,
      source: 'TSK',
    }));
    await db.insert(ScriptureCrossReferences).values(values).onConflictDoNothing();
    inserted += values.length;
    process.stdout.write(`  ${inserted.toLocaleString()}/${rows.length.toLocaleString()}\r`);
  }
  console.log(`\nDone. Upserted ${inserted.toLocaleString()} cross-references.`);
}

async function main() {
  await seedCrossReferences();
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
