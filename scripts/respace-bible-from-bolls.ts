/**
 * Restore the spaces that poetry line breaks lost when the Bible JSON was first imported.
 *
 * Bolls.life marks poetic lines with `<br>` ("captives will be released<br>and prisoners").
 * An early download stripped tags with '' instead of ' ', welding the words at every line end
 * ("releasedand"). `fix-bible-verse-spaces.ts` repaired the fusions it could see from
 * punctuation and capitals; the all-lowercase ones need the source text, which this script uses.
 *
 * Whitespace only: each local verse is walked against the Bolls verse, and a space is inserted
 * where Bolls has one and the local text doesn't. Spaces are never removed and letters never
 * change — a verse whose non-space characters differ from Bolls at all (hand edits, merged
 * verses, footnote residue) is skipped and listed, not touched.
 *
 * Usage:
 *   npx tsx scripts/respace-bible-from-bolls.ts [--dry-run] [--db] [TRANSLATION...]
 *
 *   --dry-run  report only; don't write JSON or the database
 *   --db       also UPDATE every BibleVerses row whose text differs from the JSON, and clear
 *              VerseTextCache (seed-bible-verses.ts can't: it inserts with onConflictDoNothing)
 *
 * Bolls translation zips are cached in $TMPDIR/harvous-bolls so a re-run doesn't download again.
 * KJV is excluded: ours is a clean public-domain text, Bolls serves the Strong's-numbered one.
 */

import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { tmpdir } from 'os';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BIBLES_DIR = resolve(__dirname, '../server/data/bibles');
const CACHE_DIR = join(tmpdir(), 'harvous-bolls');

// Same mapping as server/data/bibles/_download_bolls.mjs.
const BOLLS_CODES: Record<string, string> = {
  ESV: 'ESV',
  NIV: 'NIV2011',
  NLT: 'NLT',
  NKJV: 'NKJV',
  BSB: 'BSB',
  NET: 'NET',
  NASB: 'NASB',
  CSB: 'CSB17',
  AMP: 'AMP',
  MSG: 'MSG',
};

interface VerseEntry {
  book: string;
  chapter: number;
  verse: number;
  text: string;
}

interface BollsVerse {
  book: number;
  chapter: number;
  verse: number;
  text: string;
}

/** Same cleaning as `_download_bolls.mjs` stripHtml — tags become spaces. */
export function stripBollsHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\[\d+\]/g, '')
    .replace(/[①-⓿]/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

const isWordChar = (c: string) => /[\p{L}\p{N}]/u.test(c);

/**
 * Can a space follow `c`? Words, sentence punctuation and closing marks, yes. Dashes never
 * (Bolls pads some em dashes; Harvous text doesn't), and square brackets never — AMP writes
 * "eight[teen]" and "[grand]son" on purpose, and the bracket pairs elsewhere are already spaced. A straight quote is closing — and so may be
 * followed by a space — only when it is attached to the character before it.
 */
function canEndBeforeSpace(c: string, before: string | undefined): boolean {
  if (isWordChar(c) || /[.,;:!?)’”…]/.test(c)) return true;
  if (c === '"' || c === "'") return before !== undefined && !/\s/.test(before);
  return false;
}

