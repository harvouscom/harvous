/**
 * Seed the shared scripture-knowledge tables from normalized JSON.
 *
 * Seeds: ScriptureCrossReferences (cross-references.json), ScriptureTopics (topics.json),
 * ScriptureTopicVerses (topic-verses.json). People / places follow once their importers land.
 *
 * Usage:
 *   npx tsx server/scripts/seed-scripture-knowledge.ts            # both
 *   npx tsx server/scripts/seed-scripture-knowledge.ts topics     # only topics
 *   npx tsx server/scripts/seed-scripture-knowledge.ts crossrefs  # only cross-references
 *
 * Prereq: run the importers to produce the JSON, and `npm run db:push` so the canonical
 * tables exist in Supabase. Each loader falls back to a committed *.sample.json for a smoke
 * run. Like BibleVerses, these are shared reference tables (no userId), written with the
 * service-role key. See docs/future/SCRIPTURE_KNOWLEDGE_LAYER.md.
 */

import 'dotenv/config';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { db } from '../db/client';
import { ScriptureCrossReferences, ScriptureTopics, ScriptureTopicVerses, BiblePlaces, BiblePeople, ScriptureEntityRefs } from '../db/schema';
import type { CrossReferenceRow } from './import-cross-references';
import type { TopicRow, TopicVerseRow } from './import-topics';
import type { PlaceRow, EntityRefRow } from './import-places';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = resolve(__dirname, '../data/scripture-knowledge');

const slug = (book: string) => book.replace(/\s+/g, '');

/** Prefer the full generated file; fall back to the committed sample for a smoke seed. */
function pickFile(name: string): string | null {
  const full = resolve(DATA_DIR, `${name}.json`);
  const sample = resolve(DATA_DIR, `${name}.sample.json`);
  if (existsSync(full)) return full;
  if (existsSync(sample)) return sample;
  return null;
}

async function insertBatched<T>(
  label: string,
  rows: T[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toValues: (row: T) => any,
): Promise<void> {
  if (!rows.length) return;
  const BATCH = 1000;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    await db.insert(table).values(rows.slice(i, i + BATCH).map(toValues)).onConflictDoNothing();
    inserted += Math.min(BATCH, rows.length - i);
    process.stdout.write(`  ${label}: ${inserted.toLocaleString()}/${rows.length.toLocaleString()}\r`);
  }
  console.log(`\n  ${label}: upserted ${inserted.toLocaleString()}.`);
}

function crossRefId(r: CrossReferenceRow): string {
  return `cr_${slug(r.fromBook)}.${r.fromChapter}.${r.fromVerse}__${slug(r.toBook)}.${r.toChapterStart}.${r.toVerseStart}`;
}

function topicVerseId(r: TopicVerseRow): string {
  return `tv_${r.topicId}__${slug(r.book)}.${r.chapter}.${r.verse}`;
}

async function seedCrossReferences(): Promise<void> {
  const file = pickFile('cross-references');
  if (!file) {
    console.warn('No cross-reference data. Run import-cross-references.ts first.');
    return;
  }
  const rows: CrossReferenceRow[] = JSON.parse(readFileSync(file, 'utf-8'));
  console.log(`Seeding ${rows.length.toLocaleString()} cross-references from ${file}...`);
  await insertBatched('cross-refs', rows, ScriptureCrossReferences, (r) => ({
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
}

async function seedTopics(): Promise<void> {
  const topicsFile = pickFile('topics');
  const edgesFile = pickFile('topic-verses');
  if (!topicsFile || !edgesFile) {
    console.warn('No topic data. Run import-topics.ts first.');
    return;
  }

  const topics: TopicRow[] = JSON.parse(readFileSync(topicsFile, 'utf-8'));
  console.log(`Seeding ${topics.length.toLocaleString()} topics from ${topicsFile}...`);
  await insertBatched('topics', topics, ScriptureTopics, (t) => ({
    id: t.id,
    slug: t.slug,
    label: t.label,
    category: null,
    source: 'openbible',
  }));

  const edges: TopicVerseRow[] = JSON.parse(readFileSync(edgesFile, 'utf-8'));
  console.log(`Seeding ${edges.length.toLocaleString()} topic-verse edges from ${edgesFile}...`);
  await insertBatched('topic-verses', edges, ScriptureTopicVerses, (e) => ({
    id: topicVerseId(e),
    topicId: e.topicId,
    book: e.book,
    chapter: e.chapter,
    verse: e.verse,
    relevance: e.relevance,
  }));
}

async function seedPlaces(): Promise<void> {
  const placesFile = pickFile('places');
  const refsFile = pickFile('place-refs');
  if (!placesFile || !refsFile) {
    console.warn('No place data. Run import-places.ts first.');
    return;
  }

  const places: PlaceRow[] = JSON.parse(readFileSync(placesFile, 'utf-8'));
  console.log(`Seeding ${places.length.toLocaleString()} places from ${placesFile}...`);
  await insertBatched('places', places, BiblePlaces, (p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    aliases: null,
    latitude: p.latitude,
    longitude: p.longitude,
    source: 'openbible',
  }));

  const refs: EntityRefRow[] = JSON.parse(readFileSync(refsFile, 'utf-8'));
  console.log(`Seeding ${refs.length.toLocaleString()} place→verse edges from ${refsFile}...`);
  await insertBatched('place-refs', refs, ScriptureEntityRefs, (r) => ({
    id: `er_${r.entityId}__${slug(r.book)}.${r.chapter}.${r.verse}`,
    entityType: r.entityType,
    entityId: r.entityId,
    book: r.book,
    chapter: r.chapter,
    verse: r.verse,
  }));
}

async function seedPeople(): Promise<void> {
  const peopleFile = pickFile('people');
  const refsFile = pickFile('person-refs');
  if (!peopleFile || !refsFile) {
    console.warn('No people data. Run import-people.ts first.');
    return;
  }

  const people: Array<{ id: string; slug: string; name: string }> = JSON.parse(readFileSync(peopleFile, 'utf-8'));
  console.log(`Seeding ${people.length.toLocaleString()} people from ${peopleFile}...`);
  await insertBatched('people', people, BiblePeople, (p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    aliases: null,
    source: 'stepbible',
  }));

  const refs: EntityRefRow[] = JSON.parse(readFileSync(refsFile, 'utf-8'));
  console.log(`Seeding ${refs.length.toLocaleString()} person→verse edges from ${refsFile}...`);
  await insertBatched('person-refs', refs, ScriptureEntityRefs, (r) => ({
    id: `er_${r.entityId}__${slug(r.book)}.${r.chapter}.${r.verse}`,
    entityType: r.entityType,
    entityId: r.entityId,
    book: r.book,
    chapter: r.chapter,
    verse: r.verse,
  }));
}

async function main() {
  const only = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (!only || only === 'crossrefs') await seedCrossReferences();
  if (!only || only === 'topics') await seedTopics();
  if (!only || only === 'places') await seedPlaces();
  if (!only || only === 'people') await seedPeople();
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
