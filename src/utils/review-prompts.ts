/**
 * The questions Review asks, written by hand.
 *
 * Every prompt in this file was authored once and is filled with the reader's own material at
 * runtime. Nothing here calls a model, and that is the product's position rather than a
 * limitation to be lifted later: a generated question about someone's study of Scripture is a
 * machine's reading of the text presented as a prompt, and Harvous does not do that. The
 * prompts are personal because their *inputs* are personal — your reference, your Thread's
 * title, the two passages you chose to link.
 *
 * **They are instructions, not questions.** "Pick the verse that follows John 15:5." rather than
 * "What comes after John 15:5?" — a review is a thing to do, and phrasing it as a question made
 * the app sound like it was wondering aloud. Every prompt ends in a full stop for that reason.
 *
 * **Each key also has a `task`**: the same instruction with the subject stripped out, for the row
 * on Activity, which leads with *what* is being reviewed and puts the doing underneath. The
 * prompt names the subject because it stands alone in the dock; the task never does, because the
 * title above it already did.
 *
 * Where a rung is graded the answer key is the reader's own material or the Scripture text, never
 * their prose: `attempt` text is still never compared to anything.
 */

import type { ReviewAskableKind, ReviewItemKind } from './review-item-kinds';
import { seededIndex } from './verse-cloze';
import { VERSE_KEYWORDS_MIN_COUNT } from './review-difficulty';

export const REVIEW_PROMPT_KEYS = [
  'note.recognize',
  'note.passage',
  'note.connect',
  'note.annotation',
  'verse.recognize',
  'verse.rebuild',
  'verse.initials',
  'verse.recall',
  'verse.keywords',
  'verse.next',
  'verse.before',
  'verse.altered',
  'verse.theme',
  'verse.person',
  'verse.crossref',
  'verse.sequence',
  'verse.locate',
  'verse.book',
  'verse.connect',
  'chapter.verse',
  'chapter.finish',
  'chapter.order',
  'chapter.person',
  // Appended, never inserted: `ladderStep` is live data and the list's order is its identity.
  'verse.place',
  'chapter.place',
  'chapter.marked',
  'verse.marked',
] as const;

export type ReviewPromptKey = (typeof REVIEW_PROMPT_KEYS)[number];

export interface ReviewPromptContext {
  /** Scripture reference when the item has one, else the note or Thread title. */
  reference?: string | null;
  noteTitle?: string | null;
  secondaryNoteTitle?: string | null;
  threadTitle?: string | null;
  /** A distinctive fragment of the verse, for the recognize rung. */
  cue?: string | null;
  /**
   * How much of the verse the recall rung is giving away, so the instruction can match the
   * exercise. Absent on every caller that does not know — which then gets the bare form, the
   * same one this rung always had.
   */
  recallMode?: 'finish' | 'leadIn' | 'reference' | null;
  /** How many words the keyword rung is asking for, for the same reason. */
  keywordCount?: number | null;
  /** Which tier the initials rung is at: below the top it is gaps in place, not a blank page. */
  initialsTier?: number | null;

}

/**
 * The name the question can use, or null when the note has none.
 *
 * Never "this note", which was the old fallback and named nothing at all. A nameless note gets
 * the bare form of the question instead, and the row names it on the line below.
 */
function subjectName(ctx: ReviewPromptContext): string | null {
  return ctx.reference?.trim() || ctx.noteTitle?.trim() || ctx.threadTitle?.trim() || null;
}

/**
 * Build an instruction two ways round: a named subject sits inside the sentence, and anything
 * nameless gets a hand-written bare form.
 *
 * The bare forms are written out rather than spliced. Splicing produced "your this Thread" and
 * "You marked this in this." — a fallback string dropped into a slot that assumed a name.
 */
function named(ctx: ReviewPromptContext, inside: (s: string) => string, bare: string): string {
  const name = subjectName(ctx);
  return name ? inside(name) : bare;
}

/**
 * The same, for the prompts that name a Thread.
 *
 * `subjectName` prefers `reference`, which is right for a verse rung and wrong here: a thread
 * item carries whatever reference its representative note cites, and reading it through the
 * general resolver produced "your Romans 8:15 Thread".
 */
function namedThread(
  ctx: ReviewPromptContext,
  inside: (s: string) => string,
  bare: string,
): string {
  const name = ctx.threadTitle?.trim() || ctx.noteTitle?.trim() || null;
  return name ? inside(name) : bare;
}

/**
 * Prompt text by key. "Thread" is capitalized throughout — it is the product's name for a
 * cluster of connected notes, and `npm run check:thread-terminology` enforces it.
 */
