/**
 * Shared allowlists for Review and Challenges (client + server).
 *
 * The sibling of `recall-opportunity-kinds.ts`, and deliberately a separate file: recall is
 * what Harvous offers unprompted, Review is what the reader asked for. The two overlap in
 * subject — both are about returning to a note — and in nothing else. A recall card can be
 * snoozed forever and never comes back on its own terms; a review item has a due date the
 * reader set by answering it, and disappears only when they say so.
 */

/**
 * The six shapes of a review item, which are six different questions.
 *
 * `note` asks what you observed. `highlight` asks why you marked it. `connection` asks why
 * you linked two notes — the only kind with two note ids. `thread` asks what the whole
 * cluster is forming, and is keyed by the representative note the graph picked. `verse` is
 * the memory ladder, whose prompt changes as you succeed at it. `chapter` is the newest: a
 * chapter you sat with in the Bible reader, asked about from its own text and the curated
 * index — the reading half of the loop that Home's "write about what you read" card opens.
 */
export const REVIEW_ITEM_KINDS = ['note', 'highlight', 'connection', 'thread', 'verse', 'chapter'] as const;

export type ReviewItemKind = (typeof REVIEW_ITEM_KINDS)[number];

export function isReviewItemKind(value: string): value is ReviewItemKind {
  return (REVIEW_ITEM_KINDS as readonly string[]).includes(value);
}

/**
 * The kinds Review still has an answerable question for.
 *
 * `highlight`, `connection` and `thread` asked open questions — "why did you connect these?",
 * "what is taking shape across your Thread?" — which are the same shape the note prompts were
 * retired for. They are worth asking; they are not worth *marking*, and a queue that mixes
 * things you can be right about with things you cannot is not a review.
 *
 * They went where the note prompts went: Home, as a suggestion. `REVIEW_ITEM_KINDS` keeps all
 * five because rows for the retired kinds exist in the table and their source keys must keep
 * resolving — this is about what may be *created*, not about what may be read.
 */
export const REVIEW_ASKABLE_KINDS = ['note', 'verse', 'chapter'] as const;

export type ReviewAskableKind = (typeof REVIEW_ASKABLE_KINDS)[number];

export function isReviewAskableKind(value: string): value is ReviewAskableKind {
  return (REVIEW_ASKABLE_KINDS as readonly string[]).includes(value);
}

/**
 * Three answers, and none of them is a rating.
 *
 * "I recalled it" / "I almost had it" describe the state of a memory, not satisfaction with
 * the app — which is why there is no thumbs anywhere in this feature. `revealed` is not a
 * button the reader presses to grade themselves; it is what gets recorded when they open the
 * source without attempting, and the interval shortens accordingly. Reading a note you could
 * not remember is a perfectly good outcome and the copy never suggests otherwise.
 */
export const REVIEW_OUTCOMES = ['recalled', 'almost', 'revealed'] as const;

export type ReviewOutcome = (typeof REVIEW_OUTCOMES)[number];

export function isReviewOutcome(value: string): value is ReviewOutcome {
  return (REVIEW_OUTCOMES as readonly string[]).includes(value);
}

/** Everything ReviewEvents records. The three outcomes plus the lifecycle verbs. */
export const REVIEW_EVENT_ACTIONS = [
  'shown',
  'recalled',
  'almost',
  'revealed',
  'deferred',
  'paused',
  'resumed',
  'archived',
] as const;

export type ReviewEventAction = (typeof REVIEW_EVENT_ACTIONS)[number];

export function isReviewEventAction(value: string): value is ReviewEventAction {
  return (REVIEW_EVENT_ACTIONS as readonly string[]).includes(value);
}

/**
 * `paused` and `archived` differ the way a snooze differs from a dismissal on the recall
 * shelf: paused is a season ("not while I am in Romans"), archived is "I am done with this".
 * Both are reversible here, because unlike a suggestion the reader put this item in the queue
 * themselves and should be able to take it back out and put it back.
 */
export const REVIEW_ITEM_STATUSES = ['active', 'paused', 'archived'] as const;

export type ReviewItemStatus = (typeof REVIEW_ITEM_STATUSES)[number];

