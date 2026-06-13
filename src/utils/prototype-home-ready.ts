import type { PrototypeNotesListPhase } from './prototype-notes-list-phase';

export interface PrototypeHomeContentReadyInput {
  notesListPhase: PrototypeNotesListPhase;
  scriptureSettled: boolean;
  tagsSettled: boolean;
  votdSettled: boolean;
  threadsSettled: boolean;
  highlightsSettled: boolean;
}

/**
 * True when the home sidebar can paint its final layout in one pass (no progressive
 * greeting reflow or cards popping in). Notes must be past loading/error; auxiliary
 * queries (scripture index, tags, study threads, highlights, VOTD) must be settled or cached.
 */
export function isPrototypeHomeContentReady(input: PrototypeHomeContentReadyInput): boolean {
  const { notesListPhase, scriptureSettled, tagsSettled, votdSettled, threadsSettled, highlightsSettled } = input;
  if (notesListPhase === 'loading' || notesListPhase === 'error') return false;
  if (!scriptureSettled || !tagsSettled || !votdSettled || !threadsSettled || !highlightsSettled) return false;
  return notesListPhase === 'list' || notesListPhase === 'empty';
}

/** React Query helper: settled when not pending or cached data exists. */
export function isQuerySettled(isPending: boolean, hasData: boolean): boolean {
  return !isPending || hasData;
}