export const REVIEW_PROMPTS: Record<ReviewPromptKey, (ctx: ReviewPromptContext) => string> = {
  /*
   * Three instructions about the note, not about its wording.
   *
   * These replaced five open reflective prompts — "what made you write this?", "what is clearer
   * to you now?" — which turned out not to be review questions at all. They were invitations to
   * go and mark something, and that is where they went: Home, as a suggestion.
   *
   * `note.recognize` never names the note, because the note *is* the answer.
   */
  'note.recognize': () => 'Pick the note this line is from.',
  'note.passage': (ctx) =>
    named(ctx, (s) => `Pick a passage you cited in ${s}.`, 'Pick a passage you cited here.'),
  'note.connect': (ctx) =>
    named(ctx, (s) => `Pick a note you linked to ${s}.`, 'Pick a note you linked to this one.'),
  /*
   * The words the reader typed on a highlight, and the passage they typed them on.
   *
   * Never names the note: the stem is already their own sentence, and the answer is the passage.
   */
  'note.annotation': () => 'Pick the passage you wrote this on.',
  /*
   * Recognition, which is what this rung was always named for: the reference is given and the
   * reader picks the words that belong to it. It asked for the verse in full before, which put
   * the ladder's hardest ask at its foot.
   */
  'verse.recognize': (ctx) =>
    named(ctx, (s) => `Pick how ${s} begins.`, 'Pick how this verse begins.'),
  /*
   * "Blanks", here and everywhere. This one exercise was called three things: "the missing
   * words" to a subscriber, "the gaps" to a free reader trying it, and "Missing word 3" to a
   * screen reader — so the word someone learned on the sample was a word they never saw again.
   */
  'verse.rebuild': (ctx) =>
    named(ctx, (s) => `Fill in the blanks in ${s}.`, 'Fill in the blanks.'),
  /*
   * Three ways of asking, because the rung is staged — see `verseRecallMode`. The instruction has
   * to match the exercise: "write it from memory" printed above two thirds of the verse is the
   * app misdescribing its own question.
   */
  'verse.recall': (ctx) =>
    ctx.recallMode === 'finish'
      ? named(ctx, (s) => `Finish ${s}.`, 'Finish this verse.')
      : ctx.recallMode === 'leadIn'
        ? named(ctx, (s) => `Carry on from the opening of ${s}.`, 'Carry on from the opening.')
        : named(ctx, (s) => `Write ${s} from memory.`, 'Write this verse from memory.'),
  // The classic memory-verse aid: the first letter of every word, and nothing else.
  /*
   * Two ways of asking, for the same reason recall has three: below the top tier only a few
   * words stand on their initial and they are typed back in place, so "write it from its first
   * letters" describes an exercise the reader is not being given.
   */
  'verse.initials': (ctx) =>
    (ctx.initialsTier ?? 2) < 2
      ? named(
          ctx,
          (s) => `Finish each word from its first letter in ${s}.`,
          'Finish each word from its first letter.',
        )
      : named(
          ctx,
          (s) => `Write ${s} from its first letters.`,
          'Write the verse from its first letters.',
        ),
  // Free recall, the lightest rung: any three words that are actually in it.
  // The count is staged too, so the instruction cannot promise three and show two boxes.
  'verse.keywords': (ctx) => {
    const count = ctx.keywordCount ?? 3;
    const word = count === 2 ? 'two' : count === 4 ? 'four' : 'three';
    return named(ctx, (s) => `Name ${word} words from ${s}.`, `Name ${word} words from this verse.`);
  },
  'verse.next': (ctx) =>
    named(ctx, (s) => `Pick the verse that follows ${s}.`, 'Pick the verse that follows.'),
  // Names the chapter, never the verse: "in John 15", because the verse number is the answer.
  'verse.before': (ctx) =>
    named(
      ctx,
      (s) => `Pick which comes first in ${s.replace(/:\d.*$/, '')}.`,
      'Pick which comes first.',
    ),
  /*
   * The most important line of copy in this feature.
   *
   * It has to say the text has been changed *before* the reader reaches the text, because this
   * is the one rung that puts words on screen which are not what the passage says. Phrased
   * flatly and first: no "can you spot", no game-show framing around someone's Scripture.
   */
  'verse.altered': (ctx) =>
    named(
      ctx,
      (s) => `One word in ${s} has been changed. Find it.`,
      'One word in this verse has been changed. Find it.',
    ),
  'verse.sequence': (ctx) =>
    named(ctx, (s) => `Put ${s} back in order.`, 'Put the verse back in order.'),
  // Never names the passage: the reference is the answer.
  'verse.locate': () => 'Say where this is from.',
  // Nor here: the book is the answer.
  'verse.book': () => 'Pick the book this is from.',
  /*
   * Graded now. "Say what you connected to it, and why" was the last open rung on the verse
   * ladder — the reader judging themselves on a question with a right answer sitting in the
   * table. The notes that cite this verse are the key; any of them is correct.
   */
  'verse.connect': (ctx) =>
    named(ctx, (s) => `Pick the note you cited ${s} in.`, 'Pick the note you cited this in.'),
  /*
   * The three rungs whose answer key is the curated scripture knowledge layer — editorial data
   * about Scripture, never a machine's reading of the reader's notes. See
   * verse-knowledge-exercises.ts for what that permits and what it must never do.
   */
  'verse.theme': (ctx) =>
    named(ctx, (s) => `Pick the theme ${s} carries.`, 'Pick the theme this verse carries.'),
  'verse.person': (ctx) =>
    named(ctx, (s) => `Pick who ${s} is about.`, 'Pick who this verse is about.'),
  'verse.crossref': (ctx) =>
    named(
      ctx,
      (s) => `Pick the passage ${s} is cross-referenced with.`,
      'Pick the passage this verse is cross-referenced with.',
    ),
  /*
   * The chapter rungs: questions about a chapter the reader sat with in the Bible reader.
   *
   * Every key is the chapter's own text or the curated index; the reader's words never enter it.
   * The chapter is named in every prompt — it is never the answer here, and "pick the verse that
   * is in this chapter" with no chapter named is a question about nothing. Chapter *themes* are
   * deliberately absent: John 3 carries over a thousand topics in the index, so almost any theme
   * is defensible and the question would be unfalsifiable.
   */
  'chapter.verse': (ctx) =>
    named(ctx, (s) => `Pick the verse that is in ${s}.`, 'Pick the verse that is in this chapter.'),
  'chapter.finish': (ctx) =>
    named(ctx, (s) => `Finish this verse from ${s}.`, 'Finish this verse from the chapter.'),
  'chapter.order': (ctx) =>
    named(
      ctx,
      (s) => `Put these in the order they come in ${s}.`,
      'Put these in the order they come.',
    ),
  'chapter.person': (ctx) =>
    named(ctx, (s) => `Pick who appears in ${s}.`, 'Pick who appears in this chapter.'),
  /*
   * Places, the twin of the two `person` rungs.
   *
   * "Names" rather than "is set in", and deliberately. The index records that a place is named
   * at a verse, not that the passage happens there — Bethany is named in John 11 from a good
   * way off — so a prompt claiming the second would be asserting something the data never said.
   */
  'verse.place': (ctx) =>
    named(ctx, (s) => `Pick the place ${s} names.`, 'Pick the place this verse names.'),
  'chapter.place': (ctx) =>
    named(ctx, (s) => `Pick a place named in ${s}.`, 'Pick a place named in this chapter.'),
  /*
   * The one chapter rung whose answer is something the reader did rather than something the
   * chapter contains. "Marked" is the word the app uses for a highlight everywhere else.
   */
  'chapter.marked': (ctx) =>
    named(ctx, (s) => `Pick the verse you marked in ${s}.`, 'Pick the verse you marked here.'),
  'verse.marked': (ctx) =>
    named(ctx, (s) => `Pick the words you marked in ${s}.`, 'Pick the words you marked here.'),
};

