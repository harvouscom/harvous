/**
 * Build the red-letter data (words of Jesus) the Bible reader colours with.
 *
 * Usage:
 *   npx tsx server/data/bibles/_build_red_letter.ts
 *
 * Sources, both public domain, from eBible.org:
 *   engwebp     — World English Bible. Marks His words (`\wj`) *and* prints quotation marks, so each
 *                 verse reduces to "which of these quotations are His" — the pattern every quoted
 *                 translation is coloured from (see src/utils/red-letter.ts).
 *   eng-kjv2006 — King James Version with `\wj`. KJV prints no quotation marks, so its marks are
 *                 aligned word by word onto our KJV text and stored as character ranges.
 * The Douay-Rheims (engDRA) carries no `\wj`, so DRB gets ranges only for verses WEB has wholly
 * in His voice.
 *
 * Writes: src/data/red-letter/patterns.json, src/data/red-letter/ranges.json
 *         (overrides.json is hand-kept; created empty if missing).
 * Prints: per translation, the verses where its quotations don't line up with WEB's and nothing
 *         gets coloured. The full list goes to server/data/bibles/raw/red-letter-report.txt —
 *         those are the candidates for overrides.json.
 */

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { USFM_BOOKS } from '../versification/remap.mjs';
import {
  CARRIED,
  IS_HIS,
  quoteSegments,
  redLetterRanges,
  verseKey,
  type RedLetterData,
} from '../../../src/utils/red-letter';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../../..');
const OUT_DIR = join(ROOT, 'src/data/red-letter');

const SOURCES = {
  WEB: 'https://ebible.org/Scriptures/engwebp_usfm.zip',
  KJV: 'https://ebible.org/Scriptures/eng-kjv2006_usfm.zip',
};

/** Translations coloured by the WEB pattern; KJV and DRB get ranges instead. */
const QUOTED = ['NET', 'ESV', 'NIV', 'NLT', 'CSB', 'NASB', 'MSG', 'BSB', 'NKJV', 'AMP', 'NABRE', 'RSV2CE', 'NRSVCE'];

interface CorpusVerse { book: string; chapter: number; verse: number; text: string }
interface MarkedVerse { book: string; chapter: number; verse: number; text: string; wj: boolean[] }

const readCorpus = (id: string): CorpusVerse[] =>
  JSON.parse(readFileSync(join(__dirname, `${id}.json`), 'utf-8'));

/** USFM code → the book name our corpus uses, by canonical order. */
function bookNames(): Map<string, string> {
  const names = [...new Set(readCorpus('KJV').map((v) => v.book))];
  return new Map(USFM_BOOKS.map((code: string, i: number) => [code, names[i]]));
}

const WJ_ON = '\u0001';
const WJ_OFF = '\u0002';

/**
 * Verse text with a per-character "is His" flag. Same cleanup as `_import_usfm.mjs`'s
 * cleanUsfmText, except `\wj … \wj*` becomes the flag instead of disappearing.
 */
function markVerse(raw: string): { text: string; wj: boolean[] } {
  const s = raw
    .replace(/\\f .*?\\f\*/g, '')
    .replace(/\\x .*?\\x\*/g, '')
    .replace(/\\wj\*/g, WJ_OFF)
    .replace(/\\wj /g, WJ_ON)
    .replace(/\\\+?w ([^|\\]*?)(?:\|[^\\]*)?\\\+?w\*/g, '$1')
    .replace(/\\\+?[a-z]+\d*\*?/g, '');
  const chars: string[] = [];
  const wj: boolean[] = [];
  let on = false;
  for (const ch of s) {
    if (ch === WJ_ON) on = true;
    else if (ch === WJ_OFF) on = false;
    else if (/\s/.test(ch)) {
      // Collapse runs of whitespace; a space takes the flag of what it sits inside.
      if (chars.length > 0 && chars[chars.length - 1] !== ' ') {
        chars.push(' ');
        wj.push(on);
      }
    } else {
      // No space before closing punctuation.
      if (/[,.;:!?]/.test(ch) && chars[chars.length - 1] === ' ') {
        chars.pop();
        wj.pop();
      }
      chars.push(ch);
      wj.push(on);
    }
  }
  while (chars[chars.length - 1] === ' ') {
    chars.pop();
    wj.pop();
  }
  return { text: chars.join(''), wj };
}

