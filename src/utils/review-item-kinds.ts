/**
 * Shared allowlists for Review and Challenges (client + server).
 *
 * The sibling of `recall-opportunity-kinds.ts`, and deliberately a separate file: recall is
 * what Harvous offers unprompted, Review is what the reader asked for. The two overlap in
 * subject — both are about returning to a note — and in nothing else. A recall card can be
 * snoozed forever and never comes back on its own terms; a review item has a due date the
 * reader set by answering it, and disappears only when they say so.
 */

export const REVIEW_ITEM_KINDS = ['note', 'highlight', 'connection', 'thread', 'verse', 'chapter'] as const;

export type ReviewItemKind = (typeof REVIEW_ITEM_KINDS)[number];

export function isReviewItemKind(value: string): value is ReviewItemKind {
  return (REVIEW_ITEM_KINDS as readonly string[]).includes(value);
}

export const REVIEW_ASKABLE_KINDS = ['note', 'verse', 'chapter'] as const;

export type ReviewAskableKind = (typeof REVIEW_ASKABLE_KINDS)[number];

export function isReviewAskableKind(value: string): value is ReviewAskableKind {
  return (REVIEW_ASKABLE_KINDS as readonly string[]).includes(value);
}

export const REVIEW_OUTCOMES = ['recalled', 'almost', 'revealed'] as const;

export type ReviewOutcome = (typeof REVIEW_OUTCOMES)[number];

export function isReviewOutcome(value: string): value is ReviewOutcome {
  return (REVIEW_OUTCOMES as readonly string[]).includes(value);
}

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

export const REVIEW_ITEM_STATUSES = ['active', 'paused', 'archived'] as const;

export type ReviewItemStatus = (typeof REVIEW_ITEM_STATUSES)[number];

export function isReviewItemStatus(value: string): value is ReviewItemStatus {
  return (REVIEW_ITEM_STATUSES as readonly string[]).includes(value);
}

export const RECALL_STATES = ['new', 'fragile', 'forming', 'durable', 'slipping'] as const;

export type RecallState = (typeof RECALL_STATES)[number];

export function isRecallState(value: string): value is RecallState {
  return (RECALL_STATES as readonly string[]).includes(value);
}

export const RECALL_STATE_LABELS: Record<RecallState, string> = {
  new: 'New',
  fragile: 'Still learning',
  forming: 'Still learning',
  durable: 'You know this',
  slipping: 'Slipping away',
};

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

export const CHALLENGE_STATUSES = ['active', 'paused', 'completed', 'archived', 'retired'] as const;

export type ChallengeStatus = (typeof CHALLENGE_STATUSES)[number];

export function isChallengeStatus(value: string): value is ChallengeStatus {
  return (CHALLENGE_STATUSES as readonly string[]).includes(value);
}

export const CHALLENGE_SETTABLE_STATUSES = ['active', 'paused', 'archived'] as const;

export type ChallengeSettableStatus = (typeof CHALLENGE_SETTABLE_STATUSES)[number];

export function isChallengeSettableStatus(value: string): value is ChallengeSettableStatus {
  return (CHALLENGE_SETTABLE_STATUSES as readonly string[]).includes(value);
}

export const CHALLENGE_STEP_STATUSES = ['pending', 'done', 'skipped'] as const;

export type ChallengeStepStatus = (typeof CHALLENGE_STEP_STATUSES)[number];

export function isChallengeStepStatus(value: string): value is ChallengeStepStatus {
  return (CHALLENGE_STEP_STATUSES as readonly string[]).includes(value);
}

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

export const REVIEW_MAX_ATTEMPTS = 3;

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
  'verse.place',
  'verse.marked',
  'verse.crossref',
  'note.recognize',
  'note.passage',
  'note.connect',
  'note.annotation',
  'chapter.verse',
  'chapter.person',
  'chapter.place',
  'chapter.marked',
]);

export function maxAttemptsFor(promptKey: string | null | undefined): number {
  return promptKey && CHOICE_RUNGS.has(promptKey) ? CHOICE_ATTEMPTS : PRODUCED_ATTEMPTS;
}

/** Strongest eight. Dismissing one refills from what is waiting. Never a list past this. */
export const REVIEW_INBOX_MAX_ROWS = 8;

export const REVIEW_INBOX_UNASKABLE_SLACK = 4;

/** One sitting, not a queue to clear. Eight strongest, never a list to clear. */
export const REVIEW_SESSION_CAP = 8;

export const REVIEW_ENGINE_DAILY_CAP = 5;
export const REVIEW_ENGINE_WINDOW_HOURS = 24;

export const REVIEW_ENGINE_MAX_OUTSTANDING = REVIEW_INBOX_MAX_ROWS * 4;