/**
 * The same instruction with the subject taken out, for the row on Activity.
 *
 * The row leads with *what* is being reviewed — the reference, or the note's name — and puts the
 * doing underneath, which is how Home has always read ("A passage you keep returning to · Across
 * 5 of your notes"). Review had it the other way round: the question was the title and the thing
 * it was about was demoted to the line below, so a shelf of rows all read as questions with no
 * subject. A task must therefore never contain a reference or a title; the title above it has
 * already said which.
 */
export const REVIEW_TASKS: Record<ReviewPromptKey, string> = {
  'note.recognize': 'Pick the note this is from',
  'note.passage': 'Pick a passage you cited',
  'note.connect': 'Pick a note you linked',
  'note.annotation': 'Pick the passage you wrote this on',
  'verse.recognize': 'Pick how it begins',
  'verse.rebuild': 'Fill in the blanks',
  'verse.initials': 'Fill it in from first letters',
  'verse.recall': 'Write it out',
  'verse.keywords': 'Name some of its words',
  'verse.next': 'Pick what comes next',
  'verse.before': 'Pick which comes first',
  'verse.altered': 'Find the changed word',
  'verse.sequence': 'Put it back in order',
  'verse.locate': 'Say where it is from',
  'verse.book': 'Pick the book it is from',
  'verse.connect': 'Pick the note you cited it in',
  'verse.theme': 'Pick the theme it carries',
  'verse.person': 'Pick who it is about',
  'verse.crossref': 'Pick its cross-reference',
  'chapter.verse': 'Pick the verse in it',
  'chapter.finish': 'Finish a verse from it',
  'chapter.order': 'Put them in order',
  'chapter.person': 'Pick who is in it',
  'verse.place': 'Pick the place it names',
  'chapter.place': 'Pick a place it names',
  'chapter.marked': 'Pick the verse you marked',
  'verse.marked': 'Pick the words you marked',
};

export function reviewTaskFor(key: ReviewPromptKey): string {
  return REVIEW_TASKS[key] ?? REVIEW_TASKS['verse.recall'];
}

/**
 * The verse ladder, in order. The rungs are positions on `ReviewItems.ladderStep`, and a clean
 * recall moves the reader up one — so the same verse is asked a different way each time rather
 * than the same way forever, which is the difference between varied retrieval and rereading.
 *
 * The last two were appended rather than inserted, so an item mid-ladder keeps the rung it is
 * on. `sequence` and `locate` are also the only two rungs anything grades: they have one right
 * answer that comes from the text itself. Every other rung is an open question the reader
 * judges for themselves, and that asymmetry is deliberate — see verse-ladder-exercises.ts.
 */