function parseMarkedUsfm(usfm: string, names: Map<string, string>): MarkedVerse[] {
  const code = /\\id (\S+)/.exec(usfm)?.[1] ?? '';
  const book = names.get(code);
  if (!book) return [];
  const out: MarkedVerse[] = [];
  let chapter = 0;
  let current: { verse: number; parts: string[] } | null = null;
  const flush = () => {
    if (current) {
      const { text, wj } = markVerse(current.parts.join(' '));
      if (text) out.push({ book, chapter, verse: current.verse, text, wj });
    }
    current = null;
  };
  for (const rawLine of usfm.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || /^\\(id|ide|h|toc\d|mt\d?|ms\d?|s\d?|cl|d|r|rem)\b/.test(line)) continue;
    const c = /^\\c (\d+)/.exec(line);
    if (c) {
      flush();
      chapter = Number(c[1]);
      continue;
    }
    for (const piece of line.split(/(?=\\v \d+ )/)) {
      const v = /^\\v (\d+) (.*)$/.exec(piece);
      if (v) {
        flush();
        current = { verse: Number(v[1]), parts: [v[2]] };
      } else if (current) {
        current.parts.push(piece);
      }
    }
  }
  flush();
  return out;
}

function download(url: string, work: string, name: string): MarkedVerse[] {
  const zip = join(work, `${name}.zip`);
  const dir = join(work, name);
  console.log(`Downloading ${url}...`);
  execFileSync('curl', ['-sSfL', '-o', zip, url]);
  execFileSync('unzip', ['-q', zip, '-d', dir]);
  const names = bookNames();
  return readdirSync(dir)
    .filter((f) => f.endsWith('.usfm'))
    .flatMap((f) => parseMarkedUsfm(readFileSync(join(dir, f), 'utf-8'), names));
}

const isLetter = (ch: string) => /\p{L}/u.test(ch);
const share = (v: MarkedVerse, from: number, to: number) => {
  let letters = 0;
  let his = 0;
  for (let i = from; i < to; i++) {
    if (!isLetter(v.text[i])) continue;
    letters++;
    if (v.wj[i]) his++;
  }
  return letters === 0 ? 0 : his / letters;
};

/** Like `share`, over an interrupted quotation's parts only — the speech tag between is narration. */
function shareOfParts(v: MarkedVerse, parts: [number, number][]) {
  let letters = 0;
  let his = 0;
  for (const [from, to] of parts) {
    for (let i = from; i < to; i++) {
      if (!isLetter(v.text[i])) continue;
      letters++;
      if (v.wj[i]) his++;
    }
  }
  return letters === 0 ? 0 : his / letters;
}

function groupByChapter<T extends { book: string; chapter: number }>(verses: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const v of verses) {
    const k = `${v.book} ${v.chapter}`;
    if (!out.has(k)) out.set(k, []);
    out.get(k)!.push(v);
  }
  return out;
}

