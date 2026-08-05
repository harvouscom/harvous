import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';

export type NoteByReferenceRow = {
  id: string;
  title: string | null;
  updatedAt: string | null;
};

export type NotesByReferenceResponse = {
  success: boolean;
  reference: string;
  /** Every match, even though `notes` is capped — "3 of 11" needs the total. */
  totalCount: number;
  notes: NoteByReferenceRow[];
};

export function notesByReferenceQueryKey(
  userId: string | null | undefined,
  reference: string | null,
) {
  return ['notes-by-reference', userId ?? 'none', reference ?? 'none'] as const;
}

/**
 * The caller's own notes touching a passage. Server-scoped to `auth.userId`;
 * there is no cross-user or church-wide variant of this by design.
 *
 * `reference` must already be validated by the caller — a query per keystroke
 * of a half-typed reference is the failure mode this is shaped to avoid.
 */
export function useNotesByReference(reference: string | null) {
  const { userId } = useAuth();
  const authReady = useAuthReady();
  const ref = reference?.trim() || null;

  return useQuery({
    queryKey: notesByReferenceQueryKey(userId, ref),
    enabled: authReady && !!userId && !!ref,
    queryFn: () =>
      api.get<NotesByReferenceResponse>(
        `/api/notes/by-reference?reference=${encodeURIComponent(ref!)}`,
      ),
    staleTime: 5 * 60_000,
    // A bad reference is a 400 the user fixes by typing, not a transient fault.
    retry: false,
  });
}
