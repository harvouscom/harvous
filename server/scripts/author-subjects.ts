/**
 * AI gap-fill — author 1–4 curated subjects + a one-sentence summary for every Bible chapter,
 * to enrich the deterministic per-chapter subjects (which only see the noisy OpenBible topic data).
 *
 * Why this design:
 *  - Message Batches API: one async batch for all ~1,189 chapters at 50% of standard price. This is
 *    a one-time, non-latency-sensitive job — exactly what batches are for.
 *  - Structured outputs: `subjects` is an enum of the controlled vocabulary
 *    (src/utils/subject-vocabulary.ts), so the model literally cannot invent an off-list subject —
 *    that constraint is what keeps folders clean. We still validate + clamp client-side.
 *  - Thinking disabled: labelling a chapter from a fixed list is simple classification; no need to
 *    pay for reasoning tokens across 1,189 calls. (Skipped automatically for Fable, where it's
 *    always on.)
 *  - Cost levers: the 50% batch discount (above) plus the automatic 24h structured-output schema
 *    cache (the 108-name enum compiles once). A cache breakpoint is set on the shared system prompt
 *    too, though at its current size (~550 tokens) it's below the model's ~4K caching minimum and
 *    won't engage until the vocabulary grows — harmless either way.
 *
 * Model: defaults to claude-opus-4-8 (best quality for the foundational asset). Override with
 *   --model=… / SUBJECTS_MODEL if you want to trade quality for cost (e.g. claude-sonnet-4-6).
 *
 * Output: server/data/scripture-knowledge/subjects-ai.json  (gitignored)
 *   [{ book, chapter, subjects: string[], summary: string }]
 * Then run `npm run skl:import:subjects` — it merges these over the deterministic derivation and
 * regenerates the compact client index (src/data/chapter-subjects.json).
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... npm run skl:author:subjects
 *     First run (no saved state): builds + submits the batch, saves the batch id, then polls.
 *     Resumed run (state present): re-attaches to the saved batch, polls, then collects results.
 *   Flags:
 *     --dry-run          build the batch and print stats WITHOUT submitting (no API key, no spend)
 *     --gaps             re-author only chapters missing from subjects-ai.json or lacking a summary,
 *                        synchronously (no batch latency); upserts into the existing file
 *     --reset            discard saved batch state and submit a fresh batch
 *     --model=claude-…   override the model (default claude-opus-4-8)
 *     --bible=BSB        translation to read chapter text from (default BSB — public domain)
 */

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { writeFileSync, readFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { SUBJECT_VOCABULARY } from '../../src/utils/subject-vocabulary';
import { canonicalBookOrder } from '../../src/utils/scripture-osis';
import bibleChapters from '../../src/data/bible-chapters.json';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../data/scripture-knowledge');
const STATE_FILE = resolve(OUT_DIR, '_subjects-batch.json');
const OUT_FILE = resolve(OUT_DIR, 'subjects-ai.json');

const args = process.argv.slice(2);
const flag = (name: string, def: string): string => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : def;
};
const RESET = args.includes('--reset');
const DRY_RUN = args.includes('--dry-run');
const GAPS = args.includes('--gaps');
const MODEL = flag('model', process.env.SUBJECTS_MODEL || 'claude-opus-4-8');
const BIBLE = flag('bible', process.env.SUBJECTS_BIBLE || 'BSB');
const MAX_SUBJECTS = 4;
const POLL_MS = 30_000;

interface ChapterMeta {
  book: string;
  chapter: number;
}
interface Verse {
  book: string;
  chapter: number;
  verse: number;
  text: string;
}
interface BatchState {
  batchId: string;
  model: string;
  bible: string;
  total: number;
  index: Record<string, ChapterMeta>; // custom_id -> chapter
}

const SUBJECT_NAMES = SUBJECT_VOCABULARY.map((s) => s.name);
const CHAPTERS: ChapterMeta[] = (bibleChapters as ChapterMeta[]).map((c) => ({ book: c.book, chapter: c.chapter }));

