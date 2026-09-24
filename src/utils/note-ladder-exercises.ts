/**
 * The three questions Review asks about a note, and the rules that keep them honest.
 *
 * A note review used to be an open reflective question — "what made you write this?" — and
 * reading those back, they are not review questions at all. They are invitations to go and mark
 * something, and they have moved to Home as exactly that. What is left here is retrieval: a
 * question about your own note that you can be right about.
 *
 * **What a note is asked about: its context, its connections, its themes.** Which passage it
 * studies, which of your notes it is linked to, which folder it lives in. Never its wording. Two
 * rungs used to quote the reader's prose back at them — a line of the note, or the words they
 * typed on a highlight — and ask where it came from. Derek found them unhelpful (Sept 2026), and
 * they were also the two rungs most likely to reach the reader as a prompt over an empty card,
 * because whether a sentence could be quoted without giving its own answer away was only known
 * once the question was built. A note is worth remembering for what it belongs to, not for a
 * sentence someone could read back to you.
 *
 * **What may be graded.** The answer key is something visible in the reader's own library and
 * theirs to change: a reference they cited, an edge they drew, the folder the note is filed in.
 * The folder is the one of these the app may have chosen first — auto-folder files a note by its
 * strongest topic — but it is shown on the note, named in the Library, and corrected in one tap,
 * which is what separates it from a hidden reading like `NoteFingerprints.themes` or the
 * auto-generated tags. Those stay out of this file: grading them would grade a machine's reading
 * of someone's study that they have never been shown.
 *
 * Pure. The server brings the material; this decides the shape.
 */

import { buildChoiceExercise, gradeChoiceExercise, type ChoiceExercise } from '@/utils/choice-exercise';
import { seededIndex } from '@/utils/verse-cloze';
import type { ReviewPromptKey } from '@/utils/review-prompts';
import { NOTE_LADDER, emphasisDraw } from '@/utils/review-prompts';

/**
 * What a note can be asked, given what it actually has.
 *
 * Each flag is the builder's own verdict, not an estimate of it: the server decides them by
 * running `noteChoiceBuildable` over the same answers and pool the exercise is built from. A
 * probe looser than its builder is how the reader got "Pick the note this line is from." above
 * nothing at all — the list promised a question the reveal could not write.
 */
export interface NoteMaterial {
  /** It cites a passage, and the reader has enough other passages to stand beside it. */
  canPassage: boolean;
  /** It is linked to another note, and enough unlinked notes are nameable to ask against. */
  canConnect: boolean;
  /** It is filed in a folder, and the reader has enough other folders to ask against. */
  canFolder: boolean;
  /**
   * Rungs the reader has asked not to be given, from Settings.
   *
   * Applied in `resolveNoteRung` alongside the material gates, because the two answer the same
   * question — can this note be asked this — for different reasons. The walk's second pass
   * ignores it, so a note that can be asked anything is still asked something.
   */
  skip?: ReadonlySet<ReviewPromptKey>;
  /** Rungs the reader asked for more of. Weighted in the seeded walk; see `emphasisDraw`. */
  prefer?: ReadonlySet<ReviewPromptKey>;
}

/**
 * The rung this note can actually be asked, starting from where it has climbed to.
 *
 * The verse ladder can assume its material — a verse always has text. A note cannot: one with
 * no links cannot be asked what it was linked to. So the stored `ladderStep` is a *nominal*
 * position and this resolves the effective one, walking forward and wrapping once.
 *
 * Returns null when the note can be asked nothing, which is a real answer: see the floor in
 * `review-opportunities.ts`. A note that cites nothing, links to nothing and sits in no folder
 * has nothing Review can ask about, and inventing a question for it would mean inventing the
 * answer too.
 */
export function resolveNoteRung(
  step: number,
  material: NoteMaterial,
  seed?: string,
): ReviewPromptKey | null {
  const can: Partial<Record<ReviewPromptKey, boolean>> = {
    'note.passage': material.canPassage,
    'note.connect': material.canConnect,
    'note.folder': material.canFolder,
  };
  /* What the note could be asked before any preference is applied — the floor for the second
     pass below, so a skip can never be the reason a note goes unasked. */
  const buildable: Partial<Record<ReviewPromptKey, boolean>> = { ...can };
  // A rung the reader turned off is walked past exactly as one with no material is.
  if (material.skip) {
    for (const key of NOTE_LADDER) if (material.skip.has(key)) can[key] = false;
  }

  const nominal = Number.isFinite(step) ? Math.max(0, Math.trunc(step)) : 0;
  /*
   * A seed rotates the walk so five notes on step 0 are not five "pick a passage you cited".
   * The same seed must be passed from the list, the reveal and the grader — `reviewSeed(item)`.
   * Without a seed this is the plain walk, so callers that only care whether *anything* can be
   * asked (the reviewable-material probe) do not depend on one.
   *
   * Emphasis weights the seeded walk only. The unseeded caller is the probe asking whether a note
   * can be asked anything at all, and a preference has no bearing on that.
   */
  const draw = seed ? emphasisDraw(NOTE_LADDER, material.prefer) : NOTE_LADDER;
  const offset = seed ? seededIndex(seed, draw.length) : 0;
  const start = (nominal + offset) % draw.length;
  for (let i = 0; i < draw.length; i++) {
    const key = draw[(start + i) % draw.length];
    if (can[key]) return key;
  }
  /*
   * Second pass, ignoring what the reader asked not to be given.
   *
   * Skipping is one more reason to walk past a member, never a reason to return nothing — the
   * rule `review-exercise-settings.ts` states and `verseRungFor` keeps by falling forward to
   * `members[0]`. Turning a preference into a disappearance is the one thing a preference must
   * not do.
   */
  for (let i = 0; i < NOTE_LADDER.length; i++) {
    const key = NOTE_LADDER[(start + i) % NOTE_LADDER.length];
    if (buildable[key]) return key;
  }
  return null;
}