export function isReviewItemStatus(value: string): value is ReviewItemStatus {
  return (REVIEW_ITEM_STATUSES as readonly string[]).includes(value);
}

/**
 * How well the reader currently holds this, derived from their answers.
 *
 * Shown as a quiet word, never a percentage or a bar. "Fragile" is information; "34%
 * retention" is a score, and scoring someone's grasp of Scripture is exactly what this
 * product does not do.
 */
/**
 * `slipping` is the fifth, and the one place Review says a thing is not working rather than
 * asking it again: an item missed four times after being held. It is derived, like the rest,
 * from the lapse count in `review-scheduling.ts`, and it clears when the reader steps the
 * item back a rung or holds it again.
 */
export const RECALL_STATES = ['new', 'fragile', 'forming', 'durable', 'slipping'] as const;

export type RecallState = (typeof RECALL_STATES)[number];

export function isRecallState(value: string): value is RecallState {
  return (RECALL_STATES as readonly string[]).includes(value);
}

/**
 * Five states, three things worth saying.
 *
 * The words came from the model rather than from the reader: "Still fragile", "Forming",
 * "Holding" and "Slipping" were four metaphors — glass, clay, grip, slope — for one axis, and
 * three were the enum's own values promoted to a caption. The first rewrite kept the shape and
 * fixed the words, which was not enough: "Needs work" is a school report about the reader, and
 * "Coming back" says nothing at all.
 *
 * So the shape goes too. `fragile` and `forming` differ by whether you have got something right
 * once or twice running, and nobody needs to be told that difference about their own study —
 * both are still learning it. What is left is the three states a person would actually name:
 * learning it, knowing it, losing it.
 */
export const RECALL_STATE_LABELS: Record<RecallState, string> = {
  new: 'New',
  fragile: 'Still learning',
  forming: 'Still learning',
  durable: 'You know this',
  slipping: 'Slipping away',
};

/**
 * Where a review item came from, so the queue stays legible as such.
 *
 * `engine` is the reader's own Study Bible layer noticing something worth returning to —
 * a verse they highlighted, a link they drew, a Thread that has grown. `seed` is the retired
 * cold-start batch, kept in the union because rows written by it are still in the database.
 */
export const REVIEW_ITEM_ORIGINS = ['user', 'seed', 'challenge', 'engine'] as const;

export type ReviewItemOrigin = (typeof REVIEW_ITEM_ORIGINS)[number];

export function isReviewItemOrigin(value: string): value is ReviewItemOrigin {
  return (REVIEW_ITEM_ORIGINS as readonly string[]).includes(value);
}

export const CHALLENGE_TEMPLATE_KEYS = [
  'strengthen_thread',
  'keep_verse',
  'return_to_question',
  'trace_connection',
] as const;

export type ChallengeTemplateKey = (typeof CHALLENGE_TEMPLATE_KEYS)[number];

export function isChallengeTemplateKey(value: string): value is ChallengeTemplateKey {
  return (CHALLENGE_TEMPLATE_KEYS as readonly string[]).includes(value);
}

/**
 * `retired` is not a status the reader can choose — it is what the note cascade writes when a
 * challenge's source note is deleted. Kept distinct from `archived` so the page can say why
 * the path stopped rather than implying the reader put it down.
 */
export const CHALLENGE_STATUSES = ['active', 'paused', 'completed', 'archived', 'retired'] as const;

export type ChallengeStatus = (typeof CHALLENGE_STATUSES)[number];

export function isChallengeStatus(value: string): value is ChallengeStatus {
  return (CHALLENGE_STATUSES as readonly string[]).includes(value);
}

/** The statuses a reader may set directly. `completed` is earned, `retired` is done to them. */
export const CHALLENGE_SETTABLE_STATUSES = ['active', 'paused', 'archived'] as const;

export type ChallengeSettableStatus = (typeof CHALLENGE_SETTABLE_STATUSES)[number];

export function isChallengeSettableStatus(value: string): value is ChallengeSettableStatus {
  return (CHALLENGE_SETTABLE_STATUSES as readonly string[]).includes(value);
}

