/**
 * The "rebuild" rung of the verse ladder: a verse with some words taken out.
 *
 * Seeded and deterministic, which is a correctness requirement rather than tidiness. The
 * server sends the cloze and the client renders it; if the blanks were random, a refresh
 * would silently change the exercise mid-answer, and the same item would read differently on
 * a phone and a laptop. The seed is the item id plus the rung, so the same verse at the same
 * stage always hides the same words — and hides different ones once the reader climbs.
 *
 * No model. Blanking is a filter over word length and a stopword list, which is enough:
 * the exercise is retrieving a phrase you have read, not guessing which word an algorithm
 * judged most significant.
 */

/**
 * Words never blanked. Short function words carry no retrieval value — "I am the ____" with
 * "the" removed tests typing, not memory — and blanking them makes the verse unreadable as a
 * cue, which defeats the rung.
 */
const STOPWORDS = new Set([
  'the', 'and', 'for', 'but', 'not', 'you', 'your', 'his', 'her', 'him', 'she', 'they',
  'them', 'their', 'this', 'that', 'these', 'those', 'with', 'from', 'into', 'unto',
  'shall', 'will', 'have', 'has', 'had', 'was', 'were', 'are', 'been', 'being', 'who',
  'whom', 'what', 'when', 'then', 'than', 'there', 'here', 'also', 'upon', 'over',
  'all', 'any', 'out', 'own', 'because', 'therefore', 'however',
]);

/** Below this a word is too small to be worth retrieving. */
const MIN_BLANK_LENGTH = 4;

/** Never blank the opening words — the reader needs a way in. */
const LEAD_IN_WORDS = 2;

export interface VerseClozeBlank {
  /** Index into `tokens`, so the client can render the gap in place. */
  index: number;
  word: string;
}

export interface VerseCloze {
  /** Every token in order, punctuation attached, so joining with a space rebuilds the verse. */
  tokens: string[];
  blanks: VerseClozeBlank[];
  /** The verse with each blank replaced by an underscore run. */
  display: string;
}

