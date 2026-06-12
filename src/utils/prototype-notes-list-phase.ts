export type PrototypeNotesListPhase = 'loading' | 'empty' | 'list' | 'error';

export interface PrototypeNotesListPhaseInput {
  homeSpaceId: string | null;
  authReady: boolean;
  isPending: boolean;
  isFetching: boolean;
  noteCount: number;
  isError: boolean;
}

/**
 * Derives sidebar Notes list UI phase from React Query + auth gates.
 * Avoids treating a disabled or not-yet-started query as "empty".
 */
export function computePrototypeNotesListPhase(input: PrototypeNotesListPhaseInput): PrototypeNotesListPhase {
  if (input.isError) return 'error';
  if (!input.homeSpaceId || !input.authReady) return 'loading';
  if (input.isPending || (input.isFetching && input.noteCount === 0)) return 'loading';
  if (input.noteCount === 0) return 'empty';
  return 'list';
}
