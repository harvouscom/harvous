/**
 * Write the text fixes for the RSV-2CE and NRSV-CE: server/data/bibles/fixes/<ID>.json.
 *
 * Usage:
 *   node server/data/bibles/_catholic_edition_fixes.mjs RSV2CE
 *   node server/data/bibles/_catholic_edition_fixes.mjs NRSVCE
 *
 * Reads the raw downloads (raw/<ID>.json), the other raw download, raw/RSV1952.json (fetched from
 * Bolls on first run; not a Harvous translation, only a reference), NABRE.json and ESV.json.
 * Then re-run `_remap.mjs <ID>`, which applies the fixes before renumbering.
 *
 * Bolls serves both editions with things in the verse text that aren't Scripture, and with some
 * verses run together:
 *
 * - Section headings, fused into the start of the verse they head ("Trust in God under Adversity
 *   A Psalm of David…"). The RSV-2CE has them throughout; the NRSV-CE only in Esther, Mark 16:8
 *   and the deuterocanon. In the 66 books a heading is found by comparing the verse with the 1952
 *   RSV, which Bolls serves without them: whatever precedes the RSV's opening words is the
 *   heading. In the deuterocanon (no RSV text) the two editions are compared with each other and
 *   a title-case run at the start of a verse is a heading. Every one found is written to the
 *   fixes file, and `HEADING_OVERRIDES` records the calls made by reading the list.
 * - The Greek additions to Esther, which both editions print inside the Hebrew chapters as
 *   lettered verses (1:1a–r and so on) and Bolls flattens into one verse. They are split back out
 *   to the addresses Harvous gives them (Esther 10:4–16:24, as the Douay-Rheims prints them) by
 *   aligning the run of text with the NABRE's verses at those addresses; see `segment`.
 * - The RSV-2CE's Daniel 3:24–90 (the Prayer of Azariah and the Song of the Three), flattened into
 *   3:23 the same way and split against the NRSV-CE's verses, which Bolls numbers.
 * - A few verses Bolls runs together with an inline verse number ("…ever.” 22 And when…").
 * - The Prologue to Sirach, which both editions put in Sirach 1:1. Harvous has no address for it
 *   (neither the NABRE nor the Douay-Rheims source has it), so it is dropped.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { USFM_BOOKS, DEUTERO_BOOKS, stems } from '../versification/remap.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const raw = (id) => JSON.parse(readFileSync(join(__dirname, 'raw', `${id}.json`), 'utf-8'));
const key = (book, chapter, verse) => `${book} ${chapter}:${verse}`;

/** Harvous corpus (book names) re-keyed by USFM code. */
function corpus(id) {
  const names = JSON.parse(readFileSync(join(__dirname, '../../../src/data/bible-chapters.json'), 'utf-8'));
  const deutero = JSON.parse(readFileSync(join(__dirname, '../../../src/data/deuterocanon-chapters.json'), 'utf-8'));
  const codes = new Map();
  for (const r of [...names, ...deutero]) codes.set(r.book, [...USFM_BOOKS, ...DEUTERO_BOOKS][r.bookOrder - 1]);
  const out = new Map();
  for (const v of JSON.parse(readFileSync(join(__dirname, `${id}.json`), 'utf-8'))) {
    out.set(key(codes.get(v.book), v.chapter, v.verse), v.text);
  }
  return out;
}

const byKey = (verses) => new Map(verses.map((v) => [key(v.book, v.chapter, v.verse), v.text]));

async function rsv1952() {
  const path = join(__dirname, 'raw', 'RSV1952.json');
  if (existsSync(path)) return raw('RSV1952');
  mkdirSync(join(__dirname, 'raw'), { recursive: true });
  const books = await (await fetch('https://bolls.life/get-books/RSV/')).json();
  const all = [];
  for (const b of books) {
    for (let chapter = 1; chapter <= b.chapters; chapter++) {
      process.stdout.write(`\rRSV 1952 ${USFM_BOOKS[b.bookid - 1]} ${chapter}   `);
      const verses = await (await fetch(`https://bolls.life/get-text/RSV/${b.bookid}/${chapter}/`)).json();
      for (const v of verses) all.push({ book: USFM_BOOKS[b.bookid - 1], chapter, verse: v.verse, text: v.text });
    }
  }
  writeFileSync(path, JSON.stringify(all));
  return all;
}

