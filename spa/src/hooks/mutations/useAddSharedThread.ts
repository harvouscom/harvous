import { useMutation } from '@tanstack/react-query';
import { api } from '../../lib/api';

interface AddSharedThreadResult {
  success: boolean;
  createdIds?: { threadId: string };
}

/**
 * Mutation hook for importing a shared thread into the user's Harvous.
 *
 * Usage:
 *   const addSharedThread = useAddSharedThread();
 *   const result = await addSharedThread.mutateAsync(shareToken);
 */
export function useAddSharedThread() {
  return useMutation({
    mutationFn: (shareToken: string) =>
      api.post<AddSharedThreadResult>('/api/shared/add-to-harvous', { shareToken }),
  });
}