/**
 * A step is pending, done, or skipped — and skipped is not failure.
 *
 * The doc is explicit that incomplete work gets no failure language, so a skipped step
 * resolves the step and lets the path finish. Someone who skips every step still completes
 * the challenge, which is the correct outcome: they read the path, decided none of it was
 * what they needed, and that is a real answer.
 */
export const CHALLENGE_STEP_STATUSES = ['pending', 'done', 'skipped'] as const;

export type ChallengeStepStatus = (typeof CHALLENGE_STEP_STATUSES)[number];

export function isChallengeStepStatus(value: string): value is ChallengeStepStatus {
  return (CHALLENGE_STEP_STATUSES as readonly string[]).includes(value);
}

/** What a step asks for, which decides how the page renders it. */
export const CHALLENGE_STEP_KINDS = [
  'recall',
  'evidence',
  'link',
  'tension',
  'summary',
  'ladder',
] as const;

export type ChallengeStepKind = (typeof CHALLENGE_STEP_KINDS)[number];

export function isChallengeStepKind(value: string): value is ChallengeStepKind {
  return (CHALLENGE_STEP_KINDS as readonly string[]).includes(value);
}

/**
 * Three rows, and the number is the feature's whole posture.
 *
 * The strategy doc's rule is a calm curated stack rather than a task manager, and the failure
 * mode it names — "27 due" — is what any number above about five starts to feel like. Three
 * fits under the Continue shelf without pushing the day's record off the first screen, and it
 * means the inbox can never be the biggest thing on Activity.
 */
/**
 * How many goes a graded rung allows before it shows the answer.
 *
 * Being told "back in 4 days" the instant you slip teaches nothing; trying again while the
 * question is still in front of you is where the repetition does its work. How many goes it took
 * is what sets the interval, so the schedule still reflects how well it went.
 *
 * **The number depends on the exercise, and the reason is the guessing floor.** Four options
 * with one spent leaves three, then two: a third go at a tap is nearly a giveaway, and a fourth
 * would hand it over. Nothing typed has that floor — a second wrong guess at a word you cannot
 * remember is still a wrong guess — so the rungs that ask the reader to produce something get
 * one more, which is where the retrieval actually happens. No document specifies a number; this
 * is argued from the exercises.
 *
 * `REVIEW_MAX_ATTEMPTS` remains the ceiling every bound and clamp is written against.
 */
export const REVIEW_MAX_ATTEMPTS = 3;

/** Rungs whose answer is one of four on screen. A third go there is not an attempt. */
const CHOICE_ATTEMPTS = 2;
const PRODUCED_ATTEMPTS = 3;

const CHOICE_RUNGS = new Set<string>([
  'verse.recognize',
  'verse.next',
  'verse.before',
  'verse.locate',
  'verse.book',
  'verse.connect',
  'verse.theme',
  'verse.person',
  'verse.crossref',
  'note.recognize',
  'note.passage',
  'note.connect',
  'note.annotation',
  'chapter.verse',
  'chapter.person',
]);

export function maxAttemptsFor(promptKey: string | null | undefined): number {
  return promptKey && CHOICE_RUNGS.has(promptKey) ? CHOICE_ATTEMPTS : PRODUCED_ATTEMPTS;
}

export const REVIEW_INBOX_MAX_ROWS = 3;

/**
 * Extra rows read so that a note with nothing to ask about costs no slot.
 *
 * Items made before the note ladder existed can carry no question, and they are dropped while
 * views are built. Without slack, three such rows at the front of the queue empty the inbox.
 */
export const REVIEW_INBOX_UNASKABLE_SLACK = 4;

/** One sitting, not a queue to clear. Deliberately below what a keen reader could manage. */
export const REVIEW_SESSION_CAP = 10;

/**
 * How many items the engine may add in a rolling day. Three, for the same reason the inbox
 * shows three: a queue that grows faster than a person can answer it becomes a debt.
 *
 * Rolling 24 hours rather than a calendar day, because the server has no timezone for the
 * reader — the study feed route refuses to guess one, and this follows it.
 */
export const REVIEW_ENGINE_DAILY_CAP = 3;
export const REVIEW_ENGINE_WINDOW_HOURS = 24;
