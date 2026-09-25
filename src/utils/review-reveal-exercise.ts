/**
 * Does a reveal carry the exercise its rung is asked with?
 *
 * On a marked rung the reveal *is* the question — the options, the gaps, the pieces — and the dock
 * picks its card by which field of the reveal is present. A builder that returns null leaves that
 * field empty without raising anything, and the dock used to fall through every card to the
 * self-rated one: the prompt, an empty card and "Check my note". So the server asks this of every
 * question before it hands a sitting over, and a question that fails it is never shown.
 *
 * One table, in rung order, mirroring the dock's branches. A rung missing here fails the test that
 * walks `REVIEW_PROMPT_KEYS`, which is the point: a new rung must say what its card needs.
 *
 * Pure and client-safe; the payload is described structurally so the server's type and the
 * client's both fit.
 */
import type { ReviewPromptKey } from '@/utils/review-prompts';

export interface RevealExerciseFields {
  noteChoice?: unknown;
  cloze?: { blankLengths?: readonly number[] } | null;
  sequence?: unknown;
  altered?: unknown;
  initials?: unknown;
  keywords?: unknown;
  before?: unknown;
  next?: unknown;
  locate?: unknown;
  choice?: unknown;
  recall?: unknown;
  /** A church's matching question: two columns, no key. */
  match?: unknown;
}

type Field = keyof RevealExerciseFields | 'always';

export const REVEAL_EXERCISE_FIELD: Record<ReviewPromptKey, Field> = {
  'note.passage': 'noteChoice',
  'note.connect': 'noteChoice',
  'note.folder': 'noteChoice',
  'verse.recognize': 'choice',
  'verse.rebuild': 'cloze',
  'verse.initials': 'initials',
  // The recall card renders from the prompt alone; its way in is optional.
  'verse.recall': 'always',
  'verse.keywords': 'keywords',
  'verse.next': 'next',
  'verse.before': 'before',
  'verse.altered': 'altered',
  'verse.theme': 'choice',
  'verse.person': 'choice',
  'verse.place': 'choice',
  'verse.crossref': 'choice',
  'verse.connect': 'choice',
  'verse.marked': 'choice',
  'verse.sequence': 'sequence',
  'verse.locate': 'locate',
  'verse.book': 'locate',
  'chapter.verse': 'choice',
  'chapter.finish': 'cloze',
  'chapter.order': 'sequence',
  'chapter.person': 'choice',
  'chapter.place': 'choice',
  'chapter.marked': 'choice',
  // A church's own questions ride the cards the dock already draws, except matching.
  'church.choice': 'choice',
  'church.order': 'sequence',
  'church.match': 'match',
};

export function revealCarriesExercise(
  promptKey: string | null | undefined,
  reveal: RevealExerciseFields | null | undefined,
): boolean {
  if (!promptKey || !reveal) return false;
  const field = REVEAL_EXERCISE_FIELD[promptKey as ReviewPromptKey];
  if (!field) return false;
  if (field === 'always') return true;
  if (field === 'cloze') return (reveal.cloze?.blankLengths?.length ?? 0) > 0;
  return reveal[field] != null;
}
