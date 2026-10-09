/**
 * Which passage — and which translation — is this photographed page?
 *
 * A printed Bible page holds verse text, not references, so the reference detector finds
 * nothing on it. What we do have is every verse of every translation the reader can open
 * (`BibleVerses`), so the page can be recognised the way a person would: find a few phrases
 * from it in the text, then compare the page word-for-word against the chapter they landed in.
 *
 * Two stages, because they answer different questions:
 *
 *   1. **Probe** — a handful of short, clean phrases from the page go to full-text search.
 *      That only has to find the right chapter, and several phrases mean one misread word
 *      cannot sink it.
 *   2. **Score** — the whole page aligned word by word against each translation's text of
 *      that chapter (see `scoreChapter`). Translations often agree word for word (KJV/NKJV, ESV/NASB/CSB), so this,
 *      not the probe, is what tells them apart — and where they still tie, the reader's own
 *      default translation decides, or they are asked.
 *
 * The note is then built from the corpus text, never the scan, so a misread word on the page
 * never ends up in the quote. Pure functions here; the queries are in
 * server/utils/scripture-passage-identify.ts.
 */

export const PASSAGE_IDENTIFY_MIN_WORDS = 12;
export const PASSAGE_IDENTIFY_MAX_CHARS = 8000;

/** A verse is part of the passage once this share of its words lines up with the page. */
const VERSE_INCLUDED_FLOOR = 0.5;
/** The passage is only offered when most of its own words were read off the page… */
const MIN_PASSAGE_RECALL = 0.6;
/** …and the overlap is more than a stock phrase ("and the LORD said to Moses"). */
const MIN_MATCHED_WORDS = 10;
/** Translations this close are the same reading as far as the page can tell. */
const TRANSLATION_TIE_MARGIN = 0.02;
/** Close enough to be worth offering in the translation picker. */
const ALTERNATIVE_MARGIN = 0.15;
/** A page is a few hundred words; past this the alignment is all cost and no information. */
const MAX_PAGE_WORDS = 1500;

export type PassageVerse = {
  translationId: string;
  book: string;
  chapter: number;
  verse: number;
  text: string;
};

export type PassageScore = {
  translationId: string;
  book: string;
  chapter: number;
  verseStart: number;
  verseEnd: number;
  /** Share of the aligned stretch of the chapter whose words were read off the page. */
  recall: number;
  /** Share of the page's words that belong to the passage. */
  precision: number;
  f1: number;
  matched: number;
  text: string;
};

export type IdentifiedPassage = {
  reference: string;
  book: string;
  chapter: number;
  verseStart: number;
  verseEnd: number;
  translation: string;
  /** Corpus text of the passage in this translation, verses joined by a space. */
  text: string;
  recall: number;
  precision: number;
};

export type PassageIdentifyResult = {
  match: IdentifiedPassage | null;
  /** Other translations of the same passage, best first — for the picker. */
  alternatives: IdentifiedPassage[];
  /** More than one translation fits the page equally and the reader's default is not among them. */
  ambiguous: boolean;
};

export const NO_PASSAGE: PassageIdentifyResult = { match: null, alternatives: [], ambiguous: false };

