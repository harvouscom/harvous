/**
 * "One word here has been changed. Which one?"
 *
 * The one rung in this product that puts words on screen which are *not* what the text says, and
 * that is a thing to do carefully or not at all. What follows is the reasoning, because a future
 * change that relaxes any of it will look harmless.
 *
 * **The reader is told before they read.** The prompt says the verse has been altered, and the
 * block carries its own caption, so the warning travels with the words when the question is
 * scrolled past, cropped out of a screenshot, or skipped by someone tapping fast. An altered
 * line is never styled as Scripture: no pill chrome, its own class.
 *
 * **The substitution cannot make a claim.** Four blocklists, each applied to *both* sides — the
 * word taken out and the word put in:
 *
 *   - Negations, because removing a "not" inverts a verse outright.
 *   - Modals, because `shall` for `may` turns a promise into a possibility.
 *   - Divine names and titles, because no exercise should put a wrong name on God.
 *   - Doctrinally loaded terms, because grammar was never the risk. "The wages of sin is death"
 *     becoming "the wages of grace is death" passes every grammatical test cleanly, and that is
 *     precisely the sentence this rung must never render.
 *
 * The effect of the last list is that an alteration can only land on narrative vocabulary —
 * `vine` for `branch`, `fruit` for `seed`. Spottable, and carrying no claim. On a verse built
 * mostly of weighty words nothing is eligible and this returns null, which is the correct
 * failure: the rung falls through rather than reaching for something it should not touch.
 *
 * **The substitute is real vocabulary**, drawn from neighbouring verses of the same chapter
 * rather than invented, so an altered verse reads like the passage around it.
 *
 * Pure. `alteredIndex`, `original` and `substitute` never leave the server — see
 * `review-service.ts`, which ships `tokens` alone and re-derives the rest to mark the tap.
 */

import { hashSeed, mulberry32 } from '@/utils/verse-cloze';

export interface VerseAlteredExercise {
  /** The verse with one word swapped. The only field the client is given. */
  tokens: string[];
  /** Server-only, all three. */
  alteredIndex: number;
  original: string;
  substitute: string;
}

/** Removing one inverts the sentence; adding one denies what it said. */
const NEGATIONS = new Set([
  'not', 'no', 'never', 'none', 'neither', 'nor', 'nothing', 'nowhere', 'nobody', 'without',
  'cannot', 'lest', 'unless', 'except', 'nay', 'cant', 'dont', 'doesnt', 'didnt', 'wont',
  'isnt', 'arent', 'wasnt', 'werent', 'hasnt', 'havent', 'shouldnt', 'wouldnt', 'couldnt',
]);

/** A promise and a possibility are one word apart. */
const MODALS = new Set([
  'shall', 'will', 'must', 'may', 'might', 'can', 'could', 'would', 'should', 'ought',
]);

/** Names and titles of God. Deliberately generous: `king` and `shepherd` are used of people too,
 *  and the cost of barring them is a handful of candidate words. */
const DIVINE = new Set([
  'god', 'gods', 'lord', 'lords', 'jesus', 'christ', 'spirit', 'holy', 'father', 'son', 'sons',
  'almighty', 'yahweh', 'jehovah', 'messiah', 'immanuel', 'emmanuel', 'saviour', 'savior',
  'redeemer', 'creator', 'lamb', 'king', 'kings', 'shepherd', 'word', 'abba', 'ghost',
  'jehovahs', 'lordship', 'godhead', 'trinity',
]);

/** Forty days and three days are not decorative. */
const NUMBER_WORDS = new Set([
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven',
  'twelve', 'thirteen', 'fourteen', 'fifteen', 'twenty', 'thirty', 'forty', 'fifty', 'sixty',
  'seventy', 'eighty', 'ninety', 'hundred', 'thousand', 'million', 'first', 'second', 'third',
  'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'half', 'double', 'twice',
]);

/**
 * Terms a swap turns into a claim.
 *
 * The list that matters, and the one a grammar-only guard would leave out. Nothing here may be
 * removed or inserted, so `sin` can never become `grace` and `wrath` can never become `mercy`.
 */
