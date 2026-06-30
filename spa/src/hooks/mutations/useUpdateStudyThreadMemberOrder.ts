import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, APIError } from '../../lib/api';
import { normalizeNoteIdFromParam } from '../../pages/prototype/proto-route-slugs';
import { type StudyThreadResponse } from '../queries/usePrototypeStudyThread';
import { normalizePrototypeApiSpaceId } from '../../utils/prototype-space-api-id';

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
    onError: (err) => {
      const msg =
        err instanceof APIError ? err.message : err instanceof Error ? err.message : 'Could not reorder thread';
      try {
        window.toast?.error(msg);
      } catch {
        /* ignore */
      }
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