/** FNV-1a. Stable across runtimes, which `String.prototype.hashCode`-style ad-hoc hashes are not. */
export function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, and good enough for choosing which words to hide. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bareWord(token: string): string {
  return token.replace(/[^\p{L}\p{N}'-]/gu, '');
}

/**
 * Never hide more than this share of the content words.
 *
 * The rung is "rebuild", and rebuilding needs something to build on. Without a cap, a short
 * verse whose content words are all eligible has every one of them blanked, which is not a
 * fill-in-the-blank at all — it is the "recall" rung one step early, with the punctuation left
 * in as a taunt. Measured on John 15:5: 31 tokens, 9 eligible, and a share-of-all-tokens
 * target of 9. Every content word gone.
 */
const MAX_BLANK_SHARE = 0.6;

/**
 * How much of a verse to hide on a given maintenance pass.
 *
 * A verse that has been round the ladder does not need the same gaps back; it needs bigger
 * ones. Three steps and then a ceiling, because `verse.recall` — write it from memory — is
 * already the 100% rung, and a cloze that hides more than three content words in five stops
 * being a prompt and becomes that rung with extra steps.
 *
 * Driven by the pass, never by `reviewCount`: the count rises on every answer, so ten near
 * misses would hand someone a mostly-blank verse they have never once recalled.
 */
export function verseClozeRatio(pass: number): number {
  const steps = [0.3, 0.45, 0.6];
  const index = Math.min(steps.length - 1, Math.max(0, Math.trunc(Number.isFinite(pass) ? pass : 0)));
  return Math.min(MAX_BLANK_SHARE, steps[index]);
}

/**
 * Build the exercise.
 *
 * `ratio` is the share of *content words* hidden, not of the whole verse. Sharing out of all
 * tokens sounds equivalent and is not: function words are half a verse and can never be
 * blanked, so a 0.3 of-everything target lands on 60-100% of the words that are actually
 * eligible. Ratio of the eligible pool means 0.3 hides about three content words in ten,
 * whatever the verse's mix of grammar and substance.
 *
 * At least one blank whenever anything is eligible, because a "rebuild" with nothing missing
 * is just the verse.
 */
export function buildVerseCloze(text: string, seed: string, ratio = 0.3): VerseCloze {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return { tokens: [], blanks: [], display: '' };
  }

  const eligible: number[] = [];
  for (let i = LEAD_IN_WORDS; i < tokens.length; i++) {
    const word = bareWord(tokens[i]);
    if (word.length < MIN_BLANK_LENGTH) continue;
    if (STOPWORDS.has(word.toLowerCase())) continue;
    /*
     * Only tokens whose word sits contiguously inside them.
     *
     * `me—and` is one whitespace-delimited token holding two words, and `bareWord` strips the
     * em-dash from the middle to give `meand` — a string the token does not contain. Blanking
     * it printed `_____nd`, eating the dash and half the second word. Rare enough to skip
     * rather than to re-tokenise around, and skipping is what keeps the verse readable.
     */
    if (!tokens[i].includes(word)) continue;
    eligible.push(i);
  }

  if (eligible.length === 0) {
    return { tokens, blanks: [], display: tokens.join(' ') };
  }

  const ceiling = Math.max(1, Math.floor(eligible.length * MAX_BLANK_SHARE));
  const target = Math.max(1, Math.min(ceiling, Math.round(eligible.length * ratio)));

  // Fisher-Yates over the eligible indices with the seeded PRNG, then take the first `target`
  // and re-sort. Shuffling beats sampling-with-retries: no duplicate draws, no unbounded loop.
  const random = mulberry32(hashSeed(seed));
  const pool = [...eligible];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const chosen = pool.slice(0, target).sort((a, b) => a - b);

  const blanks: VerseClozeBlank[] = chosen.map((index) => ({
    index,
    word: bareWord(tokens[index]),
  }));

  const blankSet = new Set(chosen);
  const display = tokens
    .map((token, i) => {
      if (!blankSet.has(i)) return token;
      const word = bareWord(token);
      // Punctuation stays outside the gap, on both sides, so the sentence still scans: an
      // opening quote or bracket belongs to the verse, not to the word being recalled.
      const at = token.indexOf(word);
      if (at < 0) return '_'.repeat(Math.max(3, word.length));
      const leading = token.slice(0, at);
      const trailing = token.slice(at + word.length);
      return `${leading}${'_'.repeat(Math.max(3, word.length))}${trailing}`;
    })
    .join(' ');

  return { tokens, blanks, display };
}

/**
 * The recognize rung's cue: the opening of the verse, enough to place it without giving it
 * away. Words rather than characters, so the cue never cuts mid-word.
 *
 * Leading and trailing quote marks are stripped because the prompt wraps the cue in quotes of
 * its own. Many verses open mid-speech — John 15:5 begins with a curly double quote — and the
 * result was `"“I am the vine;…"`, two opening marks in a row.
 */
export function verseCue(text: string, words = 4): string {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return '';
  return tokens
    .slice(0, Math.max(1, words))
    .join(' ')
    .replace(/^[“”"'‘’]+/, '')
    .replace(/[“”"'‘’]+$/, '')
    .trim();
}

/**
 * Did the reader fill the gaps with the words that belong in them?
 *
 * Position by position, because order is the exercise: "vine … branches" and "branches … vine"
 * are not the same answer, and a set comparison would call them both right.
 *
 * Compared loosely. The blanks hold bare words already, and someone typing the missing words of
 * a verse should not be marked down for capitalising one or leaving off an apostrophe — the
 * question is whether they remembered the word, not how they typed it. This is the only graded
 * rung whose answer key is the Scripture text itself rather than something the reader committed;
 * that is fine, because the text is not a machine's reading of anything.
 */
export function gradeVerseRebuild(cloze: VerseCloze, answers: readonly string[]): boolean {
  if (cloze.blanks.length === 0) return false;
  if (answers.length !== cloze.blanks.length) return false;
  return cloze.blanks.every((blank, index) => sameWord(answers[index], blank.word));
}

function sameWord(a: string | undefined, b: string): boolean {
  return normaliseWord(a ?? '') === normaliseWord(b) && normaliseWord(b).length > 0;
}

function normaliseWord(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}