const DOCTRINAL = new Set([
  'sin', 'sins', 'sinner', 'sinners', 'sinful', 'grace', 'faith', 'faithful', 'believe',
  'believes', 'believed', 'law', 'laws', 'righteous', 'righteousness', 'salvation', 'save',
  'saved', 'saves', 'blood', 'cross', 'death', 'die', 'died', 'dead', 'life', 'live', 'lives',
  'living', 'judgment', 'judgement', 'judge', 'mercy', 'merciful', 'love', 'loves', 'loved',
  'wrath', 'covenant', 'forgive', 'forgiven', 'forgiveness', 'atonement', 'redemption',
  'redeem', 'redeemed', 'eternal', 'everlasting', 'heaven', 'heavens', 'hell', 'sanctified',
  'justified', 'repent', 'repentance', 'resurrection', 'gospel', 'glory', 'curse', 'blessed',
]);

/**
 * Function words: prepositions, conjunctions, pronouns, auxiliaries.
 *
 * Barred on both sides, and the reason is grammar rather than doctrine. Swapping one of these
 * produces word salad — "saved among faith", "I am able to do all things about the one",
 * "the Lord's like help" — and salad is spotted by reading rather than by remembering, which
 * makes the exercise a test of English instead of a test of the verse. Every one of those
 * sentences came out of a sample run before this list existed.
 */
const FUNCTION_WORDS = new Set([
  'the', 'and', 'but', 'for', 'that', 'this', 'these', 'those', 'with', 'from', 'they', 'them',
  'their', 'theirs', 'you', 'your', 'yours', 'him', 'his', 'her', 'hers', 'she', 'has', 'have',
  'had', 'was', 'were', 'been', 'are', 'who', 'whom', 'whose', 'what', 'when', 'where', 'then',
  'than', 'there', 'here', 'into', 'unto', 'upon', 'also', 'because', 'therefore', 'which',
  'through', 'among', 'about', 'above', 'below', 'under', 'over', 'after', 'before', 'between',
  'against', 'toward', 'towards', 'within', 'without', 'while', 'until', 'since', 'though',
  'although', 'however', 'whoever', 'whatever', 'wherever', 'himself', 'herself', 'itself',
  'themselves', 'yourself', 'yourselves', 'myself', 'ourselves', 'being', 'having', 'does',
  'did', 'done', 'such', 'same', 'other', 'another', 'each', 'every', 'some', 'many', 'much',
  'more', 'most', 'both', 'either', 'ever', 'even', 'just', 'only', 'very', 'still', 'again',
  'like', 'unto', 'onto', 'else', 'thus', 'able',
]);

const MIN_WORD_LENGTH = 4;

/** Letters only, lowercased — apostrophes dropped so `doesn't` tests as `doesnt`. */
function normalise(token: string): string {
  return token.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
}

/**
 * May this word be taken out of, or put into, a verse?
 *
 * Exported because the tests assert on it directly: a guard nobody can see is a guard nobody
 * maintains.
 */
export function alterationAllowed(word: string): boolean {
  const plain = normalise(word);
  if (plain.length < MIN_WORD_LENGTH) return false;
  if (/\d/.test(word)) return false;
  return !(
    NEGATIONS.has(plain) ||
    MODALS.has(plain) ||
    DIVINE.has(plain) ||
    NUMBER_WORDS.has(plain) ||
    DOCTRINAL.has(plain) ||
    FUNCTION_WORDS.has(plain)
  );
}

/** The word inside a token, without the punctuation stuck to it. */
function bareWord(token: string): string {
  return token.replace(/^[^\p{L}\p{N}]+/u, '').replace(/[^\p{L}\p{N}]+$/u, '');
}

/**
 * One word, not two joined by a dash.
 *
 * `him—bears` is a single whitespace-delimited token holding two words, and stripping only the
 * outer punctuation leaves it whole — so it passed every blocklist as the nonsense string
 * `himbears` and got swapped out entire. The rung then said "one word has been changed" while
 * having removed two of them, one of which was a reference to Christ. Caught by reading a
 * screenshot, not by the sweep, because the sweep asked whether the *token* was allowed.
 *
 * An internal apostrophe is fine — `don't` and `Lord's` are one word.
 */
