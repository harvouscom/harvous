/**
 * Derive curated per-chapter subjects from the seeded topical data, filtered through the
 * controlled vocabulary (`src/utils/subject-vocabulary.ts`). Deterministic — no AI:
 * for each chapter, aggregate the OpenBible topics that map to a real Subject, rank by how many of
 * the chapter's verses they span, keep the top few. AI authoring to fill weak/missing chapters is
 * a later pass (the hybrid plan). See docs/future/SCRIPTURE_KNOWLEDGE_LAYER.md (folder rethink).
 *
 * Output: server/data/scripture-knowledge/subjects.json (gitignored; sample committed).
 * Usage:  npx tsx server/scripts/import-subjects.ts   (reads the seeded ScriptureTopicVerses)
 */

import 'dotenv/config';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { db, ScriptureTopicVerses as TV, ScriptureTopics as T, eq } from '../db';
import { mapToSubject } from '../../src/utils/subject-vocabulary';
import { canonicalBookOrder } from '../../src/utils/scripture-osis';
import bibleChapters from '../../src/data/bible-chapters.json';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUT_DIR = resolve(__dirname, '../data/scripture-knowledge');
const OUT_FILE = resolve(OUT_DIR, 'subjects.json');

const MAX_SUBJECTS_PER_CHAPTER = 5;
const MIN_VERSE_SPREAD = 2;

export interface SubjectRow {
  book: string;
  chapter: number;
  subject: string;
  category: string;
  verseSpread: number;
  order: number;
}

const books: string[] = [...new Set((bibleChapters as Array<{ book: string }>).map((c) => c.book))];

async function main() {
  const out: SubjectRow[] = [];
  for (const book of books) {
    const rows = await db
      .select({ chapter: TV.chapter, verse: TV.verse, relevance: TV.relevance, label: T.label })
      .from(TV)
      .innerJoin(T, eq(TV.topicId, T.id))
      .where(eq(TV.book, book));

    const byChapter = new Map<number, Array<{ verse: number; relevance: number; label: string }>>();
    for (const r of rows) {
      const a = byChapter.get(r.chapter) ?? [];
      a.push(r);
      byChapter.set(r.chapter, a);
    }

    for (const [chapter, list] of byChapter) {
      const agg = new Map<string, { verses: Set<number>; rel: number; cat: string }>();
      for (const r of list) {
        const s = mapToSubject(r.label);
        if (!s) continue;
        let e = agg.get(s.name);
        if (!e) {
          e = { verses: new Set(), rel: 0, cat: s.category };
          agg.set(s.name, e);
        }
        e.verses.add(r.verse);
        e.rel += r.relevance;
      }
      const ranked = [...agg.entries()]
        .map(([subject, e]) => ({ subject, category: e.cat, verseSpread: e.verses.size, rel: e.rel }))
        .filter((s) => s.verseSpread >= MIN_VERSE_SPREAD)
        .sort((a, b) => b.verseSpread - a.verseSpread || b.rel - a.rel)
        .slice(0, MAX_SUBJECTS_PER_CHAPTER);
      ranked.forEach((s, i) =>
        out.push({ book, chapter, subject: s.subject, category: s.category, verseSpread: s.verseSpread, order: i }),
      );
    }
    process.stdout.write(`  ${book}                    \r`);
  }

  out.sort(
    (a, b) => canonicalBookOrder(a.book) - canonicalBookOrder(b.book) || a.chapter - b.chapter || a.order - b.order,
  );
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify(out));
  const chapters = new Set(out.map((o) => `${o.book}|${o.chapter}`)).size;
  console.log(`\nWrote ${out.length.toLocaleString()} chapter-subjects across ${chapters} chapters → ${OUT_FILE}`);

  // Compact client index (top 3 per chapter, labels only) — committed + shipped to the SPA.
  const compact: Record<string, Record<string, string[]>> = {};
  for (const r of out) {
    if (r.order >= 3) continue;
    (compact[r.book] ??= {})[String(r.chapter)] ??= [];
    compact[r.book][String(r.chapter)].push(r.subject);
  }
  const clientIndex = resolve(__dirname, '../../src/data/chapter-subjects.json');
  writeFileSync(clientIndex, JSON.stringify(compact));
  console.log(`Wrote compact client index → ${clientIndex}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