/**
 * The note ladder. Three graded rungs, climbed on a clean recall like the verse ladder.
 *
 * Unlike the verse ladder these are *material-gated*: a note with no links cannot be asked what
 * it was linked to. `resolveNoteRung` in note-ladder-exercises.ts turns this nominal position
 * into the one a given note can actually be asked.
 */
export const NOTE_LADDER: readonly ReviewPromptKey[] = [
  'note.recognize',
  'note.passage',
  'note.connect',
  'note.annotation',
];

export const NOTE_LADDER_MAX_STEP = NOTE_LADDER.length - 1;

export const VERSE_LADDER: readonly ReviewPromptKey[] = [
  'verse.recognize',
  'verse.rebuild',
  'verse.recall',
  'verse.next',
  'verse.connect',
  'verse.sequence',
  'verse.locate',
  'verse.altered',
];

export const VERSE_LADDER_MAX_STEP = VERSE_LADDER.length - 1;

/**
 * First-sitting rungs the engine may open on, so a handful of new verses is not five
 * "pick how it begins".
 *
 * Recognize, rebuild (blanks), next/before, the context step — what the verse is connected to,
 * by the reader or by the index — and the locate step, where the reader's own mark can be the
 * answer.
 *
 * **Step 6 is here on purpose, and it argues with the rest of the list.** The rule used to read
 * "never recall or locate on a first asking: those are how a verse is kept, not how it is met",
 * and for `verse.recall` (2) and the altered word (7) it still holds — both ask the reader to
 * produce something they have not yet been given a reason to hold. Step 6 is different because
 * of who is in its family. `verse.marked` asks the reader to find the words *they* highlighted,
 * which is not a demand on memory at all, and it was unreachable until an item had been recalled
 * cleanly twice from step 4 — so the readers most likely to want it, the ones with years of
 * marked-up Scripture, were the ones least likely ever to reach it.
 *
 * The cost is `verse.locate`, the family's default: a verse with nothing marked that opens here
 * is asked which passage the line is from on a first asking, which is precisely what the old
 * rule barred. The draw softens it rather than removing it — once the reader's own reference
 * pool is deep enough to bar `verse.book` (see `LOCATE_MIN_RIVALS`), a verse carrying a marked
 * span reaches `verse.marked` on two of the three seeds, so the verses that open here with
 * something to find are usually asked to find it.
 *
 * Notes walk the four rungs so a handful of new notes is not five "pick the note this is from".
 */
export const VERSE_OPENING_STEPS = [0, 1, 3, 4, 6] as const;
export const CHAPTER_OPENING_STEPS = [0, 1] as const;
export const NOTE_OPENING_STEPS = [0, 1, 2, 3] as const;

/** The rungs a new item of this kind may open on. One list, so the stagger and the step-back
 *  out of a stalled item draw from the same set of "ways in". */
export function openingStepsFor(kind: string): readonly number[] {
  if (kind === 'verse') return VERSE_OPENING_STEPS;
  if (kind === 'chapter') return CHAPTER_OPENING_STEPS;
  return NOTE_OPENING_STEPS;
}

export function openingLadderStep(kind: 'verse' | 'note' | 'chapter', alreadyOfKind: number): number {
  if (kind === 'verse') return VERSE_OPENING_STEPS[alreadyOfKind % VERSE_OPENING_STEPS.length];
  if (kind === 'chapter') return CHAPTER_OPENING_STEPS[alreadyOfKind % CHAPTER_OPENING_STEPS.length];
  return NOTE_OPENING_STEPS[alreadyOfKind % NOTE_OPENING_STEPS.length];
}

/**
 * What a verse is asked once it has climbed the whole ladder.
 *
 * Without this the top rung is terminal: a verse someone has worked all the way up asks "where
 * is this from?" every time it comes round, forever, and the one passage they know best is the
 * one the app has nothing left to say about.
 *
 * Only the rungs worth repeating. `verse.recognize` and `verse.recall` are how a verse is
 * learned, not how it is kept — asking "what does this verse say?" of something memorised
 * months ago is a question with no work in it. What remains gets harder instead: each pass
 * through this list hides more of the text than the last.
 */
/**
 * What a verse can be asked, as far as the rung families care.
 *
 * Counts only. The server holds the actual themes, people and cross-references and builds the
 * exercise from them; this is the pure, client-safe summary that decides which member of a family
 * *can* be asked. An absent material (the client never has one) means "the default member",
 * which is exactly the behaviour every existing caller relied on.
 */