function isSingleWord(word: string): boolean {
  return /^\p{L}+(?:['\u2019]\p{L}+)?$/u.test(word);
}

/**
 * A crude stand-in for "same part of speech", and knowingly crude.
 *
 * Without a tagger there is no way to know that `free` is an adjective and `abounded` a verb,
 * and swapping one for the other gave "the abounded gift of God" — no false claim in it, but
 * nonsense, and nonsense is spotted by grammar rather than by memory, which is not the exercise.
 * Matching the ending catches the common cases: `-ing` for `-ing`, `-ed` for `-ed`, a plural for
 * a plural.
 */
function sameForm(a: string, b: string): boolean {
  const form = (word: string) => {
    const w = word.toLowerCase();
    if (w.endsWith('ing')) return 'ing';
    if (w.endsWith('ed')) return 'ed';
    // `-ss` is not a plural: `grass`, `witness`.
    if (w.endsWith('s') && !w.endsWith('ss')) return 's';
    return '';
  };
  return form(a) === form(b);
}

/**
 * Does this word share a stem with something already in the verse?
 *
 * `bear` dropped into a verse that already says `bears` gives the reader two words that look
 * like each other and one question about which moved. Not ambiguous, strictly — but unfair, and
 * unfairness in a memory exercise reads as a bug.
 */
function sharesStemWith(word: string, present: ReadonlySet<string>): boolean {
  const w = word.toLowerCase();
  for (const other of present) {
    if (other.length < 4 || w.length < 4) continue;
    if (w.startsWith(other) || other.startsWith(w)) return true;
  }
  return false;
}

/** `Vine` for `vine`, so a swap can never mint a proper noun. */
function matchCase(source: string, replacement: string): string {
  const capitalised = /^\p{Lu}/u.test(source);
  if (capitalised) return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  return replacement.charAt(0).toLowerCase() + replacement.slice(1);
}

/**
 * Build the exercise, or null when this verse has nothing safe to change.
 *
 * Null is common and correct. A verse of mostly weighty words offers no eligible position, and
 * the rung falls through the way `verse.next` does at the end of a book.
 */
export function buildVerseAltered(input: {
  text: string;
  /** Neighbouring verses, for a substitute that reads like the passage around it. */
  candidateTexts: readonly string[];
  seed: string;
}): VerseAlteredExercise | null {
  const tokens = input.text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 4) return null;

  const present = new Set(tokens.map((t) => normalise(t)).filter(Boolean));

  const positions: number[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const word = bareWord(tokens[i]);
    // The same contiguity rule the cloze needs: `me—and` is one token holding two words, and
    // swapping half of it mangles the line.
    if (!word || !tokens[i].includes(word) || !isSingleWord(word)) continue;
    /*
     * Never a capitalised word — which in practice means never a proper noun.
     *
     * "To all those loved by God in Rome" became "in Through" in a sample run: nonsense, but
     * also a false statement about where the letter went. Places and people in Scripture are
     * facts, and a rung that quietly relocates Paul's letter is making a claim after all. The
     * cost is that a sentence's first word is off limits too, which is a small price.
     */
    if (/^\p{Lu}/u.test(word)) continue;
    if (!alterationAllowed(word)) continue;
    positions.push(i);
  }
  if (!positions.length) return null;

  const substitutes: string[] = [];
  const seen = new Set<string>();
  for (const candidate of input.candidateTexts) {
    for (const token of candidate.trim().split(/\s+/)) {
      const word = bareWord(token);
      if (!word || !isSingleWord(word) || !alterationAllowed(word)) continue;
      const plain = normalise(word);
      // A word already in the verse gives the puzzle two identical answers, and one sharing a
      // stem with one gives it two that look alike.
      if (present.has(plain) || seen.has(plain) || sharesStemWith(plain, present)) continue;
      seen.add(plain);
      substitutes.push(word.toLowerCase());
    }
  }
  if (!substitutes.length) return null;

  const random = mulberry32(hashSeed(input.seed));
  const alteredIndex = positions[Math.floor(random() * positions.length)];
  const token = tokens[alteredIndex];
  const original = bareWord(token);

  // Only substitutes that read like the word they replace. Shuffled first so the choice stays
  // seeded rather than always landing on whichever survived earliest in the candidate order.
  const shuffled = [...substitutes];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const substitute = shuffled.find(
    (word) => sameForm(word, original) && normalise(word) !== normalise(original),
  );
  if (!substitute) return null;

  const at = token.indexOf(original);
  const swapped = matchCase(original, substitute);
  const out = [...tokens];
  out[alteredIndex] = token.slice(0, at) + swapped + token.slice(at + original.length);

  return { tokens: out, alteredIndex, original, substitute: swapped };
}

/** True when the reader pointed at the word that was changed. */
export function gradeVerseAltered(exercise: VerseAlteredExercise, chosenIndex: number): boolean {
  return Number.isInteger(chosenIndex) && chosenIndex === exercise.alteredIndex;
}
