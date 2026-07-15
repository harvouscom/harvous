export type PrototypeNotesListPhase = 'loading' | 'empty' | 'list' | 'error';

export interface PrototypeNotesListPhaseInput {
  homeSpaceId: string | null;
  authReady: boolean;
  isPending: boolean;
  isFetching: boolean;
  /** True after at least one successful settle of the notes query (including empty). */
  isFetched: boolean;
  noteCount: number;
  isError: boolean;
}

/**
 * Derives sidebar Notes list UI phase from React Query + auth gates.
 * Avoids treating a disabled or not-yet-started query as "empty".
 *
 * INVARIANT: Once `isFetched` is true with zero rows, background refetch must stay
 * `'empty'` — not `'loading'`. Treating `isFetching && noteCount === 0` as loading
 * forever kept Home on ProtoHomeLoading dots during stale refetches.
 */
export function computePrototypeNotesListPhase(input: PrototypeNotesListPhaseInput): PrototypeNotesListPhase {
  if (input.isError) return 'error';
  if (!input.homeSpaceId || !input.authReady) return 'loading';
  if (input.isPending || (input.isFetching && input.noteCount === 0 && !input.isFetched)) {
    return 'loading';
  }
  if (input.noteCount === 0) return 'empty';
  return 'list';
}
