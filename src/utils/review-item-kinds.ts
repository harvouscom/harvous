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
 * The five shapes of a review item, which are five different questions.
 *
 * `note` asks what you observed. `highlight` asks why you marked it. `connection` asks why
 * you linked two notes — the only kind with two note ids. `thread` asks what the whole
 * cluster is forming, and is keyed by the representative note the graph picked. `verse` is
 * the memory ladder, and the only kind whose prompt changes as you succeed at it.
 */
export const REVIEW_ITEM_KINDS = ['note', 'highlight', 'connection', 'thread', 'verse'] as const;

export type ReviewItemKind = (typeof REVIEW_ITEM_KINDS)[number];

export function isReviewItemKind(value: string): value is ReviewItemKind {
  return (REVIEW_ITEM_KINDS as readonly string[]).includes(value);
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
export const RECALL_STATES = ['new', 'fragile', 'forming', 'durable'] as const;

export type RecallState = (typeof RECALL_STATES)[number];

export function isRecallState(value: string): value is RecallState {
  return (RECALL_STATES as readonly string[]).includes(value);
}

export const RECALL_STATE_LABELS: Record<RecallState, string> = {
  new: 'New',
  fragile: 'Still fragile',
  forming: 'Forming',
  durable: 'Holding',
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
