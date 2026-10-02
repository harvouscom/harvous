import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { toast } from '@/utils/toast';
import { CONNECTOR_STATUS_KEY, type ConnectorPersonalToken } from '../queries/useConnectorStatus';

export type CreatedConnectorToken = ConnectorPersonalToken & { token: string };

/**
 * A personal token for apps that take a fixed header (Grok Bot). Creating one replaces the
 * old one; the plaintext comes back once, in `data`, and lives only in the caller's state.
 */
export function useCreateConnectorToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<CreatedConnectorToken>('/api/user/connector/token', {}),
    onError: () => toast.error('Could not create a token. Try again.'),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: CONNECTOR_STATUS_KEY }),
  });
}

export function useRevokeConnectorToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<{ revoked: boolean }>('/api/user/connector/token'),
    onError: () => toast.error('Could not revoke the token. Try again.'),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: CONNECTOR_STATUS_KEY }),
  });
}