/** Whole-chapter text as "1 In the beginning…\n2 …", keyed by `book|chapter`. */
function loadChapterText(): Map<string, string> {
  const path = resolve(__dirname, `../data/bibles/${BIBLE}.json`);
  if (!existsSync(path)) {
    console.error(`Translation ${BIBLE} not found at ${path}. Pass --bible=<ID> for a downloaded translation.`);
    process.exit(1);
  }
  const verses = JSON.parse(readFileSync(path, 'utf8')) as Verse[];
  const byChapter = new Map<string, Verse[]>();
  for (const v of verses) {
    const key = `${v.book}|${v.chapter}`;
    const list = byChapter.get(key);
    if (list) list.push(v);
    else byChapter.set(key, [v]);
  }
  const out = new Map<string, string>();
  for (const [key, list] of byChapter) {
    list.sort((a, b) => a.verse - b.verse);
    out.set(key, list.map((v) => `${v.verse} ${v.text}`).join('\n'));
  }
  return out;
}

/** System prompt: the labelling task + the controlled vocabulary, grouped by category. */
function buildSystemPrompt(): string {
  const labels: Record<string, string> = {
    spiritual: 'Spiritual disciplines & virtues',
    biblical: 'Doctrinal / biblical',
    life: 'Life / application',
    narrative: 'Narrative / structural',
  };
  const byCat = new Map<string, string[]>();
  for (const s of SUBJECT_VOCABULARY) {
    const list = byCat.get(s.category);
    if (list) list.push(s.name);
    else byCat.set(s.category, [s.name]);
  }
  const vocab = [...byCat.entries()].map(([cat, names]) => `${labels[cat] ?? cat}: ${names.join(', ')}`).join('\n');
  return [
    'You label chapters of the Bible with the subjects they are primarily about, for a Bible-study notes app.',
    'These subjects become broad folders that organize a reader\'s notes, so pick only the few central themes of the chapter — not every topic mentioned in passing.',
    '',
    'Rules:',
    `- Choose 1 to ${MAX_SUBJECTS} subjects, ONLY from the controlled vocabulary below. List them most-central first.`,
    '- When a chapter recounts a specific biblical event it is known for, prefer the narrative/structural subject for it (e.g. Creation, The Exodus, Birth of Jesus, The Passion).',
    '- Do not pick a subject just because a word appears once — it must be a main theme of the chapter.',
    '- Also write one plain sentence (under 25 words) summarizing what the chapter is about.',
    '',
    'Controlled vocabulary (choose subjects only from these exact names):',
    vocab,
  ].join('\n');
}

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    subjects: {
      type: 'array',
      description: `Between 1 and ${MAX_SUBJECTS} subject names, copied exactly from the controlled vocabulary, most-central first.`,
      items: { type: 'string', enum: SUBJECT_NAMES },
    },
    summary: { type: 'string', description: 'One plain sentence (under 25 words) on what the chapter is about.' },
  },
  required: ['subjects', 'summary'],
};

type BatchRequest = Anthropic.Messages.Batches.BatchCreateParams['requests'][number];

/** The Messages-API params for one chapter — shared by the batch (full) and sync (gap-fill) paths. */
function buildParams(ch: ChapterMeta, body: string, system: string): Anthropic.MessageCreateParamsNonStreaming {
  const isFable = MODEL.includes('fable');
  return {
    model: MODEL,
    max_tokens: 1024,
    // Simple classification — no need to pay for reasoning tokens (Fable is always-on, so skip).
    ...(isFable ? {} : { thinking: { type: 'disabled' } }),
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
    messages: [{ role: 'user', content: `${ch.book} ${ch.chapter}\n\n${body}` }],
  };
}

/** Parse one structured-output message into validated subjects + summary, or null if unusable. */
function parseResult(content: Anthropic.ContentBlock[]): { subjects: string[]; summary: string } | null {
  const textBlock = content.find((b): b is Anthropic.TextBlock => b.type === 'text');
  if (!textBlock) return null;
  let parsed: { subjects?: unknown; summary?: unknown };
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    return null;
  }
  const subjects = cleanSubjects(parsed.subjects);
  if (!subjects.length) return null;
  return { subjects, summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : '' };
}

