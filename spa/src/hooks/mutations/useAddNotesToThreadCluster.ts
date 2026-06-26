import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useConnectNote } from './useConnectNote';
import { invalidatePrototypeSpaceDerivedQueries } from '../../lib/prototype-space-query-keys';

interface AddNotesToThreadClusterInput {
  noteIds: string[];
  repNoteId: string;
  memberIds: string[];
  spaceId: string;
}

/** Connect picked notes to a study-thread cluster via the representative note. */
export function useAddNotesToThreadCluster() {
  const connectNote = useConnectNote();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ noteIds, repNoteId, memberIds, spaceId }: AddNotesToThreadClusterInput) => {
      const memberSet = new Set(memberIds);
      const parentNoteId = repNoteId;
      const toConnect = noteIds.filter((id) => id !== parentNoteId && !memberSet.has(id));
      if (toConnect.length === 0) {
        throw new Error('No notes were added to this thread');
      }
      for (const linkedNoteId of toConnect) {
        await connectNote.mutateAsync({ parentNoteId, linkedNoteId, spaceId });
      }
      return { addedCount: toConnect.length };
    },
    onSuccess: (_data, variables) => {
      invalidatePrototypeSpaceDerivedQueries(queryClient, variables.spaceId);
      queryClient.invalidateQueries({ queryKey: ['prototype', 'space', variables.spaceId, 'study-threads'] });
      queryClient.invalidateQueries({ queryKey: ['connectNoteCandidates'] });
    },
  });
}