/** WEB → `{ "John 3:3": [1], "John 4:17": [0, 1] }`. */
function buildPatterns(web: MarkedVerse[], report: string[]) {
  const patterns: Record<string, number[]> = {};
  const wholly = new Set<string>();
  for (const verses of groupByChapter(web).values()) {
    const segs = quoteSegments(verses.map((v) => ({ number: v.verse, text: v.text })), 'curly');
    for (const v of verses) {
      if (!v.wj.some(Boolean)) continue;
      const key = verseKey(v.book, v.chapter, v.verse);
      const mine = segs.get(v.verse) ?? [];
      // A quotation that is only partly His (Paul retelling the Damascus road) can't be coloured
      // whole either way, so it stays black: below 0.85 isn't His.
      const mask = mine.map(
        (s) => (shareOfParts(v, s.parts) >= 0.85 ? IS_HIS : 0) | (s.carried ? CARRIED : 0),
      );
      if (mask.some((m) => m & IS_HIS)) patterns[key] = mask;
      if (share(v, 0, v.text.length) >= 0.95) wholly.add(key);
      // His words outside any quotation would be lost by the pattern; say so.
      let outside = 0;
      for (let i = 0; i < v.text.length; i++) {
        if (v.wj[i] && isLetter(v.text[i]) && !mine.some((s) => i >= s.start && i < s.end)) outside++;
      }
      if (outside > 3) report.push(`WEB ${key}: ${outside} letters of His words outside quotation marks`);
    }
  }
  return { patterns, wholly };
}