/** One batch request per chapter; returns the requests + the custom_id→chapter map. */
function buildRequests(text: Map<string, string>, system: string): { requests: BatchRequest[]; index: Record<string, ChapterMeta> } {
  const requests: BatchRequest[] = [];
  const index: Record<string, ChapterMeta> = {};
  CHAPTERS.forEach((ch, i) => {
    const body = text.get(`${ch.book}|${ch.chapter}`);
    if (!body) return; // translation is missing this chapter
    const id = `c${String(i).padStart(4, '0')}`;
    index[id] = ch;
    requests.push({ custom_id: id, params: buildParams(ch, body, system) });
  });
  return { requests, index };
}

async function submit(client: Anthropic): Promise<BatchState> {
  const text = loadChapterText();
  const { requests, index } = buildRequests(text, buildSystemPrompt());
  console.log(`Submitting batch: ${requests.length} chapters · model ${MODEL} · ${BIBLE} text…`);
  const batch = await client.messages.batches.create({ requests });
  const state: BatchState = { batchId: batch.id, model: MODEL, bible: BIBLE, total: requests.length, index };
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  console.log(`Batch ${batch.id} submitted; state saved → ${STATE_FILE}`);
  console.log('Most batches finish within an hour (max 24h). This script will poll until it ends;');
  console.log('it is safe to Ctrl-C and re-run later — it re-attaches to the same batch.');
  return state;
}

