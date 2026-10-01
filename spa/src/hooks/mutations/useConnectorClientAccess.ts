import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { toast } from '@/utils/toast';
import { CONNECTOR_STATUS_KEY, type ConnectorStatusResponse } from '../queries/useConnectorStatus';

type Vars = { clientId: string; disconnected: boolean };

/**
 * Disconnect an AI app from Harvous, or allow it again. Optimistic: the row flips on tap,
 * and rolls back with a toast if the server refuses.
 */
export function useConnectorClientAccess() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ clientId, disconnected }: Vars) =>
      api.post(
        `/api/user/connector/clients/${encodeURIComponent(clientId)}/${disconnected ? 'revoke' : 'restore'}`,
        {},
      ),
    onMutate: async ({ clientId, disconnected }: Vars) => {
      await queryClient.cancelQueries({ queryKey: CONNECTOR_STATUS_KEY });
      const previous = queryClient.getQueryData<ConnectorStatusResponse>(CONNECTOR_STATUS_KEY);
      if (previous) {
        queryClient.setQueryData<ConnectorStatusResponse>(CONNECTOR_STATUS_KEY, {
          ...previous,
          clients: previous.clients.map((c) => (c.clientId === clientId ? { ...c, disconnected } : c)),
        });
      }
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(CONNECTOR_STATUS_KEY, context.previous);
      toast.error('Could not update that app. Try again.');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: CONNECTOR_STATUS_KEY });
    },
  });
}
