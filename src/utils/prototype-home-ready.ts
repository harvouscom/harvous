import type { PrototypeNotesListPhase } from './prototype-notes-list-phase';

export interface PrototypeHomeContentReadyInput {
  notesListPhase: PrototypeNotesListPhase;
  scriptureSettled: boolean;
  tagsSettled: boolean;
  votdSettled: boolean;
}

/**
 * True when the home sidebar can paint its final layout in one pass (no progressive
 * greeting reflow or cards popping in). Notes must be past loading/error; auxiliary
 * queries (scripture index, tags, VOTD) must be settled or already cached.
 */
export function isPrototypeHomeContentReady(input: PrototypeHomeContentReadyInput): boolean {
  const { notesListPhase, scriptureSettled, tagsSettled, votdSettled } = input;
  if (notesListPhase === 'loading' || notesListPhase === 'error') return false;
  if (!scriptureSettled || !tagsSettled || !votdSettled) return false;
  return notesListPhase === 'list' || notesListPhase === 'empty';
}

/** React Query helper: settled when not pending or cached data exists. */
export function isQuerySettled(isPending: boolean, hasData: boolean): boolean {
  return !isPending || hasData;
}
