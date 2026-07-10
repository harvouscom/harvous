import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { invalidatePrototypeSpaceDerivedQueries } from '../../lib/prototype-space-query-keys';
import { spaceGroupThreadsQueryKey } from '../queries/useSpaceGroupThreads';
import { threadNotesQueryKey } from '../queries/useThreadNotes';

type AttachNotesInput = {
  spaceId: string;
  threadId: string;
  noteIds: string[];
};

type SyncPushResult = {
  success: boolean;
  error?: string;
};

type SyncPushResponse = {
  results?: SyncPushResult[];
};

export function buildAttachNotesToCurrentThreadRequest(
  input: AttachNotesInput,
  entityIdForNote: (noteId: string) => string = (noteId) =>
    `local_note_thread_${noteId}_${crypto.randomUUID()}`,
) {
  const noteIds = [...new Set(input.noteIds.filter(Boolean))];
  return {
    url: '/api/sync/push',
    body: {
      mutations: noteIds.map((noteId, index) => ({
        operation: 'create',
        entityType: 'noteThread',
        entityId: entityIdForNote(noteId),
        operationId: index + 1,
        data: {
          noteId,
          threadId: input.threadId,
        },
      })),
    },
  };
}

/**
 * Attach viewer-authored, actively associated notes to the current shared Thread.
 * The sync endpoint applies the canonical current-Thread/author/encryption policy.
 */
export function useAttachNotesToCurrentThread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AttachNotesInput) => {
      const request = buildAttachNotesToCurrentThreadRequest(input);
      if (request.body.mutations.length === 0) throw new Error('Choose at least one note');
      const response = await api.post<SyncPushResponse>(request.url, request.body);
      const failed = response.results?.find((result) => !result.success);
      if (failed) throw new Error(failed.error || 'Could not add note to the current Thread');
      if (!response.results || response.results.length !== request.body.mutations.length) {
        throw new Error('Could not confirm every Thread attachment');
      }
      return { addedCount: response.results.length };
    },
    onSuccess: (_result, input) => {
      void queryClient.invalidateQueries({ queryKey: threadNotesQueryKey(input.threadId, input.spaceId) });
      void queryClient.invalidateQueries({ queryKey: spaceGroupThreadsQueryKey(input.spaceId) });
      invalidatePrototypeSpaceDerivedQueries(queryClient, input.spaceId);
    },
  });
}