/** Can a space precede `c`? Words and opening marks, yes. A straight quote only when opening a word. */
function canStartAfterSpace(c: string, after: string | undefined): boolean {
  if (isWordChar(c) || /[“‘(]/.test(c)) return true;
  if (c === '"' || c === "'") return after !== undefined && isWordChar(after);
  return false;
}

const WORD_PART = /[\p{L}'’]/u;

/** Normalised form used for `knownWords` lookups. */
export const wordKey = (w: string) => w.replace(/’/g, "'").toLowerCase();

/**
 * Bolls wraps small caps and some italics in tags mid-word (`L<span>ord</span>`, `young<i>est</i>`),
 * which read as a space. When the run of letters straddling the junction is a word an undamaged
 * translation uses ("Lord", "youngest", "man's"), it was never fused — leave it joined.
 */
function isKnownWordAcross(out: string, local: string, i: number, knownWords: ReadonlySet<string>): boolean {
  if (!WORD_PART.test(out[out.length - 1]) || !WORD_PART.test(local[i])) return false;
  let start = out.length;
  while (start > 0 && WORD_PART.test(out[start - 1])) start--;
  let end = i;
  while (end < local.length && WORD_PART.test(local[end])) end++;
  // Quote marks at the ends aren't part of the word: `‘I said,’And` is a quote closing, not "’and".
  const left = out.slice(start).replace(/^['’]+/, '');
  const right = local.slice(i, end).replace(/['’]+$/, '');
  if (!left || !right) return false;
  return knownWords.has(wordKey(left + right));
}

const DASH = /[—–]/;
// NLT labels merged verses inside the text ("[22-23] Simeon — 59,300"); Harvous text doesn't.
const VERSE_RANGE_LABEL = /^\[\d+[-–]\d+\]\s*/;

/**
 * Insert into `local` the spaces `source` has between non-space characters.
 *
 * Returns null unless `local` matches `source` (or a contiguous run of it) in everything but
 * whitespace, letter case and apostrophe style (Bolls writes "LORD" and "'" where some Harvous
 * files say "Lord" and "’"; local characters are kept).
 *
 * With `restoreDashes`, dashes are left out of the comparison too, and a dash `source` has that
 * `local` lacks is put back with the source's spacing. List passages lost theirs along with the
 * line breaks: NLT "Simeon59,300" is Bolls "Simeon — 59,300", NIV "Hormahonethe" is "Hormah — one the".
 */
export function respaceFromSource(
  local: string,
  rawSource: string,
  knownWords: ReadonlySet<string> = new Set(),
  { restoreDashes = false }: { restoreDashes?: boolean } = {},
): string | null {
  const source = rawSource.replace(VERSE_RANGE_LABEL, '');
  const ignorable = (c: string) => /\s/.test(c) || (restoreDashes && DASH.test(c));
  const squash = (s: string) =>
    [...s].filter((c) => !ignorable(c)).join('').replace(/’/g, "'").toLowerCase();
  const localSquashed = squash(local);
  const sourceSquashed = squash(source);
  // Bolls sometimes carries a psalm title or section heading inside the verse; when the local
  // verse is a contiguous run of the source, align from where it starts.
  const offset = sourceSquashed.indexOf(localSquashed);
  if (!localSquashed || offset < 0) return null;
  // A short verse could match the wrong stretch of a long one; only align exact matches then.
  if (offset > 0 && localSquashed.length < 20) return null;

  let out = '';
  let j = 0;
  for (let seen = 0; seen < offset || (j < source.length && ignorable(source[j])); j++) {
    if (!ignorable(source[j])) seen++;
  }
  for (let i = 0; i < local.length; i++) {
    const ch = local[i];
    if (restoreDashes && DASH.test(ch)) {
      // A dash both texts have: consume the source's copy so it isn't restored a second time.
      while (j < source.length && ignorable(source[j]) && !DASH.test(source[j])) j++;
      if (j < source.length && DASH.test(source[j])) j++;
      out += ch;
      continue;
    }
    if (/\s/.test(ch)) {
      out += ch;
      continue;
    }
    let gap = '';
    while (j < source.length && ignorable(source[j])) gap += source[j++];
    const prev = out[out.length - 1];
    if (DASH.test(gap) && prev !== undefined && !/\s/.test(prev) && !DASH.test(prev)) {
      // A dash the local text dropped: restore it as the source spaces it. (Next to a dash the
      // local text kept, the source's extra one is a doubled dash, as in NLT Psalm 136's refrain.)
      out += gap.replace(/\s+/g, ' ');
    } else if (
      gap &&
      prev !== undefined &&
      !/\s/.test(prev) &&
      canEndBeforeSpace(prev, out[out.length - 2]) &&
      canStartAfterSpace(ch, local[i + 1]) &&
      !isKnownWordAcross(out, local, i, knownWords)
    ) {
      out += ' ';
    }
    out += ch;
    j++;
  }
  return out;
}

/**
 * Fusions the Bolls comparison can't reach, each checked by hand against the Bolls text: the verse
 * differs from Bolls in more than spacing (a heading or footnote letter inside it), or Bolls
 * carries the same fusion. Applied only while `from` is still present, so re-runs are no-ops.
 */
const MANUAL_FIXES: [translation: string, book: string, chapter: number, verse: number, from: string, to: string][] = [
  ['AMP', 'Matthew', 26, 23, 'as apretense', 'as a pretense'],
  ['AMP', 'Mark', 10, 5, 'theprovision', 'the provision'],
  ['AMP', '1 Samuel', 17, 5, 'weighed5,000', 'weighed 5,000'],
  ['AMP', '2 Samuel', 14, 26, 'at200', 'at 200'],
  ['AMP', '1 Kings', 4, 26, 'had40,000', 'had 40,000'],
  ['AMP', '1 Chronicles', 23, 4, 'these24,000', 'these 24,000'],
  ['AMP', '2 Chronicles', 4, 5, 'hold3,000', 'hold 3,000'],
  ['AMP', 'Daniel', 12, 12, 'the1,335', 'the 1,335'],
  ['AMP', 'John', 6, 10, 'about5,000', 'about 5,000'],
  ['AMP', 'Acts', 2, 41, 'about3,000', 'about 3,000'],
  ['AMP', 'Acts', 19, 19, 'be50,000', 'be 50,000'],
  ['CSB', 'Mark', 9, 48, 'wheretheir', 'where their'],
  ['MSG', '2 Samuel', 11, 27, 'a son. ut God', 'a son. But God'],
  ['NIV', 'Ezekiel', 19, 7, 'strongholdsand', 'strongholds and'],
  ['NIV', 'Ezekiel', 19, 7, 'in itwere', 'in it were'],
  ['NIV', 'Ezekiel', 19, 14, 'branchesand', 'branches and'],
  ['NIV', 'Ezekiel', 19, 14, 'on itfit', 'on it fit'],
  ['NIV', 'Ezekiel', 19, 14, 'scepter.’“This', 'scepter.’ “This'],
  ['NLT', 'Song of Solomon', 5, 1, 'spicesand', 'spices and'],
  ['NLT', 'Obadiah', 1, 1, 'the Lordthat', 'the Lord that'],
  ['NLT', 'Obadiah', 1, 1, 'to say,“Get', 'to say, “Get'],
  ['NLT', 'Genesis', 29, 14, 'blood!”After', 'blood!” After'],
  ['NLT', 'Numbers', 2, 3, 'Amminadab74,600', 'Amminadab — 74,600'],
  ['NLT', 'Numbers', 2, 10, 'Shedeur46,500', 'Shedeur — 46,500'],
  ['NLT', 'Numbers', 2, 18, 'Ammihud40,500', 'Ammihud — 40,500'],
  ['NLT', 'Numbers', 2, 25, 'Ammishaddai62,700', 'Ammishaddai — 62,700'],
  ['ESV', 'John', 12, 36, 'light.”When', 'light.” When'],
  ['CSB', 'Hebrews', 10, 17, 'andI will', 'and I will'],
  ['CSB', 'Matthew', 27, 9, 'fulfilled:They', 'fulfilled: They'],
  ['CSB', 'Luke', 2, 23, 'Lord,Every', 'Lord, Every'],
  ['MSG', 'Psalms', 128, 1, 'fear God,how', 'fear God, how'],
];

function applyManualFixes(translationId: string, verses: VerseEntry[], changed: VerseEntry[]): void {
  for (const [t, book, chapter, verse, from, to] of MANUAL_FIXES) {
    if (t !== translationId) continue;
    const v = verses.find((x) => x.book === book && x.chapter === chapter && x.verse === verse);
    if (!v || !v.text.includes(from)) continue;
    v.text = v.text.replace(from, to);
    if (!changed.includes(v)) changed.push(v);
  }
}

function loadBolls(code: string): BollsVerse[] {
  mkdirSync(CACHE_DIR, { recursive: true });
  const jsonPath = join(CACHE_DIR, `${code}.json`);
  if (!existsSync(jsonPath)) {
    const zipPath = join(CACHE_DIR, `${code}.zip`);
    console.log(`  Downloading https://bolls.life/static/translations/${code}.zip ...`);
    execFileSync('curl', ['-sSfL', '-o', zipPath, `https://bolls.life/static/translations/${code}.zip`]);
    execFileSync('unzip', ['-o', '-q', zipPath, '-d', CACHE_DIR]);
  }
  return JSON.parse(readFileSync(jsonPath, 'utf-8'));
}

function bookNamesByOrder(): Map<number, string> {
  const chapters: { book: string; bookOrder: number }[] = JSON.parse(
    readFileSync(resolve(__dirname, '../src/data/bible-chapters.json'), 'utf-8'),
  );
  return new Map(chapters.map((c) => [c.bookOrder, c.book]));
}

interface Result {
  translationId: string;
  changed: VerseEntry[];
  skipped: string[];
  missing: number;
}

/**
 * Translations the line-break damage barely reached: the "was this ever one word" oracle.
 * BSB is left out — it carries the same fusions this script repairs, twice over in places
 * ("bowand"). A few fused words did slip into NASB, once each, so a word only counts as known
 * when it appears at least twice.
 */
const REFERENCE_TRANSLATIONS = ['KJV', 'NASB', 'CSB'];

function loadKnownWords(): Set<string> {
  const counts = new Map<string, number>();
  for (const id of REFERENCE_TRANSLATIONS) {
    const verses: VerseEntry[] = JSON.parse(readFileSync(resolve(BIBLES_DIR, `${id}.json`), 'utf-8'));
    for (const v of verses) {
      for (const w of v.text.match(/[\p{L}'’]+/gu) ?? []) counts.set(wordKey(w), (counts.get(wordKey(w)) ?? 0) + 1);
    }
  }
  return new Set([...counts].filter(([, n]) => n >= 2).map(([w]) => w));
}

function respaceTranslation(
  translationId: string,
  books: Map<number, string>,
  knownWords: ReadonlySet<string>,
): Result {
  const filePath = resolve(BIBLES_DIR, `${translationId}.json`);
  const verses: VerseEntry[] = JSON.parse(readFileSync(filePath, 'utf-8'));

  const source = new Map<string, string>();
  for (const v of loadBolls(BOLLS_CODES[translationId])) {
    const book = books.get(v.book);
    if (book) source.set(`${book}:${v.chapter}:${v.verse}`, stripBollsHtml(v.text));
  }

  const changed: VerseEntry[] = [];
  const skipped: string[] = [];
  let missing = 0;
  for (const v of verses) {
    const src = source.get(`${v.book}:${v.chapter}:${v.verse}`);
    if (src === undefined) {
      missing++;
      continue;
    }
    const respaced =
      respaceFromSource(v.text, src, knownWords) ??
      respaceFromSource(v.text, src, knownWords, { restoreDashes: true });
    if (respaced === null) {
      skipped.push(`${v.book} ${v.chapter}:${v.verse}`);
    } else if (respaced !== v.text) {
      v.text = respaced;
      changed.push(v);
    }
  }

  applyManualFixes(translationId, verses, changed);
  return { translationId, changed, skipped, missing };
}

/**
 * Bring `BibleVerses` in line with the JSON files: every row whose text differs gets the JSON's.
 * Diffed against the database rather than against this run's changes, because the JSON is usually
 * already repaired by the time the database is touched.
 */
async function updateDatabase(translationIds: string[]): Promise<void> {
  const { db, BibleVerses, VerseTextCache, eq } = await import('../server/db');
  for (const translationId of translationIds) {
    const verses: VerseEntry[] = JSON.parse(readFileSync(resolve(BIBLES_DIR, `${translationId}.json`), 'utf-8'));
    const rows = await db
      .select({ id: BibleVerses.id, text: BibleVerses.text })
      .from(BibleVerses)
      .where(eq(BibleVerses.translationId, translationId));
    const current = new Map(rows.map((r) => [r.id, r.text]));
    const stale = verses.filter((v) => {
      const dbText = current.get(`${translationId}_${v.book}_${v.chapter}_${v.verse}`);
      return dbText !== undefined && dbText !== v.text;
    });
    let updated = 0;
    for (const v of stale) {
      await db
        .update(BibleVerses)
        .set({ text: v.text })
        .where(eq(BibleVerses.id, `${translationId}_${v.book}_${v.chapter}_${v.verse}`));
      updated++;
      if (updated % 200 === 0) process.stdout.write(`\r  ${translationId} DB updated: ${updated}/${stale.length}`);
    }
    console.log(`\r  ${translationId}: ${updated} of ${rows.length} rows updated.          `);
  }
  console.log('Clearing VerseTextCache...');
  await db.delete(VerseTextCache);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const withDb = args.includes('--db');
  const targets = args.filter((a) => !a.startsWith('--')).map((a) => a.toUpperCase());
  const toProcess = targets.length ? targets : Object.keys(BOLLS_CODES);

  const books = bookNamesByOrder();
  const knownWords = loadKnownWords();
  const results: Result[] = [];
  for (const id of toProcess) {
    if (!BOLLS_CODES[id]) {
      console.error(`Unknown translation ${id}. Available: ${Object.keys(BOLLS_CODES).join(', ')}`);
      process.exit(1);
    }
    console.log(`\n${id}`);
    const result = respaceTranslation(id, books, knownWords);
    results.push(result);
    console.log(
      `  respaced ${result.changed.length}, skipped ${result.skipped.length} (text differs from Bolls), ` +
        `${result.missing} not in Bolls`,
    );
    if (result.skipped.length) {
      console.log(`  skipped: ${result.skipped.slice(0, 15).join('; ')}${result.skipped.length > 15 ? ' …' : ''}`);
    }
    if (!dryRun && result.changed.length) {
      const filePath = resolve(BIBLES_DIR, `${id}.json`);
      const all: VerseEntry[] = JSON.parse(readFileSync(filePath, 'utf-8'));
      const byKey = new Map(result.changed.map((v) => [`${v.book}:${v.chapter}:${v.verse}`, v.text]));
      for (const v of all) {
        const text = byKey.get(`${v.book}:${v.chapter}:${v.verse}`);
        if (text !== undefined) v.text = text;
      }
      writeFileSync(filePath, JSON.stringify(all, null, 2) + '\n', 'utf-8');
    }
  }

  if (withDb && !dryRun) await updateDatabase(results.map((r) => r.translationId));
  process.exit(0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('Script failed:', err);
    process.exit(1);
  });
}
