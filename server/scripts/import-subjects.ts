/**
 * Derive curated per-chapter subjects from the seeded topical data, filtered through the
 * controlled vocabulary (`src/utils/subject-vocabulary.ts`). Deterministic — no AI:
 * for each chapter, aggregate the OpenBible topics that map to a real Subject, rank by how many of
 * the chapter's verses they span, keep the top few. See docs/future/SCRIPTURE_KNOWLEDGE_LAYER.md.
 *
 * Hybrid merge: if AI-authored subjects exist (server/data/scripture-knowledge/subjects-ai.json,
 * produced by `npm run skl:author:subjects`), they take precedence per chapter when building the
 * compact client index — the deterministic derivation is the fallback for any chapter the AI pass
 * didn't cover. Run the author script first, then this, to ship the best subjects.
 *
 * Output: server/data/scripture-knowledge/subjects.json (deterministic audit set; gitignored)
 *         src/data/chapter-subjects.json (compact client index — AI-preferred, committed)
 * Usage:  npx tsx server/scripts/import-subjects.ts   (reads the seeded ScriptureTopicVerses)
 */

import 'dotenv/config';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { db, ScriptureTopicVerses as TV, ScriptureTopics as T, eq } from '../db';
import { mapToSubject } from '../../src/utils/subject-vocabulary';
import { guardNarrativeSubjects } from '../../src/utils/scripture-narrative-ranges';
import { canonicalBookOrder } from '../../src/utils/scripture-osis';
import bibleChapters from '../../src/data/bible-chapters.json';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUT_DIR = resolve(__dirname, '../data/scripture-knowledge');
const OUT_FILE = resolve(OUT_DIR, 'subjects.json');
const AI_FILE = resolve(OUT_DIR, 'subjects-ai.json');

const MAX_SUBJECTS_PER_CHAPTER = 5;
const MIN_VERSE_SPREAD = 2;
const COMPACT_PER_CHAPTER = 3; // subjects shipped per chapter in the client index

// Subjects retired from the vocabulary (theologian cleanup) → their canonical replacement, so AI
// rows authored against the old vocabulary still resolve to a current subject.
const RENAMED_SUBJECTS: Record<string, string> = {
  'Grace of God': 'Grace',
  'Worship of God': 'Worship',
};

/** AI-authored subjects keyed by `book|chapter`, or empty if the author pass hasn't run. */
function loadAiSubjects(): Map<string, string[]> {
  const map = new Map<string, string[]>();
  if (!existsSync(AI_FILE)) return map;
  const rows = JSON.parse(readFileSync(AI_FILE, 'utf8')) as Array<{ book: string; chapter: number; subjects: string[] }>;
  for (const r of rows) {
    if (!r.subjects?.length) continue;
    const subjects = [...new Set(r.subjects.map((s) => RENAMED_SUBJECTS[s] ?? s))];
    map.set(`${r.book}|${r.chapter}`, subjects);
  }
  return map;
}

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

  // Compact client index (top N per chapter, labels only) — committed + shipped to the SPA.
  // AI-authored subjects win per chapter; the deterministic top-N is the fallback.
  const ai = loadAiSubjects();
  const deterministicByChapter = new Map<string, string[]>();
  for (const r of out) {
    if (r.order >= COMPACT_PER_CHAPTER) continue;
    const key = `${r.book}|${r.chapter}`;
    const list = deterministicByChapter.get(key);
    if (list) list.push(r.subject);
    else deterministicByChapter.set(key, [r.subject]);
  }

  const compact: Record<string, Record<string, string[]>> = {};
  let aiChapters = 0;
  let deterministicChapters = 0;
  for (const key of new Set([...deterministicByChapter.keys(), ...ai.keys()])) {
    const [book, chapter] = key.split('|');
    const det = deterministicByChapter.get(key) ?? [];
    const fromAi = ai.get(key);
    // Canonical-range guard: drop out-of-range narrative subjects, lead with in-range headline events.
    let guarded = guardNarrativeSubjects(book, Number(chapter), fromAi ?? det);
    let usedAi = Boolean(fromAi);
    // If the guard removed every AI subject (a chapter whose sole subject was an out-of-range
    // narrative misfire), fall back to the deterministic subjects rather than ship no folder.
    if (!guarded.length && fromAi && det.length) {
      guarded = guardNarrativeSubjects(book, Number(chapter), det);
      usedAi = false;
    }
    const subjects = guarded.slice(0, COMPACT_PER_CHAPTER);
    if (!subjects.length) continue;
    if (usedAi) aiChapters++;
    else deterministicChapters++;
    (compact[book] ??= {})[chapter] = subjects;
  }

  const clientIndex = resolve(__dirname, '../../src/data/chapter-subjects.json');
  writeFileSync(clientIndex, JSON.stringify(compact));
  console.log(
    `Wrote compact client index (${aiChapters} AI-authored, ${deterministicChapters} deterministic chapters) → ${clientIndex}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
