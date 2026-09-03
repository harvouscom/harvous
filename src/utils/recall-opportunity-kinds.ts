/** Shared allowlist for Home recall carousel opportunity kinds (client + server). */

export const RECALL_OPPORTUNITY_KINDS = [
  'revisitNote',
  'highlight',
  'arc',
  'passage',
  'crossref',
  'subject',
  'referenceWord',
  'continueBook',
  'studyPerson',
  'annotateHighlight',
  'reflection',
  'crossrefGap',
  'connectNotes',
  'searchGap',
  'markNote',
  'reflectThread',
] as const;

export type RecallOpportunityKind = (typeof RECALL_OPPORTUNITY_KINDS)[number];

/**
 * Five answers a suggestion can get, and they are not interchangeable.
 *
 * `open` is intent, `complete` is the loop actually closing. They are not the same and the
 * deck should not treat them alike: tapping "thread these two notes" says you were
 * interested, whereas the thread existing afterwards says the suggestion was right. Only the
 * generative kinds can report `complete` — the ones that ask you to make something — because
 * for the rest, opening the thing *is* doing the thing.
 *
 * `snooze` and `dismissed` are the two the reader chooses between, and the difference is the
 * whole point of having both: a snooze is "not now" and expires, a dismissal is "not this,
 * ever" and does not. Everything else in this system rests on a window; `dismissed` is the
 * one action with no window at all, which is why it needs its own constant rather than a very
 * long snooze. A snooze with a big number still comes back, and the control that writes it has
 * been promising for a while that it would not.
 *
 * `restored` is the undo, and it exists as a server action rather than as a local flag because
 * of what it undoes. A mistaken snooze heals itself in three weeks; a mistaken permanent
 * dismissal never does, so an undo that only works on the device that made the mistake is not
 * an undo. Dismiss on a phone, change your mind on a laptop, and the laptop has to be able to
 * say so.
 */
export const RECALL_EVENT_ACTIONS = [
  'open',
  'snooze',
  'impression',
  'complete',
  'dismissed',
  'restored',
] as const;

/**
 * The actions that decide whether a card can be shown, newest-wins.
 *
 * `impression` is excluded: it records that a card was on screen, which says nothing about
 * whether it should be shown again. Everything else here either suppresses (`open`, `snooze`,
 * `complete`, `dismissed`) or un-suppresses (`restored`).
 */
export const RECALL_SUPPRESSION_ACTIONS = [
  'open',
  'snooze',
  'complete',
  'dismissed',
  'restored',
] as const;

export type RecallSuppressionAction = (typeof RECALL_SUPPRESSION_ACTIONS)[number];

export function isRecallSuppressionAction(value: string): value is RecallSuppressionAction {
  return (RECALL_SUPPRESSION_ACTIONS as readonly string[]).includes(value);
}

/**
 * Actions with no expiry, which the server must therefore return however old they are.
 * See `RECALL_HISTORY_WINDOW_DAYS` in server/routes/recall.ts — a windowed query would
 * quietly resurrect a suggestion the reader told us never to show again.
 */
export const RECALL_UNBOUNDED_ACTIONS = ['dismissed', 'restored'] as const;

export type RecallEventAction = (typeof RECALL_EVENT_ACTIONS)[number];

export function isRecallOpportunityKind(value: string): value is RecallOpportunityKind {
  return (RECALL_OPPORTUNITY_KINDS as readonly string[]).includes(value);
}

/**
 * Kinds whose primary action can create a new note (the generative cards), rather than
 * opening something that already exists. Used to disable only these while a create is in
 * flight, so a second tap can't leave a duplicate note behind — without freezing cards
 * that merely navigate.
 */
export const NOTE_CREATING_RECALL_KINDS: readonly RecallOpportunityKind[] = [
  'continueBook',
  'studyPerson',
  'reflection',
  'crossrefGap',
  'searchGap',
];

export function recallKindCreatesNote(kind: RecallOpportunityKind): boolean {
  return NOTE_CREATING_RECALL_KINDS.includes(kind);
}

export function isRecallEventAction(value: string): value is RecallEventAction {
  return (RECALL_EVENT_ACTIONS as readonly string[]).includes(value);
}

/** Admin display labels for recall kind slugs. */
export const RECALL_KIND_LABELS: Record<RecallOpportunityKind, string> = {
  revisitNote: 'Revisit note',
  highlight: 'Highlight',
  arc: 'Study arc',
  passage: 'Passage',
  crossref: 'Cross-reference',
  subject: 'Theme',
  referenceWord: 'Dictionary word',
  continueBook: 'Continue book',
  studyPerson: 'Study person',
  annotateHighlight: 'Annotate highlight',
  reflection: 'Reflection prompt',
  crossrefGap: 'Cross-ref gap',
  connectNotes: 'Connect notes',
  searchGap: 'Unanswered search',
  markNote: 'Mark a note',
  reflectThread: 'Reflect on a Thread',
};

export function recallKindDisplayLabel(kind: string): string {
  if (isRecallOpportunityKind(kind)) return RECALL_KIND_LABELS[kind];
  return kind;
}
