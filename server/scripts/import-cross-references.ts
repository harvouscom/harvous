/**
 * Import Treasury of Scripture Knowledge cross-references into Harvous's normalized JSON.
 *
 * Source: OpenBible.info's TSK dataset (CC-BY). Download:
 *   https://a.openbible.info/data/cross-references.zip  →  unzip  →  cross_references.txt
 * The file is TSV: `From Verse \t To Verse \t Votes`, with OSIS refs (e.g. `John.3.16`,
 * range `John.1.1-John.1.3`). Negative/zero votes are downvoted/rejected references.
 *
 * Output: server/data/scripture-knowledge/cross-references.json (normalized to canonical
 * Harvous book names, validated against src/data/bible-chapters.json).
 *
 * Usage:
 *   npx tsx server/scripts/import-cross-references.ts [inputPath] [--min-votes N]
 * Defaults: input = server/data/scripture-knowledge/raw/cross_references.txt, min-votes = 1.
 *
 * See docs/future/SCRIPTURE_KNOWLEDGE_LAYER.md and the data-dir README.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  parseOsisVerse,
  parseOsisRange,
  isValidVerse,
  canonicalBookOrder,
} from '../../src/utils/scripture-osis';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const OUT_DIR = resolve(__dirname, '../data/scripture-knowledge');
const DEFAULT_INPUT = resolve(OUT_DIR, 'raw/cross_references.txt');
const OUT_FILE = resolve(OUT_DIR, 'cross-references.json');

export interface CrossReferenceRow {
  fromBook: string;
  fromChapter: number;
  fromVerse: number;
  toBook: string;
  toChapterStart: number;
  toChapterEnd: number;
  toVerseStart: number;
  toVerseEnd: number;
  votes: number;
}

function parseArgs(): { input: string; minVotes: number } {
  const args = process.argv.slice(2);
  let input = DEFAULT_INPUT;
  let minVotes = 1;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--min-votes') minVotes = Number(args[++i]);
    else if (!args[i].startsWith('--')) input = resolve(args[i]);
  }
  return { input, minVotes };
}

function main() {
  const { input, minVotes } = parseArgs();
  if (!existsSync(input)) {
    console.error(`Input not found: ${input}`);
    console.error('Download https://a.openbible.info/data/cross-references.zip, unzip, and pass the .txt path.');
    process.exit(1);
  }

  console.log(`Reading ${input} (min votes ${minVotes})...`);
  const lines = readFileSync(input, 'utf-8').split('\n');

  const rows: CrossReferenceRow[] = [];
  const unparseable = new Set<string>();
  const invalid = new Set<string>();
  let skippedVotes = 0;

  // Line 0 is the header (From Verse\tTo Verse\tVotes\t#...attribution).
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cols = line.split('\t');
    if (cols.length < 3) continue;

    const votes = Number(cols[2]);
    if (!Number.isFinite(votes) || votes < minVotes) {
      skippedVotes++;
      continue;
    }

    const from = parseOsisVerse(cols[0]);
    const to = parseOsisRange(cols[1]);
    if (!from || !to) {
      unparseable.add(from ? cols[1] : cols[0]);
      continue;
    }
    if (
      !isValidVerse(from.book, from.chapter, from.verse) ||
      !isValidVerse(to.book, to.chapterStart, to.verseStart)
    ) {
      invalid.add(`${cols[0]} → ${cols[1]}`);
      continue;
    }

    rows.push({
      fromBook: from.book,
      fromChapter: from.chapter,
      fromVerse: from.verse,
      toBook: to.book,
      toChapterStart: to.chapterStart,
      toChapterEnd: to.chapterEnd,
      toVerseStart: to.verseStart,
      toVerseEnd: to.verseEnd,
      votes,
    });
  }

  // Deterministic order: by source verse (canonical book order), then votes desc, then target.
  rows.sort(
    (a, b) =>
      canonicalBookOrder(a.fromBook) - canonicalBookOrder(b.fromBook) ||
      a.fromChapter - b.fromChapter ||
      a.fromVerse - b.fromVerse ||
      b.votes - a.votes ||
      canonicalBookOrder(a.toBook) - canonicalBookOrder(b.toBook) ||
      a.toChapterStart - b.toChapterStart ||
      a.toVerseStart - b.toVerseStart,
  );

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify(rows));

  console.log(`Wrote ${rows.length.toLocaleString()} cross-references → ${OUT_FILE}`);
  console.log(`  skipped (below ${minVotes} votes): ${skippedVotes.toLocaleString()}`);
  console.log(`  dropped (unparseable): ${unparseable.size.toLocaleString()} distinct refs`);
  console.log(`  dropped (out-of-range): ${invalid.size.toLocaleString()} distinct refs`);
  if (unparseable.size) console.log(`    e.g. ${[...unparseable].slice(0, 5).join(', ')}`);
  if (invalid.size) console.log(`    e.g. ${[...invalid].slice(0, 5).join(', ')}`);
}

main();