/** Lower-case words, apostrophes kept, numbers (verse markers, footnote digits) dropped. */
export function passageWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .split(/[^a-z']+/)
    .map((word) => word.replace(/^'+|'+$/g, ''))
    .filter((word) => word.length > 0);
}

/** Postgres's `english` stop list — a probe made of these finds everything. */
const STOP_WORDS = new Set(
  (
    'i me my myself we our ours ourselves you your yours yourself yourselves he him his himself ' +
    'she her hers herself it its itself they them their theirs themselves what which who whom ' +
    'this that these those am is are was were be been being have has had having do does did ' +
    'doing a an the and but if or because as until while of at by for with about against between ' +
    'into through during before after above below to from up down in out on off over under again ' +
    'further then once here there when where why how all any both each few more most other some ' +
    'such no nor not only own same so than too very s t can will just don should now'
  ).split(' '),
);

/** A token the scanner plainly read right: letters, maybe one apostrophe, edge punctuation. */
function cleanWord(token: string): string | null {
  const core = token.replace(/^[("'“‘[]+/, '').replace(/[.,;:!?"'”’)\]]+$/, '');
  if (!/^[A-Za-z]+(?:'[A-Za-z]+)?$/.test(core)) return null;
  if (core.length === 1 && !/^[aAI]$/.test(core)) return null;
  return core.toLowerCase();
}

/**
 * A few short phrases from the page to look up, spread across it. Only runs of cleanly-read
 * words are used — a verse number, a footnote mark, or a misread token ends a run, which also
 * keeps a phrase from straddling two verses (each row of `BibleVerses` is one verse).
 */
export function pickProbePhrases(text: string, count = 5, size = 6): string[] {
  const windows: string[][] = [];
  let run: string[] = [];
  const flush = () => {
    for (let i = 0; i + size <= run.length; i += 2) {
      const window = run.slice(i, i + size);
      const content = window.filter((word) => !STOP_WORDS.has(word));
      if (content.length >= 3) windows.push(window);
    }
    run = [];
  };
  for (const token of text.split(/\s+/)) {
    if (!token) continue;
    const word = cleanWord(token);
    if (word) run.push(word);
    else flush();
  }
  flush();
  if (windows.length <= count) return windows.map((w) => w.join(' '));
  const picked: string[] = [];
  const step = windows.length / count;
  for (let i = 0; i < count; i++) picked.push(windows[Math.floor(i * step + step / 2)]!.join(' '));
  return [...new Set(picked)];
}

/** One letter wrong, missing or extra — the common way a scanner gets a word wrong. */
function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

const MATCH = 2;
const NEAR_MATCH = 1;
const MISMATCH = -1;
const GAP = -1;

/**
 * Score one translation's chapter against the page.
 *
 * A local alignment of the page's words against the chapter's words (Smith–Waterman), not a
 * bag of shared words. Order matters here: verses next to each other often repeat each other
 * (John 3:15 is most of 3:16), so counting shared words alone pulls a neighbouring verse into
 * the passage that the page never showed. Aligning in order finds the one stretch of the
 * chapter the page actually reads as, tolerating misread words (a mismatch), words the scan
 * dropped or invented (gaps), and verse numbers and footnote marks (already stripped).
 */
export function scoreChapter(pageWordsIn: string[], verses: PassageVerse[]): PassageScore | null {
  const page = pageWordsIn.slice(0, MAX_PAGE_WORDS);
  if (verses.length === 0 || page.length === 0) return null;
  const chapterWords: string[] = [];
  const verseOfWord: number[] = [];
  const verseWordCounts: number[] = [];
  verses.forEach((v, index) => {
    const words = passageWords(v.text);
    verseWordCounts.push(words.length);
    for (const word of words) {
      chapterWords.push(word);
      verseOfWord.push(index);
    }
  });
  const n = chapterWords.length;
  if (n === 0) return null;

  // Rolling rows: score, where the alignment began in the chapter, and how many words matched.
  let prevScore = new Int32Array(n + 1);
  let prevStart = new Int32Array(n + 1);
  let prevMatches = new Int32Array(n + 1);
  let curScore = new Int32Array(n + 1);
  let curStart = new Int32Array(n + 1);
  let curMatches = new Int32Array(n + 1);
  let best = { score: 0, start: -1, end: -1, matches: 0 };

  for (let i = 1; i <= page.length; i++) {
    const p = page[i - 1]!;
    const nearOk = p.length >= 4;
    curScore[0] = 0;
    for (let j = 1; j <= n; j++) {
      const c = chapterWords[j - 1]!;
      const pair = p === c ? MATCH : nearOk && c.length >= 4 && withinOneEdit(p, c) ? NEAR_MATCH : MISMATCH;
      let score = 0;
      let start = j - 1;
      let matches = 0;
      const diag = prevScore[j - 1]! + pair;
      if (diag > score) {
        score = diag;
        start = prevScore[j - 1]! > 0 ? prevStart[j - 1]! : j - 1;
        matches = (prevScore[j - 1]! > 0 ? prevMatches[j - 1]! : 0) + (pair > 0 ? 1 : 0);
      }
      const up = prevScore[j]! + GAP; // a page word with no chapter counterpart
      if (up > score) {
        score = up;
        start = prevStart[j]!;
        matches = prevMatches[j]!;
      }
      const left = curScore[j - 1]! + GAP; // a chapter word the page skipped
      if (left > score) {
        score = left;
        start = curStart[j - 1]!;
        matches = curMatches[j - 1]!;
      }
      curScore[j] = score;
      curStart[j] = start;
      curMatches[j] = matches;
      if (score > best.score) best = { score, start, end: j - 1, matches };
    }
    [prevScore, curScore] = [curScore, prevScore];
    [prevStart, curStart] = [curStart, prevStart];
    [prevMatches, curMatches] = [curMatches, prevMatches];
  }
  if (best.start < 0) return null;

  // Verses the aligned stretch covers most of — a verse the page only clips the end of is not
  // part of the passage it shows.
  const covered = new Map<number, number>();
  for (let k = best.start; k <= best.end; k++) {
    const v = verseOfWord[k]!;
    covered.set(v, (covered.get(v) ?? 0) + 1);
  }
  const included = [...covered.entries()]
    .filter(([v, count]) => count / Math.max(1, verseWordCounts[v]!) >= VERSE_INCLUDED_FLOOR)
    .map(([v]) => v)
    .sort((a, b) => a - b);
  if (included.length === 0) return null;
  const firstVerse = included[0]!;
  const lastVerse = included[included.length - 1]!;

  const span = best.end - best.start + 1;
  const recall = best.matches / span;
  const precision = best.matches / page.length;
  const f1 = recall + precision > 0 ? (2 * recall * precision) / (recall + precision) : 0;
  const first = verses[firstVerse]!;
  return {
    translationId: first.translationId,
    book: first.book,
    chapter: first.chapter,
    verseStart: first.verse,
    verseEnd: verses[lastVerse]!.verse,
    recall,
    precision,
    f1,
    matched: best.matches,
    text: verses
      .slice(firstVerse, lastVerse + 1)
      .map((v) => v.text.trim())
      .join(' '),
  };
}

export function passageReference(book: string, chapter: number, verseStart: number, verseEnd: number): string {
  // `BibleVerses` names the book "Psalms"; one psalm is cited "Psalm 23", as people write it.
  const name = book === 'Psalms' ? 'Psalm' : book;
  return verseStart === verseEnd
    ? `${name} ${chapter}:${verseStart}`
    : `${name} ${chapter}:${verseStart}-${verseEnd}`;
}

function toIdentified(score: PassageScore): IdentifiedPassage {
  return {
    reference: passageReference(score.book, score.chapter, score.verseStart, score.verseEnd),
    book: score.book,
    chapter: score.chapter,
    verseStart: score.verseStart,
    verseEnd: score.verseEnd,
    translation: score.translationId,
    text: score.text,
    recall: score.recall,
    precision: score.precision,
  };
}

/**
 * The best passage across every candidate chapter and translation, or none. Ties between
 * translations of the same passage go to the reader's default when it is one of them;
 * otherwise the answer is marked ambiguous so the review asks rather than guesses.
 */
export function choosePassage(scores: PassageScore[], preferredTranslation: string | null): PassageIdentifyResult {
  const valid = scores.filter((s) => s.recall >= MIN_PASSAGE_RECALL && s.matched >= MIN_MATCHED_WORDS);
  if (valid.length === 0) return NO_PASSAGE;
  const byStrength = [...valid].sort((a, b) => b.f1 - a.f1 || b.matched - a.matched);
  const best = byStrength[0]!;
  const samePassage = byStrength.filter((s) => s.book === best.book && s.chapter === best.chapter);
  const tied = samePassage.filter((s) => s.f1 >= best.f1 - TRANSLATION_TIE_MARGIN);
  const preferred = preferredTranslation
    ? tied.find((s) => s.translationId === preferredTranslation.toUpperCase())
    : undefined;
  const chosen = preferred ?? best;
  const alternatives = samePassage
    .filter((s) => s !== chosen && s.f1 >= best.f1 - ALTERNATIVE_MARGIN)
    .map(toIdentified);
  return {
    match: toIdentified(chosen),
    alternatives,
    ambiguous: !preferred && tied.length > 1,
  };
}

/** Candidate chapters from probe hits: most distinct phrases first. */
export function rankCandidateChapters(
  hitsByPhrase: Array<Array<{ book: string; chapter: number }>>,
  limit = 3,
): Array<{ book: string; chapter: number }> {
  const counts = new Map<string, { book: string; chapter: number; phrases: number }>();
  for (const hits of hitsByPhrase) {
    const seen = new Set<string>();
    for (const hit of hits) {
      const key = `${hit.book}\u0000${hit.chapter}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const entry = counts.get(key) ?? { book: hit.book, chapter: hit.chapter, phrases: 0 };
      entry.phrases += 1;
      counts.set(key, entry);
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.phrases - a.phrases)
    .slice(0, limit)
    .map(({ book, chapter }) => ({ book, chapter }));
}
