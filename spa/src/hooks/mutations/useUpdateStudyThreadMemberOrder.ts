import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, APIError } from '../../lib/api';
import { normalizeNoteIdFromParam } from '../../pages/prototype/proto-route-slugs';
import { type StudyThreadResponse } from '../queries/usePrototypeStudyThread';
import { normalizePrototypeApiSpaceId } from '../../utils/prototype-space-api-id';
import { toastError } from '../../lib/error-copy';

export interface UpdateStudyThreadMemberOrderVariables {
  anchorNoteId: string;
  spaceId: string;
  orderedNoteIds: string[];
}

interface UpdateStudyThreadMemberOrderResponse {
  success: boolean;
  repNoteId?: string;
  memberOrder?: string[];
  error?: string;
}

/** Persists user-defined note order for a study-thread cluster. */
export function useUpdateStudyThreadMemberOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      anchorNoteId,
      spaceId,
      orderedNoteIds,
    }: UpdateStudyThreadMemberOrderVariables) => {
      const scopeId = normalizePrototypeApiSpaceId(spaceId);
      const fullId = normalizeNoteIdFromParam(anchorNoteId);
      const qs = scopeId ? `?spaceId=${encodeURIComponent(scopeId)}` : '';
      return api.patch<UpdateStudyThreadMemberOrderResponse>(
        `/api/notes/${encodeURIComponent(fullId)}/thread/member-order${qs}`,
        { orderedNoteIds },
      );
    },
    onSuccess: (data, variables) => {
      const scopeId = normalizePrototypeApiSpaceId(variables.spaceId);
      const memberOrder = data.memberOrder ?? variables.orderedNoteIds;
      patchStudyThreadMemberOrderInCache(queryClient, variables.spaceId, memberOrder);
      if (scopeId) {
        queryClient.invalidateQueries({ queryKey: ['prototype', 'space', scopeId, 'study-threads'] });
      }
    },
    onError: (err, variables) => {
      /**
       * Never print the server's sentence.
       *
       * This used to toast `err.message` verbatim, which is how a user saw
       * "orderedNoteIds must include every note in the thread exactly once" — a
       * validation contract written for a developer. INVALID_ORDER also means the
       * client's picture of the thread is stale, so refetch it: the drag can then be
       * repeated against the real membership instead of failing the same way again.
       */
      const stale = err instanceof APIError && err.code === 'INVALID_ORDER';
      if (stale) {
        void queryClient.invalidateQueries({
          queryKey: ['prototype', 'note', variables.anchorNoteId, 'thread'],
        });
      }
      toastError(
        err,
        stale
          ? 'This Thread changed while you were reordering. Try again'
          : 'Could not reorder this Thread',
      );
    },
  });
}

/** Optimistically patch memberOrder on all study-thread queries for a space. */
export function patchStudyThreadMemberOrderInCache(
  queryClient: ReturnType<typeof useQueryClient>,
  spaceId: string,
  memberOrder: string[],
): void {
  const scopeId = normalizePrototypeApiSpaceId(spaceId) ?? '';
  queryClient.setQueriesData<StudyThreadResponse>(
    {
      predicate: (query) =>
        Array.isArray(query.queryKey) &&
        query.queryKey[0] === 'prototype' &&
        query.queryKey[1] === 'note' &&
        query.queryKey[3] === 'thread' &&
        query.queryKey[4] === scopeId,
    },
    (prev) => (prev ? { ...prev, memberOrder } : prev),
  );
}