async function poll(client: Anthropic, batchId: string): Promise<void> {
  for (;;) {
    const b = await client.messages.batches.retrieve(batchId);
    const c = b.request_counts;
    process.stdout.write(
      `  ${b.processing_status} — succeeded ${c.succeeded}, errored ${c.errored}, processing ${c.processing}        \r`,
    );
    if (b.processing_status === 'ended') {
      process.stdout.write('\n');
      return;
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

/** Keep only valid, deduped, canonical-cased vocabulary subjects (max MAX_SUBJECTS). */
function cleanSubjects(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of raw) {
    if (typeof s !== 'string') continue;
    const canon = SUBJECT_NAMES.find((n) => n.toLowerCase() === s.trim().toLowerCase());
    if (!canon || seen.has(canon)) continue;
    seen.add(canon);
    out.push(canon);
    if (out.length >= MAX_SUBJECTS) break;
  }
  return out;
}

interface SubjectAiRow {
  book: string;
  chapter: number;
  subjects: string[];
  summary: string;
}

async function collect(client: Anthropic, state: BatchState): Promise<void> {
  const rows: SubjectAiRow[] = [];
  let ok = 0;
  let errored = 0;
  let empty = 0;
  for await (const r of await client.messages.batches.results(state.batchId)) {
    const ch = state.index[r.custom_id];
    if (!ch) continue;
    if (r.result.type !== 'succeeded') {
      errored++;
      continue;
    }
    const parsed = parseResult(r.result.message.content);
    if (!parsed) {
      empty++;
      continue;
    }
    rows.push({ book: ch.book, chapter: ch.chapter, subjects: parsed.subjects, summary: parsed.summary });
    ok++;
  }
  rows.sort((a, b) => canonicalBookOrder(a.book) - canonicalBookOrder(b.book) || a.chapter - b.chapter);
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify(rows));
  console.log(`Authored ${ok} chapters (errored ${errored}, empty/unparseable ${empty}) → ${OUT_FILE}`);
  if (errored || empty) console.log('  Some chapters did not produce subjects — re-run with --reset to resubmit a fresh batch.');
  console.log('Next: npm run skl:import:subjects  (merges AI subjects over the deterministic ones, regenerates the client index).');
}

function dryRun(): void {
  const text = loadChapterText();
  const system = buildSystemPrompt();
  const { requests } = buildRequests(text, system);
  const sample = requests[Math.floor(requests.length / 2)];
  const sampleUser = String(sample.params.messages[0].content);
  console.log(`Dry run — ${requests.length} chapter requests built (NOT submitted).`);
  console.log(`  model:          ${MODEL}${MODEL.includes('fable') ? '' : ' (thinking disabled)'}`);
  console.log(`  translation:    ${BIBLE}`);
  console.log(`  vocabulary:     ${SUBJECT_NAMES.length} subjects (enum-constrained)`);
  console.log(`  system prompt:  ~${Math.round(system.length / 4)} tokens (cache breakpoint set; engages only above the model's ~4K minimum)`);
  console.log(`  sample request: ${sample.custom_id} → ${sampleUser.split('\n')[0]} (${sampleUser.length} chars of text)`);
  console.log('Run without --dry-run (and with ANTHROPIC_API_KEY set) to submit.');
}

/**
 * Synchronous gap-fill: re-author only the chapters missing from subjects-ai.json or with no
 * summary, and upsert them into it. Small N, so plain sequential calls (no batch latency) — fast
 * and immediate. Run `skl:import:subjects` afterwards to regenerate the client index.
 */
async function fillGaps(client: Anthropic): Promise<void> {
  if (!existsSync(OUT_FILE)) {
    console.error(`No ${OUT_FILE} to patch — run the full pass first (npm run skl:author:subjects).`);
    process.exit(1);
  }
  const existing = JSON.parse(readFileSync(OUT_FILE, 'utf8')) as SubjectAiRow[];
  const byKey = new Map(existing.map((r) => [`${r.book}|${r.chapter}`, r]));
  const text = loadChapterText();
  const system = buildSystemPrompt();
  const gaps = CHAPTERS.filter((ch) => {
    if (!text.has(`${ch.book}|${ch.chapter}`)) return false;
    const r = byKey.get(`${ch.book}|${ch.chapter}`);
    return !r || !r.subjects?.length || !r.summary?.trim();
  });
  if (!gaps.length) {
    console.log('No gaps — every chapter already has subjects and a summary.');
    return;
  }
  console.log(`Filling ${gaps.length} gap chapter(s) synchronously · model ${MODEL}…`);
  let filled = 0;
  for (const ch of gaps) {
    const body = text.get(`${ch.book}|${ch.chapter}`) as string;
    const msg = await client.messages.create(buildParams(ch, body, system));
    const parsed = parseResult(msg.content);
    if (!parsed) {
      console.log(`  ${ch.book} ${ch.chapter}: no usable result, left as-is`);
      continue;
    }
    byKey.set(`${ch.book}|${ch.chapter}`, { book: ch.book, chapter: ch.chapter, ...parsed });
    filled++;
    process.stdout.write(`  ${filled}/${gaps.length} ${ch.book} ${ch.chapter}            \r`);
  }
  const merged = [...byKey.values()].sort(
    (a, b) => canonicalBookOrder(a.book) - canonicalBookOrder(b.book) || a.chapter - b.chapter,
  );
  writeFileSync(OUT_FILE, JSON.stringify(merged));
  console.log(`\nFilled ${filled}/${gaps.length} gap(s) → ${OUT_FILE}`);
  console.log('Next: npm run skl:import:subjects  (regenerate the client index).');
}

async function main(): Promise<void> {
  if (DRY_RUN) {
    dryRun();
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set. Export it (or add it to .env) and re-run.');
    process.exit(1);
  }
  const client = new Anthropic();
  if (GAPS) {
    await fillGaps(client);
    return;
  }
  if (RESET && existsSync(STATE_FILE)) {
    rmSync(STATE_FILE);
    console.log('Reset: cleared saved batch state.');
  }
  let state: BatchState;
  if (existsSync(STATE_FILE)) {
    state = JSON.parse(readFileSync(STATE_FILE, 'utf8')) as BatchState;
    console.log(`Resuming batch ${state.batchId} (${state.total} chapters · model ${state.model}).`);
  } else {
    state = await submit(client);
  }
  await poll(client, state.batchId);
  await collect(client, state);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
