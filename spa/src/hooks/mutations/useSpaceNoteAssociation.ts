import { useMutation, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query';
import { api, APIError } from '../../lib/api';
import {
  findSpaceNoteRowInCache,
  patchSpaceNotesInfiniteCache,
  prependSpaceNoteToCache,
  removeSpaceNoteFromCache,
  restoreSpaceNotesCaches,
  snapshotSpaceNotesCaches,
  spaceNotesQueryKey,
  type SpaceNotesPage,
} from '../../lib/space-notes-cache';
import { invalidatePrototypeSpaceDerivedQueries } from '../../lib/prototype-space-query-keys';
import { usePrototypeHomeSpaceId } from '../usePrototypeHomeSpaceId';
import type { SpaceNoteRow } from '../queries/useSpace';

export function normalizeAssociationSpaceId(spaceId: string): string {
  const trimmed = spaceId.trim();
  return trimmed.startsWith('space_') ? trimmed : `space_${trimmed}`;
}

export function buildAssociateNoteRequest(spaceId: string, noteId: string) {
  const sid = normalizeAssociationSpaceId(spaceId);
  return {
    url: `/api/spaces/${encodeURIComponent(sid)}/add-note`,
    body: { noteId },
  };
}

export function buildRemoveNoteAssociationRequest(spaceId: string, noteId: string) {
  const sid = normalizeAssociationSpaceId(spaceId);
  return {
    url: `/api/spaces/${encodeURIComponent(sid)}/remove-items`,
    body: { noteIds: [noteId], threadIds: [] },
  };
}

export function isSaveCopyRequiredError(error: unknown): error is APIError {
  return (
    error instanceof APIError &&
    error.status === 409 &&
    error.code === 'SAVE_COPY_REQUIRED'
  );
}

/** A new target association starts unorganized; canonical note content remains unchanged. */
export function buildOptimisticAssociatedSpaceNote(source: SpaceNoteRow): SpaceNoteRow {
  return {
    ...source,
    isOwnNote: true,
    isPinned: false,
    primaryCollection: null,
    secondaryCollections: [],
    collectionPinned: false,
    collectionUserOverride: false,
  };
}

export function invalidateSpaceNoteAssociationQueries(
  queryClient: QueryClient,
  spaceId: string,
  noteId: string,
  /** Keeps the My Home row's shared badge in step; without it the count lags a refetch. */
  options?: { homeSpaceId?: string | null; sharedCountDelta?: number },
): void {
  const sid = normalizeAssociationSpaceId(spaceId);
  const homeSpaceId = options?.homeSpaceId;
  const delta = options?.sharedCountDelta;
  if (homeSpaceId && delta) {
    patchSpaceNotesInfiniteCache(queryClient, homeSpaceId, (note) =>
      note.id === noteId
        ? { ...note, sharedSpaceCount: Math.max(0, (note.sharedSpaceCount ?? 0) + delta) }
        : note,
    );
  }
  void queryClient.invalidateQueries({ queryKey: ['note', noteId] });
  void queryClient.invalidateQueries({ queryKey: ['note', noteId, 'activity'] });
  void queryClient.invalidateQueries({ queryKey: spaceNotesQueryKey(sid) });
  void queryClient.invalidateQueries({ queryKey: ['space', sid, 'bootstrap'] });
  void queryClient.invalidateQueries({ queryKey: ['space', sid, 'activity-preview'] });
  void queryClient.invalidateQueries({ queryKey: ['space', sid, 'group-threads'] });
  void queryClient.invalidateQueries({ queryKey: ['prototype', 'space', sid, 'study-threads'] });
  void queryClient.invalidateQueries({ queryKey: ['search'] });
  invalidatePrototypeSpaceDerivedQueries(queryClient, sid);
}

type AssociationInput = { spaceId: string; noteId: string };
type AssociationResponse = {
  success: boolean;
  noteId: string;
  associationId?: string;
  reactivated?: boolean;
  /** Server no-op: the note was already live in this space. Don't claim it was added. */
  alreadyAssociated?: boolean;
};

/** Associate an authored canonical note with a shared space without duplicating it. */
export function useAssociateNoteWithSpace() {
  const queryClient = useQueryClient();
  const { homeSpaceId } = usePrototypeHomeSpaceId();
  return useMutation({
    mutationFn: (input: AssociationInput) => {
      const request = buildAssociateNoteRequest(input.spaceId, input.noteId);
      return api.post<AssociationResponse>(request.url, request.body);
    },
    onSuccess: (response, input) => {
      const sid = normalizeAssociationSpaceId(input.spaceId);
      const source = findSpaceNoteRowInCache(queryClient, input.noteId);
      if (source) {
        prependSpaceNoteToCache(queryClient, sid, buildOptimisticAssociatedSpaceNote(source));
      }
      invalidateSpaceNoteAssociationQueries(queryClient, sid, input.noteId, {
        homeSpaceId,
        // The server no-ops when the association is already live, so only count a
        // genuinely new or reactivated one.
        sharedCountDelta: response.alreadyAssociated === true ? 0 : 1,
      });
    },
  });
}

type RemoveAssociationResponse = {
  success: boolean;
  removedNotes: number;
  errors?: string[];
};

/** Archive only the shared-space association; the canonical My Home note remains. */
export function useRemoveNoteFromSpace() {
  const queryClient = useQueryClient();
  const { homeSpaceId } = usePrototypeHomeSpaceId();
  return useMutation({
    mutationFn: async (input: AssociationInput) => {
      const request = buildRemoveNoteAssociationRequest(input.spaceId, input.noteId);
      const response = await api.post<RemoveAssociationResponse>(request.url, request.body);
      if (response.errors?.length) throw new Error(response.errors[0]);
      return response;
    },
    onMutate: async (input) => {
      const sid = normalizeAssociationSpaceId(input.spaceId);
      await queryClient.cancelQueries({ queryKey: spaceNotesQueryKey(sid) });
      const previous = snapshotSpaceNotesCaches(queryClient, sid);
      removeSpaceNoteFromCache(queryClient, sid, input.noteId);
      return { sid, previous };
    },
    onError: (_error, _input, context) => {
      restoreSpaceNotesCaches(queryClient, context?.previous);
    },
    onSuccess: (_response, input) => {
      invalidateSpaceNoteAssociationQueries(queryClient, input.spaceId, input.noteId, {
        homeSpaceId,
        sharedCountDelta: -1,
      });
    },
  });
}