export interface VerseMaterial {
  /** Notes of the reader's that cite this verse. */
  citedInNotes: number;
  /** Curated topics on this verse at or above the relevance floor. */
  themeCount: number;
  /** Curated people on this verse. */
  personCount: number;
  /** Curated places named at this verse, after the trivial labels are barred. */
  placeCount?: number;
  /** Cross-reference targets at or above the vote floor, with text available. */
  crossRefCount: number;
  /** Other references of the reader's own that could stand beside this one on locate. */
  locateRivals?: number;
  /** Content words in the verse, for the rungs that ask for them. */
  contentWordCount?: number;
  /** Words in the span the reader marked on this verse, 0 when they marked none. */
  readerSpanWords?: number;
  /**
   * Rungs the reader has asked not to be given, from Settings.
   *
   * Read here rather than in the engine because this is the one place a step becomes a rung, and
   * the list, the reveal, the grader and the truth all resolve through it. A preference applied
   * anywhere else would move the question under an answer already in flight.
   *
   * Never a reason to resolve to nothing: the walk still falls forward to the family default,
   * which is why the always-on families cannot be switched off at all.
   */
  skip?: ReadonlySet<ReviewPromptKey>;
  /**
   * Rungs the reader asked for more of, from Settings. Weighted in the seeded draw by
   * `emphasisDraw`, and never a reason to skip anything else.
   */
  prefer?: ReadonlySet<ReviewPromptKey>;
}

/** Below this many rivals of the reader's own, "where is this from?" is a coin toss. */
export const LOCATE_MIN_RIVALS = 3;

/**
 * The exercises a step can wear.
 *
 * A stored `ladderStep` is live data, so a new exercise cannot be a new step in the middle of the
 * ladder without moving every reader who is already on one. So a step stays a step, and names a
 * *family* instead: the first member is the default and must always build; the rest are chosen
 * by seed and by what material the verse has. Two readers on step 4 see different exercises, and
 * the same reader sees a different one on each maintenance pass. This is where variety comes
 * from without touching a single stored step.
 */
export const VERSE_FAMILIES: readonly (readonly ReviewPromptKey[])[] = [
  ['verse.recognize'],
  ['verse.rebuild', 'verse.initials'],
  ['verse.recall', 'verse.keywords'],
  ['verse.next', 'verse.before'],
  // The context step: what this verse is connected to, by the reader or by the index.
  ['verse.connect', 'verse.theme', 'verse.person', 'verse.place', 'verse.crossref'],
  ['verse.sequence'],
  // The book is the easier locate, and is only *available* while the reader's own reference
  // pool is too thin for a fair one — see `verseFamilyMemberAvailable`.
  ['verse.locate', 'verse.book', 'verse.marked'],
  ['verse.altered'],
];

/**
 * The families that come round again once the ladder is climbed.
 *
 * Recognising is how a verse is met, not how it is kept, so family 0 does not repeat.
 *
 * **Family 2 — recall and keywords — now does.** It was excluded on the same reasoning, and the
 * reasoning was right about the *old* rung: a bare reference and a blank box is how a verse is
 * learned, and asking that of something memorised months ago is a question with no work in it.
 * But those rungs are staged now (`review-difficulty.ts`), and their lower tiers are not that
 * question — "finish this verse" is a maintenance question in a way "write it from memory" never
 * was. Without this the ladder had no rung that ever asks for the whole verse, so a reader who
 * climbed the whole thing was never once asked to produce it.
 *
 * **Appended, never inserted.** `ladderStep` is live data and this list's order is its identity:
 * offsets 0-5 — steps 8 to 13 — resolve to exactly the families they did before, and only a
 * reader already past step 13 shifts, once, by one family. Inserting at position 1 would have
 * moved everyone past step 9.
 */
export const VERSE_MAINTENANCE_FAMILIES: readonly number[] = [1, 3, 4, 5, 6, 7, 2];

/** The maintenance cycle by its default members — what a caller with no seed sees. */
export const VERSE_MAINTENANCE: readonly ReviewPromptKey[] = VERSE_MAINTENANCE_FAMILIES.map(
  (family) => VERSE_FAMILIES[family][0],
);

/** Can this member be asked of a verse with this material? The default member always can. */
export function verseFamilyMemberAvailable(
  key: ReviewPromptKey,
  material: VerseMaterial | undefined,
): boolean {
  if (!material) return VERSE_FAMILIES.some((family) => family[0] === key);
  // A reader's preference is one more reason to walk past a member, never to return none.
  if (material.skip?.has(key)) return false;
  switch (key) {
    case 'verse.connect':
      return material.citedInNotes >= 1;
    case 'verse.theme':
      return material.themeCount >= 1;
    case 'verse.person':
      return material.personCount >= 1;
    case 'verse.place':
      return (material.placeCount ?? 0) >= 1;
    case 'verse.crossref':
      return material.crossRefCount >= 1;
    case 'verse.book':
      return (material.locateRivals ?? LOCATE_MIN_RIVALS) < LOCATE_MIN_RIVALS;
    case 'verse.keywords':
      /*
       * Judged at the *easiest* tier's count, plus headroom — asking whether a verse can spare
       * four content words would bar the rung from short verses it reads fine on at two.
       *
       * Strictly more than the count, because a verse with exactly as many content words as it
       * is asked for is not this rung at all: naming all of them is `verse.recall` wearing three
       * input boxes. The old literal 3 was this rule with the old count baked into it.
       */
      return (material.contentWordCount ?? 0) > VERSE_KEYWORDS_MIN_COUNT;
    case 'verse.initials':
      return (material.contentWordCount ?? 4) >= 4;
    case 'verse.marked':
      return (material.readerSpanWords ?? 0) >= 3;
    default:
      return true;
  }
}

