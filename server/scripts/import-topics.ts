/**
 * Import OpenBible.info topical data into normalized topic + topic-verse JSON.
 *
 * Source: https://a.openbible.info/data/topic-votes.txt  (CC-BY, www.openbible.info/topics)
 *   TSV: `Topic \t Start Verse ID \t End Verse ID \t Votes`
 *   Verse ID = `bbcccvvv` (bb = book number 01–66 matching canonical order). End may be empty
 *   (single verse) or a range. The dataset is already vote-curated (all entries >= 10 votes).
 *
 * Outputs (both gitignored — regenerate, don't commit):
 *   server/data/scripture-knowledge/topics.json        [{ id, slug, label }]
 *   server/data/scripture-knowledge/topic-verses.json  [{ topicId, book, chapter, verse, relevance }]
 *
 * Ranges within one chapter and <= maxSpan verses are expanded to per-verse edges so they
 * join against a user's exact `ScriptureMetadata` reference; larger/cross-chapter ranges are
 * anchored at the start verse.
 *
 * Usage:
 *   npx tsx server/scripts/import-topics.ts [inputPath] [--min-votes N] [--max-span N]
 *
 * See docs/future/SCRIPTURE_KNOWLEDGE_LAYER.md and the data-dir README.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseVerseId, isValidVerse, canonicalBookOrder } from '../../src/utils/scripture-osis';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const OUT_DIR = resolve(__dirname, '../data/scripture-knowledge');
const DEFAULT_INPUT = resolve(OUT_DIR, 'raw/topic-votes.txt');
const TOPICS_FILE = resolve(OUT_DIR, 'topics.json');
const TOPIC_VERSES_FILE = resolve(OUT_DIR, 'topic-verses.json');

export interface TopicRow {
  id: string;
  slug: string;
  label: string;
}

export interface TopicVerseRow {
  topicId: string;
  book: string;
  chapter: number;
  verse: number;
  relevance: number;
}

function slugify(topic: string): string {
  return topic
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseArgs(): { input: string; minVotes: number; maxSpan: number } {
  const args = process.argv.slice(2);
  let input = DEFAULT_INPUT;
  let minVotes = 1;
  let maxSpan = 12;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--min-votes') minVotes = Number(args[++i]);
    else if (args[i] === '--max-span') maxSpan = Number(args[++i]);
    else if (!args[i].startsWith('--')) input = resolve(args[i]);
  }
  return { input, minVotes, maxSpan };
}

function main() {
  const { input, minVotes, maxSpan } = parseArgs();
  if (!existsSync(input)) {
    console.error(`Input not found: ${input}`);
    console.error('Download https://a.openbible.info/data/topic-votes.txt and pass its path.');
    process.exit(1);
  }

  console.log(`Reading ${input} (min votes ${minVotes}, max span ${maxSpan})...`);
  const lines = readFileSync(input, 'utf-8').split('\n');

  const topics = new Map<string, TopicRow>();
  const edges = new Map<string, TopicVerseRow>(); // key: topicId|book|chapter|verse → keep max relevance
  let skippedVotes = 0;
  let unparseable = 0;
  let invalid = 0;

  // Line 0 is the header (Topic\tStart Verse ID\tEnd Verse ID\tVotes\t#...attribution).
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cols = line.split('\t');
    if (cols.length < 4) continue;

    const votes = Number(cols[3]);
    if (!Number.isFinite(votes) || votes < minVotes) {
      skippedVotes++;
      continue;
    }

    const start = parseVerseId(cols[1]);
    if (!start) {
      unparseable++;
      continue;
    }
    const slug = slugify(cols[0]);
    if (!slug) continue;

    const topicId = `topic_${slug}`;
    if (!topics.has(slug)) topics.set(slug, { id: topicId, slug, label: cols[0].trim() });

    // Build the verse list: expand short same-chapter ranges, else anchor at the start verse.
    const refs: Array<{ book: string; chapter: number; verse: number }> = [];
    const end = cols[2] ? parseVerseId(cols[2]) : null;
    if (
      end &&
      end.book === start.book &&
      end.chapter === start.chapter &&
      end.verse >= start.verse &&
      end.verse - start.verse <= maxSpan
    ) {
      for (let v = start.verse; v <= end.verse; v++) {
        refs.push({ book: start.book, chapter: start.chapter, verse: v });
      }
    } else {
      refs.push(start);
    }

    for (const ref of refs) {
      if (!isValidVerse(ref.book, ref.chapter, ref.verse)) {
        invalid++;
        continue;
      }
      const key = `${topicId}|${ref.book}|${ref.chapter}|${ref.verse}`;
      const existing = edges.get(key);
      if (!existing || votes > existing.relevance) {
        edges.set(key, { topicId, book: ref.book, chapter: ref.chapter, verse: ref.verse, relevance: votes });
      }
    }
  }

  const topicRows = [...topics.values()].sort((a, b) => a.slug.localeCompare(b.slug));
  const edgeRows = [...edges.values()].sort(
    (a, b) =>
      canonicalBookOrder(a.book) - canonicalBookOrder(b.book) ||
      a.chapter - b.chapter ||
      a.verse - b.verse ||
      b.relevance - a.relevance ||
      a.topicId.localeCompare(b.topicId),
  );

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(TOPICS_FILE, JSON.stringify(topicRows));
  writeFileSync(TOPIC_VERSES_FILE, JSON.stringify(edgeRows));

  console.log(`Wrote ${topicRows.length.toLocaleString()} topics → ${TOPICS_FILE}`);
  console.log(`Wrote ${edgeRows.length.toLocaleString()} topic-verse edges → ${TOPIC_VERSES_FILE}`);
  console.log(`  skipped (below ${minVotes} votes): ${skippedVotes.toLocaleString()}`);
  console.log(`  unparseable verse ids: ${unparseable.toLocaleString()}`);
  console.log(`  dropped (out-of-range verses): ${invalid.toLocaleString()}`);
}

main();
