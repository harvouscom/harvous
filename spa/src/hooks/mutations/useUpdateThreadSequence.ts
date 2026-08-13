import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { navigationQueryKeyPrefix } from '../queries/useNavigation';
import { spaceGroupThreadsQueryKey } from '../queries/useSpaceGroupThreads';
import { normalizePrototypeApiSpaceId } from '../../utils/prototype-space-api-id';

export type UpdateThreadSequenceInput = {
  threadId: string;
  /** Present for space Threads; a personal reading plan has none. */
  spaceId?: string | null;
  mode?: 'collection' | 'sequence';
  /** The whole authored order. Partial reorders are not a thing on purpose. */
  orderedNoteIds?: string[];
  /**
   * The step the cohort is on. Advancing means sending the neighbouring note
   * id — an index would move the group when someone reorders ahead of them.
   */
  currentNoteId?: string | null;
};

export type ThreadSequenceResult = {
  success: boolean;
  mode: string;
  sequence: {
    orderedNoteIds: string[];
    currentNoteId: string | null;
    currentIndex: number;
    total: number;
  };
};

export function useUpdateThreadSequence() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateThreadSequenceInput) => {
      const body: Record<string, unknown> = {};
      if (input.mode !== undefined) body.mode = input.mode;
      if (input.orderedNoteIds !== undefined) body.orderedNoteIds = input.orderedNoteIds;
      if (input.currentNoteId !== undefined) body.currentNoteId = input.currentNoteId;
      return api.post<ThreadSequenceResult>(
        `/api/threads/${encodeURIComponent(input.threadId)}/sequence`,
        body,
      );
    },
    onSuccess: (_result, input) => {
      const spaceId = normalizePrototypeApiSpaceId(input.spaceId ?? undefined);
      queryClient.invalidateQueries({ queryKey: ['thread', input.threadId, 'notes'] });
      if (spaceId) {
        queryClient.invalidateQueries({ queryKey: spaceGroupThreadsQueryKey(spaceId) });
        queryClient.invalidateQueries({ queryKey: ['space', spaceId, 'bootstrap'] });
      }
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: [...navigationQueryKeyPrefix] });
    },
  });
}