/**
 * The members a seeded draw runs over, with the reader's "More" counted twice.
 *
 * Emphasis is a weight, not an order. Putting preferred members first would make "More theme"
 * mean "theme on every verse that has one" — the other context rungs gone from all of them — which
 * is an allow-list by another name, the thing `review-exercise-settings.ts` exists to refuse.
 * Counted twice, a preferred member wins the draw about twice as often and every sibling keeps
 * its own slot.
 *
 * Returns `members` itself when nothing in it is preferred, so a reader with no preferences draws
 * exactly what they drew before and the list, the reveal and the grader resolve the rung they
 * always did. When *every* member is preferred the weights cancel and it returns `members` then
 * too: more of everything is normal.
 */
export function emphasisDraw(
  members: readonly ReviewPromptKey[],
  prefer?: ReadonlySet<ReviewPromptKey>,
): readonly ReviewPromptKey[] {
  if (!prefer?.size) return members;
  const extra = members.filter((key) => prefer.has(key));
  if (!extra.length || extra.length === members.length) return members;
  return [...members, ...extra];
}

/** The rung a verse is on, and how many times it has been round the maintenance cycle. */
export interface VerseRung {
  key: ReviewPromptKey;
  /**
   * 0 while climbing, then 1, 2, 3… once wrapped.
   *
   * Drives how much of the verse is hidden. Not `reviewCount`, which rises on every answer —
   * ten "almost"s would hand someone a mostly-blank verse they have never once recalled.
   */
  pass: number;
  /** Which family the rung came from, so a caller can tell a maintenance locate from a first one. */
  family: number;
}

/**
 * Which rung a step resolves to.
 *
 * Without a seed: the family's default, which is exactly what this returned before families
 * existed. With a seed, a member is picked by hash and the pick **falls forward within the
 * family** to the first member the material allows, then to the default — so a verse no note
 * cites is never asked which note cites it. The list, the reveal and the grader must all pass
 * the same seed and material, or they resolve different rungs from one step; that is the drift
 * `rungIdentityIsTheAnswer` and `reviewRungIsGraded` guard by resolving through here too.
 */
export function verseRungFor(step: number, seed?: string, material?: VerseMaterial): VerseRung {
  const clamped = Number.isFinite(step) ? Math.max(0, Math.trunc(step)) : 0;
  let family: number;
  let pass: number;
  if (clamped < VERSE_FAMILIES.length) {
    family = clamped;
    pass = 0;
  } else {
    const offset = clamped - VERSE_FAMILIES.length;
    family = VERSE_MAINTENANCE_FAMILIES[offset % VERSE_MAINTENANCE_FAMILIES.length];
    pass = 1 + Math.floor(offset / VERSE_MAINTENANCE_FAMILIES.length);
  }

  const members = VERSE_FAMILIES[family];
  if (!seed || members.length === 1) return { key: members[0], pass, family };

  const draw = emphasisDraw(members, material?.prefer);
  const start = seededIndex(seed, draw.length);
  for (let i = 0; i < draw.length; i++) {
    const key = draw[(start + i) % draw.length];
    if (verseFamilyMemberAvailable(key, material)) return { key, pass, family };
  }
  return { key: members[0], pass, family };
}

/**
 * What a chapter can be asked, as far as its rung families care. The chapter twin of
 * `VerseMaterial`: counts only, the server holds the text and the people.
 */
export interface ChapterMaterial {
  /** Verses the text actually has — Psalm 117 has two, whatever the canon table says. */
  verseCount: number;
  /** Verses fit to be finished: the reader's own highlights in the chapter, else long enough. */
  finishCandidates: number;
  /** People the index places in the chapter, after the trivial names are barred. */
  personCount: number;
  /** Places the index names in the chapter, after the trivial labels are barred. */
  placeCount?: number;
  /** Verses of this chapter the reader highlighted. */
  highlightCount?: number;
  /** Rungs the reader has asked not to be given. See `VerseMaterial.skip`. */
  skip?: ReadonlySet<ReviewPromptKey>;
  /** Rungs the reader asked for more of. See `VerseMaterial.prefer`. */
  prefer?: ReadonlySet<ReviewPromptKey>;
}

