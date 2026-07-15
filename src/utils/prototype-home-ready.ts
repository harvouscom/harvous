import type { PrototypeNotesListPhase } from './prototype-notes-list-phase';

export interface PrototypeHomeContentReadyInput {
  notesListPhase: PrototypeNotesListPhase;
}

/**
 * True when the home sidebar can leave ProtoHomeLoading and paint.
 *
 * INVARIANT: Home shell paint depends only on the notes list phase (`list` | `empty`).
 * Do NOT gate on tags, study threads, highlights, scripture index, or VOTD — those may
 * populate cards progressively. Requiring them caused endless loading dots when any
 * auxiliary stayed pending (including auth-gated queries that are `isPending` while disabled).
 */
export function isPrototypeHomeContentReady(input: PrototypeHomeContentReadyInput): boolean {
  const { notesListPhase } = input;
  if (notesListPhase === 'loading' || notesListPhase === 'error') return false;
  return notesListPhase === 'list' || notesListPhase === 'empty';
}

/** React Query helper: settled when not pending or cached data exists. */
export function isQuerySettled(isPending: boolean, hasData: boolean): boolean {
  return !isPending || hasData;
}