const OPTION_COUNT = 4;

/**
 * Does this label name *what* a note is, or only *when* it was written?
 *
 * Found in preview, not in design. The note question once came back offering "August 13, 2026",
 * "Written 10 Jul", "Written 26 Jun" and "August 16, 2026" — four dates, and no reader alive can
 * say which day a note was linked to. Daily notes are titled with their date, so a title is not by
 * itself a name.
 *
 * A label that fails this is still fine to *show* once the answer is known; it is only barred from
 * being an option, and from being the answer, because the question would be unanswerable.
 */
export function labelNamesWhat(label: string): boolean {
  const value = label.trim();
  if (!value) return false;
  if (value.startsWith('Written ')) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  /*
   * Months are named rather than pattern-matched. A bare `[A-Z][a-z]+ \d+` also matches "Ruth 3",
   * "John 15" and "Psalm 23" — chapter references, which are among the *best* labels there are.
   */
  const month = value.match(/^([A-Za-z]+)\s+\d{1,2}\b/)?.[1] ?? value.match(/^\d{1,2}\s+([A-Za-z]+)\b/)?.[1];
  return !(month != null && MONTHS.has(month.toLowerCase()));
}

/*
 * Whole words, not three-letter prefixes: `'Mark'.slice(0, 3)` is `'mar'`, and a prefix test
 * quietly turned the second Gospel into March.
 */
const MONTHS = new Set([
  'jan', 'january', 'feb', 'february', 'mar', 'march', 'apr', 'april', 'may',
  'jun', 'june', 'jul', 'july', 'aug', 'august', 'sep', 'sept', 'september',
  'oct', 'october', 'nov', 'november', 'dec', 'december',
]);

/** Everything a note rung is built from: the right answers and the reader's own pool. */
export interface NoteChoiceInput {
  /**
   * Every right answer — every passage the note cites, every note it is linked to, every folder
   * it is in. The whole set, because there is no such thing as *the* one. Picking a single member
   * and marking the others wrong would grade an arbitrary row order rather than the reader's study.
   */
  acceptable: readonly string[];
  poolLabels: readonly string[];
  fallbackLabels?: readonly string[];
  /**
   * Words already on the card — the note's own title. An option that appears in it, or that it
   * appears in, is barred: a note titled "Grace in Romans 8" asked which folder it is in cannot
   * offer "Grace" among four, and cannot be asked at all if "Grace" is the only right answer.
   */
  shown?: string | null;
  seed: string;
}

/** Nothing shorter is a meaningful match — "a" is inside every title. */
const SHOWN_MATCH_MIN_CHARS = 3;

function appearsIn(shown: string, label: string): boolean {
  const haystack = shown.toLowerCase().replace(/\s+/g, ' ').trim();
  const needle = label.toLowerCase().replace(/\s+/g, ' ').trim();
  if (needle.length < SHOWN_MATCH_MIN_CHARS || haystack.length < SHOWN_MATCH_MIN_CHARS) return false;
  return haystack.includes(needle) || needle.includes(haystack);
}

/** The answers and pool with anything the card already says taken out. */
function withoutShown(input: NoteChoiceInput): NoteChoiceInput {
  const shown = input.shown?.trim();
  if (!shown) return input;
  const keep = (label: string) => !appearsIn(shown, label);
  return {
    ...input,
    acceptable: input.acceptable.filter(keep),
    poolLabels: input.poolLabels.filter(keep),
    fallbackLabels: input.fallbackLabels?.filter(keep),
  };
}

/**
 * Build "pick a passage you cited", "pick a note you linked" or "pick a folder it is in".
 *
 * A right answer the title already names is dropped from the answers, and a wrong one the title
 * names is dropped from the pool: either would put the answer on the card twice.
 */
export function buildNoteChoice(input: NoteChoiceInput): ChoiceExercise | null {
  const cleaned = withoutShown(input);
  if (!cleaned.acceptable.length) return null;
  return buildChoiceExercise({
    answers: cleaned.acceptable,
    pool: cleaned.poolLabels,
    fallbackPool: cleaned.fallbackLabels,
    // Every acceptable answer is barred as a distractor by the primitive itself — including the
    // ones the title removed from `acceptable`, which are still right and so still not wrong.
    exclude: input.acceptable,
    optionCount: OPTION_COUNT,
    seed: input.seed,
  });
}

/**
 * Could `buildNoteChoice` build this question? Seed-independent, so a batch can ask it once.
 *
 * `buildChoiceExercise` only ever fails on count — too few answers, or too few distinct
 * distractors once every answer is barred — and never on the seed. So the probe can decide with
 * the same inputs and no seed, and be exactly as strict as the builder rather than an estimate
 * of it.
 */
export function noteChoiceBuildable(input: Omit<NoteChoiceInput, 'seed'>): boolean {
  return buildNoteChoice({ ...input, seed: 'probe' }) !== null;
}

/** True when the reader picked any of the answers that are genuinely right. */
export function gradeNoteChoice(
  exercise: ChoiceExercise,
  chosen: string,
  acceptable: readonly string[],
): boolean {
  return gradeChoiceExercise(exercise, chosen, acceptable);
}