/**
 * The chapter ladder, as families like the verse ladder's.
 *
 * Three steps: pick the verse that is in it, finish a verse from it, then put verses in order
 * or say who appears. `chapter.verse` closes every family because it is the one member that
 * always builds — its distractors fall back to well-known chapters — so a step can never resolve
 * to nothing.
 *
 * The closing member is a fallback, not a peer, and that is the one way this differs from
 * `verseRungFor`. A verse family draws by seed across all its members; here the draw runs over
 * the members *before* `chapter.verse` and reaches it only when none of them can be built —
 * otherwise a seeded draw would show "pick the verse" on step 1 to half of all readers while
 * the cloze was there to be asked. Among the real members the draw is seeded as usual: on step 2
 * a chapter is asked to order its verses or to say who appears, and which one varies by item and
 * by pass, so the maintenance cycle does not ask the same one forever.
 */
export const CHAPTER_FAMILIES: readonly (readonly ReviewPromptKey[])[] = [
  ['chapter.verse'],
  ['chapter.finish', 'chapter.marked', 'chapter.verse'],
  // `chapter.verse` stays last: it is the fallback the draw reaches only when nothing else builds.
  ['chapter.order', 'chapter.person', 'chapter.place', 'chapter.verse'],
];

export const CHAPTER_LADDER_MAX_STEP = CHAPTER_FAMILIES.length - 1;

/** Once climbed, a chapter cycles over the two families with work in them. */
export const CHAPTER_MAINTENANCE_FAMILIES: readonly number[] = [1, 2];

export function chapterFamilyMemberAvailable(
  key: ReviewPromptKey,
  material: ChapterMaterial | undefined,
): boolean {
  if (!material) return key === 'chapter.verse';
  if (material.skip?.has(key)) return false;
  switch (key) {
    case 'chapter.finish':
      return material.finishCandidates >= 1;
    case 'chapter.order':
      return material.verseCount >= 3;
    case 'chapter.person':
      return material.personCount >= 1;
    case 'chapter.place':
      return (material.placeCount ?? 0) >= 1;
    case 'chapter.marked':
      // Four verses at least, or there is nothing unmarked left to ask against.
      return (material.highlightCount ?? 0) >= 1 && material.verseCount >= 4;
    default:
      return true;
  }
}

export function chapterRungFor(step: number, seed?: string, material?: ChapterMaterial): VerseRung {
  const clamped = Number.isFinite(step) ? Math.max(0, Math.trunc(step)) : 0;
  let family: number;
  let pass: number;
  if (clamped < CHAPTER_FAMILIES.length) {
    family = clamped;
    pass = 0;
  } else {
    const offset = clamped - CHAPTER_FAMILIES.length;
    family = CHAPTER_MAINTENANCE_FAMILIES[offset % CHAPTER_MAINTENANCE_FAMILIES.length];
    pass = 1 + Math.floor(offset / CHAPTER_MAINTENANCE_FAMILIES.length);
  }
  const members = CHAPTER_FAMILIES[family];
  // Weighted over the peers only: the closing fallback is never something a reader can ask for.
  const real = emphasisDraw(members.slice(0, -1), material?.prefer);
  const start = real.length && seed ? seededIndex(seed, real.length) : 0;
  for (let i = 0; i < real.length; i++) {
    const key = real[(start + i) % real.length];
    if (chapterFamilyMemberAvailable(key, material)) return { key, pass, family };
  }
  return { key: members[members.length - 1], pass, family };
}

export const VERSE_REBUILD_STEP = 1;

/** Rung 0 of the note ladder, where the note's own identity is the answer. */
export const NOTE_RECOGNIZE_STEP = 0;

/** The graded rungs. The client's own verdict is ignored on these — the server marks them. */
export const VERSE_NEXT_STEP = 3;
export const VERSE_SEQUENCE_STEP = 5;
export const VERSE_LOCATE_STEP = 6;

/**
 * Rungs the server marks, where the puzzle *is* the question.
 *
 * On these the reader taps an option rather than writing an attempt and judging themselves, so
 * the dock fetches the reveal straight away and the client's own verdict is discarded.
 *
 * One function because the answer was being written out by hand in three places — the dock, the
 * subtitle rule and the outcome route — and a rung added to two of them is a rung that asks a
 * question nobody can answer, or marks one nobody was asked.
 */
const GRADED_VERSE_KEYS = new Set<ReviewPromptKey>([
  // Both free-recall rungs are marked now. They were the only two the app never checked, and
  // "write what you remember, if you want to" above an unchecked box is not a question.
  'verse.recognize',
  'verse.recall',
  'verse.rebuild',
  'verse.initials',
  'verse.keywords',
  'verse.next',
  'verse.before',
  'verse.book',
  'verse.connect',
  'verse.theme',
  'verse.person',
  'verse.place',
  'verse.marked',
  'verse.crossref',
  'verse.altered',
  'verse.sequence',
  'verse.locate',
]);