/** Words compared as lower-case letters only, accents and pronunciation hyphens ignored. */
const norm = (w) => w.replace(/[′-]/g, '').toLowerCase().replace(/[^a-z]/g, '');
const words = (text) => text.split(/\s+/).filter(Boolean);

const FUNCTION_WORDS = new Set(
  ('a an the of and in to for against under with by from on at is are as into over his her their its be not who ' +
    'but or nor without after about concerning through before upon among between than that what your our my yet also')
    .split(' '),
);
/**
 * The headings in `text`, given a reference verse (same address, another text) that has none:
 * runs of words the reference doesn't have (a word-level diff) that read as a heading. A run
 * qualifies when it starts the verse or follows the end of a clause, is followed by more text,
 * has no full stop, and is mostly capitalised ("Saul Defeats the Amalekites but Spares Their
 * King", "Job Replies: My Complaint Is Just", "Who Is the Greatest?"). The RSV-2CE's own
 * revisions of the 1952 wording are lower-case and inside sentences, so they don't qualify.
 */
function headingsByDiff(text, ref) {
  const w = words(text);
  const a = w.map(norm);
  const b = words(ref).map(norm).filter(Boolean);
  const n = a.length;
  const m = b.length;
  const lcs = Array.from({ length: n + 1 }, () => new Int16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] && a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const inserted = new Array(n).fill(false);
  // Walk the diff taking a source word as inserted whenever that costs no match, so an inserted
  // run is as early as it can be: "The Birth of Isaac The Lord visited" inserts the first "The".
  for (let i = 0, j = 0; i < n; ) {
    if (lcs[i + 1][j] === lcs[i][j]) inserted[i++] = true;
    else if (j < m && a[i] && a[i] === b[j]) {
      i++;
      j++;
    } else if (j < m && lcs[i][j + 1] >= lcs[i + 1][j]) j++;
    else inserted[i++] = true;
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    if (!inserted[i]) continue;
    let j = i;
    while (j < n && inserted[j]) j++;
    const run = w.slice(i, j);
    i = j;
    if (j >= n || !headingShaped(run)) continue;
    const before = w[i - run.length - 1];
    if (before && !/[.!?:;”’"]$/.test(before)) continue;
    if (!/^[“‘"(]?[A-Z0-9]/.test(w[j])) continue;
    out.push(run.join(' '));
  }
  return out;
}

/** Words a verse opens or a clause runs on with, never the first or last word of a heading. */
const CONJUNCTIONS = new Set('and but so for then now when while if therefore thus yet or nor here'.split(' '));

/** A run of words that reads as a heading: capitalised content words, no full stop. */
function headingShaped(run) {
  if (!run.length || run.length > 16 || !/^[A-Z]/.test(run[0])) return false;
  if (CONJUNCTIONS.has(norm(run[0])) || CONJUNCTIONS.has(norm(run.at(-1)))) return false;
  if (run.some((x, k) => /[.;]$/.test(x) || (k < run.length - 1 && /[!?]$/.test(x)))) return false;
  if (/[,:]$/.test(run.at(-1))) return false;
  const content = run.filter((x) => !FUNCTION_WORDS.has(x));
  return content.length > 0 && content.filter((x) => /^[A-Z]/.test(x)).length >= content.length * 0.6 &&
    !FUNCTION_WORDS.has(run.at(-1));
}

/** Capitalised words that open a sentence rather than continue a name ("…the Dragon There was"). */
const SENTENCE_OPENERS = new Set(
  ('the a an he she it they we i you there this these those when then now and but for so after before in on ' +
    'at as if while many all o my his her their our your what who how why let thus therefore once one two ' +
    'very no not every some because since though although by from with to of here do much').split(' '),
);

/**
 * A heading in front of `text` where there's no 1952 RSV to diff against (the deuterocanon, and
 * Daniel 13–14). The other edition translates the same verse, so its opening words are the
 * test: the heading is the title-case run whose removal makes this verse open most like the
 * other's ("Susanna’s Beauty Attracts Two Elders | There was a man living in Babylon" against
 * "There was a man living in Babylon"). Where the two translations word the opening too
 * differently to tell (or the heading repeats the verse's own words: "The Idler | The indolent"),
 * a run whose every content word is capitalised counts when the word after it plainly opens a
 * sentence ("Daniel Kills the Dragon | There was also a great dragon"),
 * not when it carries on a name ("Bless the Lord | God on every occasion").
 */
function headingByShape(text, other = '') {
  const w = words(text);
  const ow = words(other).map(norm);
  const o = new Set(ow.slice(0, 6));
  // Shared words near the start, and twice over the words both open with in order.
  const opening = (k) => {
    let prefix = 0;
    while (prefix < 6 && norm(w[k + prefix] ?? '') === ow[prefix]) prefix++;
    return w.slice(k, k + 6).map(norm).filter((x) => o.has(x)).length + 2 * prefix;
  };
  const strict = (k) =>
    w.slice(0, k).every((x) => FUNCTION_WORDS.has(x) || /^[A-Z]/.test(x)) &&
    (SENTENCE_OPENERS.has(norm(w[k])) || /^[“‘"]/.test(w[k]) || norm(w[k]) === norm(w[k - 1]));
  const atStart = opening(0);
  let best = 0;
  let bestScore = -Infinity;
  for (let k = 1; k <= 12 && k < w.length - 1; k++) {
    if (!headingShaped(w.slice(0, k)) || !/^[“‘"(]*[A-Z]/.test(w[k])) continue;
    const score = opening(k);
    const counts = (other && score >= atStart + 2) || strict(k);
    if (counts && score >= bestScore) {
      best = k;
      bestScore = score;
    }
  }
  return best ? w.slice(0, best).join(' ') : null;
}

/**
 * Calls made by reading the generated list (`node … <ID> --list`). `false` means the detected run
 * is Scripture, not a heading; a string replaces the detected heading.
 */
const HEADING_OVERRIDES = {
  RSV2CE: {
    // The RSV-2CE starts Haggai 2 a clause earlier than the 1952 RSV, so the diff sees the clause too.
    'HAG 2:1': 'The Future Glory of the Temple',
    // Headings followed by a word that could carry on a name, where the NRSV-CE words the
    // opening too differently to show the cut.
    'TOB 12:1': 'Raph′ael’s Wages',
    'SIR 9:10': 'Choice of Friends',
    'SIR 33:24': 'The Treatment of Slaves',
    'SIR 24:5': false, // "Alone I have made the circuit of the vault of heaven"
    // "Simon Peter": the 1952 RSV has "Simeon", so the diff takes the name for part of the heading.
    '2PE 1:1': 'Salutation',
  },
  NRSVCE: {},
};

/** Headings inside the flattened runs, removed before splitting. */
const BLOCK_HEADINGS = {
  RSV2CE: [
    'Mordecai’s Dream', 'A Plot against the King', 'King Ahasu-erus Deposes Queen Vashti', 'The King’s Letter',
    'Mordecai’s Prayer', 'Esther’s Prayer', 'Esther Is Received by the King', 'The Decree of Ahasu-erus', 'Postscript',
    'The Prayer of Azariah in the Furnace', 'The Song of the Three Jews',
  ],
  NRSVCE: [
    ...'ABCDEF'.split('').flatMap((l) => [`END OF ADDITION ${l}`, `ADDITION ${l}`]),
    'Mordecai’s Dream', 'A Plot against the King', 'King Ahasuerus Deposes Queen Vashti', 'The King’s Letter',
    'Mordecai’s Prayer', 'Esther’s Prayer', 'Esther Is Received by the King', 'The Decree of Ahasuerus', 'Postscript',
    'Esther’s Banquet', 'THE SHORTER ENDING OF MARK',
  ],
};

const escapeRegExp = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const range = (book, chapter, from, to) => Array.from({ length: to - from + 1 }, (_, i) => key(book, chapter, from + i));

/** Flattened verses → the addresses their text belongs to, in order. */
const SPLITS = {
  RSV2CE: {
    'EST 1:1': [...range('EST', 11, 2, 12), ...range('EST', 12, 1, 6), 'EST 1:1'],
    'EST 3:13': ['EST 3:13', ...range('EST', 13, 1, 7)],
    'EST 4:17': ['EST 4:17', ...range('EST', 13, 8, 18), ...range('EST', 14, 1, 19)],
    'EST 5:2': ['EST 5:2', ...range('EST', 15, 4, 19)],
    'EST 8:12': ['EST 8:12', ...range('EST', 16, 1, 24)],
    'EST 8:13': range('EST', 8, 13, 17),
    'EST 10:13': ['EST 10:13', 'EST 11:1'],
    // The RSV prints five of the Song's "Bless the Lord" lines in another order from the Greek and
    // the Vulgate (dews, nights, light, ice, frosts; the Vulgate has dews, ice, frosts, nights,
    // light). Harvous keeps the Vulgate's addresses, so each goes to the verse it translates.
    'DAN 3:23': ['DAN 3:23', ...range('S3Y', 1, 1, 45), 'S3Y 1:48', 'S3Y 1:49', 'S3Y 1:46', 'S3Y 1:47', ...range('S3Y', 1, 50, 67)],
    '2CH 20:21': ['2CH 20:21', '2CH 20:22'],
  },
  NRSVCE: {
    'EST 1:1': [...range('EST', 11, 2, 12), ...range('EST', 12, 1, 6), 'EST 1:1'],
    'EST 3:13': ['EST 3:13', ...range('EST', 13, 1, 7)],
    // The NRSV-CE prints Additions C and D in place of the Hebrew 5:1–2, which it doesn't repeat.
    'EST 5:1': [...range('EST', 13, 8, 18), ...range('EST', 14, 1, 19), ...range('EST', 15, 4, 19)],
    'EST 8:12': ['EST 8:12', ...range('EST', 16, 1, 24)],
    'EST 10:13': ['EST 10:13', 'EST 11:1'],
  },
};

/**
 * Verse starts the alignment can't see, where the editions cut a sentence somewhere the clause
 * marks don't decide. Read off the printed RSV-CE and NRSV-CE (as Bible Gateway numbers them),
 * which `segment` was checked against verse by verse. Each phrase begins a verse.
 */
const FORCED_CUTS = {
  RSV2CE: {
    'EST 1:1': ['Behold, noise and confusion'],
    'EST 3:13': ['so that those who have long'],
    'EST 4:17': ['“O Lord, Lord, King who rulest', 'to abolish what'],
    'EST 5:2': ['Lifting his face', '“What is it', 'Then he raised the golden', 'and he embraced her', 'And she said to him, “I'],
    'EST 8:12': ['so far enjoyed', 'and are sons of the Most'],
  },
  NRSVCE: {
    'EST 1:1': ['Noises and confusion'],
    'EST 3:13': ['pointed out to us', 'so that those who have long'],
    'EST 5:1': ['because we glorified', 'to abolish what', 'Lifting his face', '“What is it', 'Then he raised the golden', 'he embraced her', 'She said to him, “I'],
    'EST 8:12': ['enjoyed so fully', 'and are children of the living'],
  },
};

/** Phrases a verse never starts with, though a clause mark comes before them. */
const NO_CUT_BEFORE = {
  RSV2CE: { 'EST 5:2': ['for our law', 'Come near'] },
  NRSVCE: { 'EST 5:1': ['for our law', 'Come near'] },
};

/** Text before this marker in Sirach 1:1 is the Prologue. */
const SIRACH_PROLOGUE_END = 'In Praise of Wisdom';

/** What a cut costs, by the mark it follows: verse divisions mostly fall at a sentence's end. */
const CUT_COST = { sentence: 0, clause: 0.05, comma: 0.2, number: 0, heading: 0 };

/**
 * Split `text` into one piece per reference verse, in order. The text is cut into clauses (after
 * . ! ? ; : , and closing quotes, at an inline verse number, and at a removed heading, written
 * `¶`), and a dynamic programme picks the cuts that make each piece's words most like its
 * reference verse's (Dice overlap of content-word stems), less a cost for cutting mid-sentence.
 * A heading is always a cut. The references are other translations, so this finds the verse
 * divisions those translations share; it was checked by reading every split (`--list`).
 */
export function segment(text, refs) {
  const units = [];
  const kinds = []; // kinds[i]: the mark between units[i - 1] and units[i]
  let kind = 'heading';
  for (const part of text.split(/(¶|(?<=[.,;:!?”’"\]])\s+|\s+(?=\d{1,3}\s))/)) {
    if (part === undefined) continue;
    if (part === '¶') {
      kind = 'heading';
      continue;
    }
    if (!part.trim()) continue;
    const u = part.trim();
    units.push(u.replace(/^\d{1,3}\s+/, () => ((kind = kind === 'heading' ? kind : 'number'), '')));
    kinds.push(kind);
    kind = /[.!?][”’"\]]*$/.test(u) ? 'sentence' : /[;:][”’"]*$/.test(u) ? 'clause' : 'comma';
  }
  const n = units.length;
  const k = refs.length;
  const refStems = refs.map(stems);
  const MAX = 40;
  const nextHeading = new Array(n + 1).fill(n);
  for (let i = n - 1; i >= 0; i--) nextHeading[i] = i > 0 && kinds[i] === 'heading' ? i : nextHeading[i + 1];
  const cache = new Map();
  const piece = (a, b) => {
    const id = a * 10000 + b;
    if (!cache.has(id)) cache.set(id, stems(units.slice(a, b).join(' ')));
    return cache.get(id);
  };
  const dice = (s, r) => {
    if (!s.size || !r.size) return 0;
    let shared = 0;
    for (const x of s) if (r.has(x)) shared++;
    return (2 * shared) / (s.size + r.size);
  };
  // best[i][j]: first i refs over the first j units.
  const best = Array.from({ length: k + 1 }, () => new Array(n + 1).fill(-Infinity));
  const from = Array.from({ length: k + 1 }, () => new Array(n + 1).fill(-1));
  best[0][0] = 0;
  for (let i = 1; i <= k; i++) {
    for (let j = i; j <= n - (k - i); j++) {
      for (let a = Math.max(i - 1, j - MAX); a < j; a++) {
        if (best[i - 1][a] === -Infinity || nextHeading[a + 1] < j) continue; // a piece never spans a heading
        const cut = a > 0 ? CUT_COST[kinds[a]] : 0;
        const s = best[i - 1][a] - cut + dice(piece(a, j), refStems[i - 1]);
        if (s > best[i][j]) {
          best[i][j] = s;
          from[i][j] = a;
        }
      }
    }
  }
  if (best[k][n] === -Infinity) throw new Error(`Cannot split ${n} clauses into ${k} verses`);
  const out = new Array(k);
  for (let i = k, j = n; i > 0; i--) {
    const a = from[i][j];
    out[i - 1] = units.slice(a, j).join(' ');
    j = a;
  }
  return out;
}

const stripBlockHeadings = (text, headings) => {
  let out = ` ${text} `;
  // Longest first, so "END OF ADDITION A" goes before "ADDITION A".
  for (const h of [...headings].sort((a, b) => b.length - a.length)) out = out.split(` ${h} `).join(' ¶ ');
  // The NRSV-CE's chapter numbers for the additions ("…the King 12 Now Mordecai…").
  return out
    .replace(/(¶\s+)+/g, '¶ ')
    .replace(/¶\s+1[1-6]\s(?=[A-Z“])/g, '¶ ')
    .replace(/^\s*¶\s*|\s*¶\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

async function main() {
  const id = (process.argv[2] || '').toUpperCase();
  const list = process.argv.includes('--list');
  if (!SPLITS[id]) {
    console.error('Usage: node _catholic_edition_fixes.mjs <RSV2CE|NRSVCE> [--list]');
    process.exit(1);
  }
  const source = raw(id);
  const other = byKey(raw(id === 'RSV2CE' ? 'NRSVCE' : 'RSV2CE'));
  const rsv = byKey(await rsv1952());
  const nabre = corpus('NABRE');
  const esv = corpus('ESV');
  const nrsvRaw = byKey(raw('NRSVCE'));
  const refText = (k) => {
    if (k.startsWith('S3Y')) return nrsvRaw.get(`DAN 3:${Number(k.split(':')[1]) + 23}`);
    if (/^EST 1[1-6]:|^EST 10:([4-9]|1\d)/.test(k)) return nabre.get(k);
    return esv.get(k) ?? nabre.get(k);
  };

  const splits = {};
  for (const [at, targets] of Object.entries(SPLITS[id])) {
    let text = stripBlockHeadings(source.find((v) => key(v.book, v.chapter, v.verse) === at).text, BLOCK_HEADINGS[id]);
    for (const phrase of FORCED_CUTS[id][at] ?? []) {
      if (text.split(` ${phrase}`).length !== 2) throw new Error(`${id} ${at}: forced cut "${phrase}" must occur once`);
      text = text.replace(` ${phrase}`, ` ¶ ${phrase}`);
    }
    // A word joiner in place of the space, so the clause split can't fall there.
    for (const phrase of NO_CUT_BEFORE[id][at] ?? []) text = text.replace(` ${phrase}`, `\u2060${phrase}`);
    const refs = targets.map((t) => refText(t) ?? '');
    const pieces = segment(text, refs).map((p) => p.replace(/\u2060/g, ' '));
    splits[at] = targets.map((t, i) => {
      const [, book, chapter, verse] = /^(\S+) (\d+):(\d+)$/.exec(t);
      return { book, chapter: Number(chapter), verse: Number(verse), text: pieces[i] };
    });
    if (list) {
      console.log(`\n== ${at}`);
      splits[at].forEach((p, i) =>
        console.log(`${targets[i].padEnd(10)} ${p.text.slice(0, 70).padEnd(70)} | ${(refs[i] ?? '').slice(0, 50)}`),
      );
    }
  }

  const headings = {};
  const overrides = HEADING_OVERRIDES[id];
  // The NRSV-CE's headings are the RSV-2CE's, where they fall inside a verse (the two editions
  // share them; at the start of a verse Bolls leaves the NRSV-CE's out). So its candidates are the
  // RSV-2CE headings of the same verse and its neighbours, found after the end of a sentence.
  const rsv2ceHeadings =
    id === 'NRSVCE' ? JSON.parse(readFileSync(join(__dirname, 'fixes', 'RSV2CE.json'), 'utf-8')).headings : null;
  for (const v of source) {
    const k = key(v.book, v.chapter, v.verse);
    if (splits[k]) continue;
    let heading;
    if (k === 'SIR 1:1') heading = v.text.slice(0, v.text.indexOf(SIRACH_PROLOGUE_END) + SIRACH_PROLOGUE_END.length);
    else if (k in overrides) heading = overrides[k] || null;
    else if (rsv2ceHeadings) {
      const near = [-1, 0, 1].flatMap((d) => rsv2ceHeadings[key(v.book, v.chapter, v.verse + d)] ?? []);
      heading = [
        ...BLOCK_HEADINGS.NRSVCE.filter((h) => v.text.startsWith(`${h} `) || v.text.includes(` ${h} `)),
        ...near.filter((h) => words(h).length > 1 && new RegExp(`[.!?:;”’"] ${escapeRegExp(h)} [“‘"A-Z]`).test(v.text)),
      ];
    } else if (USFM_BOOKS.includes(v.book) && !(v.book === 'DAN' && v.chapter > 12) && !(v.book === 'EST' && v.chapter > 10)) {
      heading = rsv.has(k) ? headingsByDiff(v.text, rsv.get(k)) : headingByShape(v.text, other.get(k));
    } else {
      heading = headingByShape(v.text, other.get(k));
    }
    if (typeof heading === 'string') heading = [heading];
    if (heading?.length) headings[k] = [...new Set(heading)];
  }
  if (list) for (const [k, h] of Object.entries(headings)) if (k !== 'SIR 1:1') console.log(`H ${k.padEnd(12)} ${h.join(' ¶ ')}`);

  mkdirSync(join(__dirname, 'fixes'), { recursive: true });
  const out = join(__dirname, 'fixes', `${id}.json`);
  writeFileSync(out, `${JSON.stringify({ headings, splits }, null, 2)}\n`);
  console.log(`\n${id}: ${Object.keys(headings).length} headings, ${Object.keys(splits).length} split verses → ${out}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