/** Word tokens with their offsets, compared case- and punctuation-insensitively. */
function words(text: string) {
  const out: { w: string; start: number; end: number }[] = [];
  for (const m of text.matchAll(/[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu)) {
    out.push({ w: m[0].toLowerCase().replace(/['’]/g, ''), start: m.index!, end: m.index! + m[0].length });
  }
  return out;
}

/** Longest-common-subsequence pairs between two word lists (verses are short). */
function lcsPairs(a: string[], b: string[]): [number, number][] {
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const pairs: [number, number][] = [];
  for (let i = 0, j = 0; i < a.length && j < b.length; ) {
    if (a[i] === b[j]) pairs.push([i++, j++]);
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return pairs;
}

/** KJV source `\wj` → character ranges in our KJV text. */
function buildKjvRanges(source: MarkedVerse[], ours: CorpusVerse[], report: string[]) {
  const byKey = new Map(ours.map((v) => [verseKey(v.book, v.chapter, v.verse), v.text]));
  const out: Record<string, [number, number][]> = {};
  let dropped = 0;
  for (const v of source) {
    if (!v.wj.some(Boolean)) continue;
    const key = verseKey(v.book, v.chapter, v.verse);
    const text = byKey.get(key);
    if (!text) continue;
    const src = words(v.text).map((t) => ({ ...t, his: share(v, t.start, t.end) >= 0.5 }));
    const dst = words(text);
    const pairs = lcsPairs(src.map((t) => t.w), dst.map((t) => t.w));
    if (pairs.length < Math.max(src.length, dst.length) * 0.85) {
      dropped++;
      report.push(`KJV ${key}: alignment too weak (${pairs.length}/${dst.length} words), left black`);
      continue;
    }
    const his: (boolean | null)[] = dst.map(() => null);
    for (const [i, j] of pairs) his[j] = src[i].his;
    // An unmatched word is His when both neighbours are.
    for (let j = 0; j < his.length; j++) {
      if (his[j] !== null) continue;
      const prev = his.slice(0, j).reverse().find((h) => h !== null);
      const next = his.slice(j + 1).find((h) => h !== null);
      his[j] = prev === true && next === true;
    }
    const ranges: [number, number][] = [];
    for (let j = 0; j < dst.length; j++) {
      if (!his[j]) continue;
      // Running words stay one range, punctuation between them included.
      const last = ranges[ranges.length - 1];
      if (last && j > 0 && his[j - 1]) last[1] = dst[j].end;
      else ranges.push([dst[j].start, dst[j].end]);
    }
    // Close each range over the punctuation that ends the sentence it spoke.
    for (const r of ranges) {
      while (r[1] < text.length && /[.,;:!?’)]/.test(text[r[1]])) r[1]++;
    }
    if (ranges.length > 0) out[key] = ranges;
  }
  console.log(`KJV: ${Object.keys(out).length} verses with ranges, ${dropped} dropped`);
  return out;
}

function buildDrbRanges(wholly: Set<string>) {
  const out: Record<string, [number, number][]> = {};
  for (const v of readCorpus('DRB')) {
    const key = verseKey(v.book, v.chapter, v.verse);
    if (wholly.has(key)) out[key] = [[0, v.text.length]];
  }
  console.log(`DRB: ${Object.keys(out).length} verses wholly in His voice`);
  return out;
}

/** Share of a text's letters inside the ranges. */
function redShare(text: string, ranges: readonly (readonly [number, number])[]) {
  let letters = 0;
  let red = 0;
  for (let i = 0; i < text.length; i++) {
    if (!isLetter(text[i])) continue;
    letters++;
    if (ranges.some(([s, e]) => i >= s && i < e)) red++;
  }
  return letters === 0 ? 0 : red / letters;
}

/**
 * Every quoted translation run through the reader's own code. `black` is a verse of His that got
 * no colour; `off` is a coloured verse whose red share is far from KJV's word-level marking —
 * the signature of a misread quote mark colouring narration, or the wrong speaker's quotation.
 */
function reportQuoted(data: RedLetterData, report: string[]) {
  const patternKeys = Object.keys(data.patterns);
  const kjvText = new Map(readCorpus('KJV').map((v) => [verseKey(v.book, v.chapter, v.verse), v.text]));
  console.log(`\n${patternKeys.length} verses carry His words (WEB).`);
  console.log('Translation  coloured  black  off');
  for (const id of QUOTED) {
    if (!existsSync(join(__dirname, `${id}.json`))) continue;
    let coloured = 0;
    let black = 0;
    let off = 0;
    for (const verses of groupByChapter(readCorpus(id)).values()) {
      const { book, chapter } = verses[0];
      const ranges = redLetterRanges(
        book,
        chapter,
        id,
        verses.map((v) => ({ number: v.verse, text: v.text })),
        data,
      );
      for (const v of verses) {
        const key = verseKey(book, chapter, v.verse);
        if (!data.patterns[key]) continue;
        const mine = ranges.get(v.verse);
        if (mine) {
          coloured++;
          const kt = kjvText.get(key);
          const kr = data.ranges.KJV?.[key];
          if (kt && kr && Math.abs(redShare(v.text, mine) - redShare(kt, kr)) > 0.45) {
            off++;
            report.push(`${id}|${key}  OFF  ${v.text}`);
          }
        } else {
          black++;
          report.push(`${id}|${key}  WEB ${JSON.stringify(data.patterns[key])}  ${v.text}`);
        }
      }
    }
    console.log(
      `${id.padEnd(12)} ${String(coloured).padStart(8)}  ${String(black).padStart(5)}  ${String(off).padStart(3)}`,
    );
  }
}

function main() {
  const work = mkdtempSync(join(tmpdir(), 'harvous-red-letter-'));
  try {
    const report: string[] = [];
    const web = download(SOURCES.WEB, work, 'web');
    const kjvSource = download(SOURCES.KJV, work, 'kjv');

    const { patterns, wholly } = buildPatterns(web, report);
    const ranges = {
      KJV: buildKjvRanges(kjvSource, readCorpus('KJV'), report),
      DRB: buildDrbRanges(wholly),
    };

    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(join(OUT_DIR, 'patterns.json'), JSON.stringify(patterns));
    writeFileSync(join(OUT_DIR, 'ranges.json'), JSON.stringify(ranges));
    const overridesPath = join(OUT_DIR, 'overrides.json');
    if (!existsSync(overridesPath)) writeFileSync(overridesPath, '{}\n');
    const overrides = JSON.parse(readFileSync(overridesPath, 'utf-8'));

    reportQuoted({ patterns, ranges, overrides }, report);

    mkdirSync(join(__dirname, 'raw'), { recursive: true });
    const reportPath = join(__dirname, 'raw', 'red-letter-report.txt');
    writeFileSync(reportPath, report.join('\n') + '\n');
    console.log(`\n${report.length} lines → ${reportPath}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

main();