export function reviewRungIsGraded(item: {
  kind?: string | null;
  ladderStep?: number | null;
  /** The resolved rung, when the caller has it. Otherwise the family default is judged. */
  promptKey?: string | null;
}): boolean {
  // Every note rung is a multiple choice now, and every chapter rung is keyed to the text.
  if (item.kind === 'note' || item.kind === 'chapter') return true;
  if (item.kind !== 'verse') return false;
  // The rung the server actually resolved wins; a step alone can only name the family default.
  if (item.promptKey && REVIEW_PROMPT_KEYS.includes(item.promptKey as ReviewPromptKey)) {
    return GRADED_VERSE_KEYS.has(item.promptKey as ReviewPromptKey);
  }
  return GRADED_VERSE_KEYS.has(verseRungFor(item.ladderStep ?? 0).key);
}

/** Which kinds climb rather than rotate, and how far. */
export function ladderMaxStepFor(kind: ReviewItemKind): number | null {
  if (kind === 'verse') return VERSE_LADDER_MAX_STEP;
  if (kind === 'note') return NOTE_LADDER_MAX_STEP;
  if (kind === 'chapter') return CHAPTER_LADDER_MAX_STEP;
  return null;
}

/** The next rung after a clean recall, clamped to the ladder's top. */
export function nextLadderStep(kind: ReviewItemKind, step: number): number {
  const current = Math.max(0, Math.trunc(Number.isFinite(step) ? step : 0));
  // A verse keeps climbing past the top of the ladder, into the maintenance cycle; so does a
  // chapter — see `chapterRungFor`.
  if (kind === 'verse' || kind === 'chapter') return current + 1;
  const max = ladderMaxStepFor(kind);
  if (max === null) return step;
  return Math.min(max, current + 1);
}

/**
 * Which rung this item is on.
 *
 * Both remaining kinds climb rather than rotate. The rotation this used to do — a different
 * phrasing each time an item came round — left with the open kinds it served; `reviewCount` and
 * `itemId` are kept in the signature because callers pass them and a rung may want them again.
 */
export function pickPromptKey(
  kind: ReviewAskableKind,
  reviewCount: number,
  ladderStep = 0,
  itemId?: string | null,
  material?: VerseMaterial,
  chapterMaterial?: ChapterMaterial,
): ReviewPromptKey {
  // Past the top the ladder wraps into maintenance rather than stopping — see `verseRungFor`.
  if (kind === 'verse') {
    return verseRungFor(
      ladderStep,
      itemId ? reviewSeed({ id: itemId, ladderStep, reviewCount }) : undefined,
      material,
    ).key;
  }
  // Explicit, and before the note fall-through: a third kind read as a note would be handed
  // `note.recognize` and a question about a note it does not have.
  if (kind === 'chapter') {
    return chapterRungFor(
      ladderStep,
      itemId ? reviewSeed({ id: itemId, ladderStep, reviewCount }) : undefined,
      chapterMaterial,
    ).key;
  }
  /*
   * The *nominal* rung for a note. What it can actually be asked depends on whether it has a
   * body to quote, a passage to name or a link to recall — see `resolveNoteRung`, which the
   * server calls with the material in hand. This is the fallback when nothing is known.
   */
  const step = Math.min(Math.max(0, Math.trunc(ladderStep)), NOTE_LADDER_MAX_STEP);
  return NOTE_LADDER[step];
}

/**
 * The seed every rung is built from.
 *
 * `reviewCount` is in here, and that is the whole point. The seed used to be the item and its
 * step, and a step only advances on a clean recall — so getting a question wrong meant meeting
 * *exactly* the same question next time: the same family member, the same fragment, the same
 * distractors in the same order. The one reader who most needed a second angle on a verse was
 * the one guaranteed never to get one.
 *
 * Every surface must build from this: the list, the reveal, the grader and the truth. The
 * outcome route resolves the rung, grades it and restores the truth *before* the counter moves,
 * so an answer is always marked against the question that was actually asked.
 */
export function reviewSeed(item: {
  id?: string | null;
  ladderStep?: number | null;
  reviewCount?: number | null;
}): string {
  const step = Math.max(0, Math.trunc(Number.isFinite(item.ladderStep) ? (item.ladderStep as number) : 0));
  const count = Math.max(0, Math.trunc(Number.isFinite(item.reviewCount) ? (item.reviewCount as number) : 0));
  return `${item.id ?? ''}:${step}:${count}`;
}

export function fillReviewPrompt(key: ReviewPromptKey, ctx: ReviewPromptContext): string {
  return REVIEW_PROMPTS[key](ctx);
}

/** One call from an item row to its rendered question. */
export function reviewPromptFor(
  item: {
    kind: ReviewAskableKind;
    reviewCount: number;
    ladderStep?: number | null;
    id?: string | null;
    /** What the verse can be asked; decides which family member the step resolves to. */
    material?: VerseMaterial;
    /** The same for a chapter. */
    chapterMaterial?: ChapterMaterial;
  },
  ctx: ReviewPromptContext,
): { key: ReviewPromptKey; prompt: string } {
  const key = pickPromptKey(
    item.kind,
    item.reviewCount,
    item.ladderStep ?? 0,
    item.id ?? null,
    item.material,
    item.chapterMaterial,
  );
  return { key, prompt: fillReviewPrompt(key, ctx) };
}
