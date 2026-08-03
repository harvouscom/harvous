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
] as const;

export type RecallOpportunityKind = (typeof RECALL_OPPORTUNITY_KINDS)[number];

export const RECALL_EVENT_ACTIONS = ['open', 'snooze', 'impression'] as const;

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
};

export function recallKindDisplayLabel(kind: string): string {
  if (isRecallOpportunityKind(kind)) return RECALL_KIND_LABELS[kind];
  return kind;
}
