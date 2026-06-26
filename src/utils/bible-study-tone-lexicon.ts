/**
 * Deterministic emotional-tone detection for note prose (memory layer, Workstream A).
 *
 * The fingerprint needs one signal nothing else captures: the emotional register of a note —
 * is this a lament, a thanksgiving, a wrestling with fear? Following the project's no-AI-default
 * (see docs/future/MEMORY_LAYER_ASSESSMENT.md), this is a lexicon scorer, NOT a model: it counts
 * word-bound matches per tone over the note's visible text. Predictable, offline, and cheap enough
 * to run on every save.
 *
 * Mirrors the shape of `bible-study-keywords.ts` (category + word list) but stays self-contained:
 * tone words rarely overlap the doctrinal keyword corpus, and keeping them separate means tone
 * noise can never leak into folder/tag suggestions (a guardrail from the assessment doc).
 */

export type EmotionalTone =
  | 'lament'
  | 'joy'
  | 'fear'
  | 'gratitude'
  | 'hope'
  | 'conviction'
  | 'awe'
  | 'peace';

export interface ToneEntry {
  tone: EmotionalTone;
  /** Exact whole-word matches (lowercased). */
  words: string[];
  /** Prefix stems (length >= 4) — a token counts if it starts with the stem (catches inflections). */
  stems: string[];
}

export const TONE_LEXICON: ToneEntry[] = [
  {
    tone: 'lament',
    words: ['lament', 'grief', 'sorrow', 'mourning', 'despair', 'broken', 'brokenness', 'weep', 'wept', 'tears', 'anguish', 'distress', 'suffering', 'pain', 'hurting', 'loss', 'empty', 'darkness', 'why'],
    stems: ['lament', 'griev', 'mourn', 'sorrow', 'despair', 'suffer', 'anguish'],
  },
  {
    tone: 'joy',
    words: ['joy', 'joyful', 'rejoice', 'rejoicing', 'glad', 'gladness', 'delight', 'celebrate', 'celebration', 'happy', 'happiness', 'cheer', 'jubilant', 'exult'],
    stems: ['rejoic', 'delight', 'celebrat', 'exult', 'jubil'],
  },
  {
    tone: 'fear',
    words: ['fear', 'afraid', 'anxious', 'anxiety', 'worry', 'worried', 'dread', 'terrified', 'terror', 'scared', 'panic', 'fearful', 'uncertain', 'doubt', 'doubts'],
    stems: ['anxio', 'anxie', 'worri', 'terrif', 'fright', 'doubt'],
  },
  {
    tone: 'gratitude',
    words: ['thank', 'thanks', 'thankful', 'grateful', 'gratitude', 'thanksgiving', 'blessed', 'blessing', 'blessings', 'appreciate', 'provision', 'provided'],
    stems: ['thank', 'grateful', 'gratitud', 'apprecia', 'bless'],
  },
  {
    tone: 'hope',
    words: ['hope', 'hopeful', 'hoping', 'await', 'awaiting', 'expectation', 'promise', 'promises', 'future', 'anticipate', 'longing', 'yearning', 'wait', 'waiting'],
    stems: ['hope', 'anticipat', 'expectan', 'long', 'yearn', 'promis'],
  },
  {
    tone: 'conviction',
    words: ['sin', 'sinful', 'repent', 'repentance', 'confess', 'confession', 'guilt', 'guilty', 'shame', 'convicted', 'conviction', 'rebuke', 'wrong', 'failed', 'failure', 'forgive', 'forgiveness'],
    stems: ['repent', 'confess', 'convict', 'rebuk', 'forgiv', 'guilt'],
  },
  {
    tone: 'awe',
    words: ['awe', 'wonder', 'glory', 'glorious', 'majesty', 'majestic', 'holy', 'holiness', 'mighty', 'sovereign', 'sovereignty', 'marvel', 'marvelous', 'reverence', 'worship', 'magnificent', 'splendor'],
    stems: ['majest', 'sovereig', 'marvel', 'reveren', 'magnific', 'glori', 'wondrous'],
  },
  {
    tone: 'peace',
    words: ['peace', 'peaceful', 'rest', 'calm', 'comfort', 'comforted', 'comforting', 'still', 'stillness', 'assurance', 'assured', 'secure', 'safe', 'refuge', 'trust', 'content', 'contentment'],
    stems: ['comfort', 'assur', 'refuge', 'content', 'tranquil'],
  },
];

export interface ToneResult {
  /** Dominant tone, or null when no clear signal (too few matches or a tie at the top). */
  tone: EmotionalTone | null;
  /** Per-tone match counts (only tones with >0 matches are included). */
  scores: Partial<Record<EmotionalTone, number>>;
}

/** A tone must clear this many word matches to be eligible as the dominant tone. */
export const MIN_TONE_MATCHES = 2;

const STEM_MIN_LENGTH = 4;

/** Lowercase word tokens, stripping punctuation. Apostrophes kept inside words ("god's"). */
function tokenize(text: string): string[] {
  if (!text || !text.trim()) return [];
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}'\s-]/gu, ' ')
    .split(/[\s-]+/)
    .filter(Boolean);
}

/**
 * Score the emotional tone of a block of text. Pure and deterministic: each token contributes at
 * most once per tone (exact word match, or a prefix-stem match for inflections). The dominant tone
 * is the unique highest scorer that clears `MIN_TONE_MATCHES`; ties or weak signals return null so
 * a fingerprint never claims a tone it can't defend.
 */
export function detectEmotionalTone(text: string): ToneResult {
  const tokens = tokenize(text);
  if (!tokens.length) return { tone: null, scores: {} };

  const scores: Partial<Record<EmotionalTone, number>> = {};

  for (const entry of TONE_LEXICON) {
    let count = 0;
    const wordSet = new Set(entry.words);
    const stems = entry.stems.filter((s) => s.length >= STEM_MIN_LENGTH);
    // Each token occurrence contributes at most once to this tone (exact word, or a stem prefix
    // for inflections). The OR avoids double-counting a token that is both an exact word and a stem.
    for (const token of tokens) {
      if (wordSet.has(token) || stems.some((s) => token.startsWith(s))) count++;
    }
    if (count > 0) scores[entry.tone] = count;
  }

  let best: EmotionalTone | null = null;
  let bestCount = 0;
  let tied = false;
  for (const entry of TONE_LEXICON) {
    const c = scores[entry.tone] ?? 0;
    if (c > bestCount) {
      best = entry.tone;
      bestCount = c;
      tied = false;
    } else if (c === bestCount && c > 0) {
      tied = true;
    }
  }

  if (bestCount < MIN_TONE_MATCHES || tied) return { tone: null, scores };
  return { tone: best, scores };
}
