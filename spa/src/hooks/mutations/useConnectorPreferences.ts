import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { toast } from '@/utils/toast';
import { CONNECTOR_STATUS_KEY, type ConnectorStatusResponse } from '../queries/useConnectorStatus';

/** The "Let apps start notes" switch. Optimistic, rolled back with a toast on failure. */
export function useSetAllowStartNotes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (allowStartNotes: boolean) =>
      api.put('/api/user/connector/preferences', { allowStartNotes }),
    onMutate: async (allowStartNotes: boolean) => {
      await queryClient.cancelQueries({ queryKey: CONNECTOR_STATUS_KEY });
      const previous = queryClient.getQueryData<ConnectorStatusResponse>(CONNECTOR_STATUS_KEY);
      if (previous) {
        queryClient.setQueryData<ConnectorStatusResponse>(CONNECTOR_STATUS_KEY, {
          ...previous,
          preferences: { allowStartNotes },
        });
      }
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(CONNECTOR_STATUS_KEY, context.previous);
      toast.error('Could not change that setting. Try again.');
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: CONNECTOR_STATUS_KEY }),
  });
}
