import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';

export type ConnectorClient = {
  clientId: string;
  /** What the app calls itself on connect ("Claude", "ChatGPT", "Cursor"…). */
  name: string;
  firstUsedAt: string;
  lastUsedAt: string;
  disconnected: boolean;
};

export type ConnectorStatusResponse = {
  /** The URL to paste into an AI app's "add connector" field. */
  mcpUrl: string;
  clients: ConnectorClient[];
  usage: { today: number; dailyLimit: number; resetsAt: string };
};

export const CONNECTOR_STATUS_KEY = ['connector', 'status'] as const;

/** Settings › Connector. Only for accounts holding `connector` (callers gate on it). */
export function useConnectorStatus(enabled: boolean) {
  const authReady = useAuthReady();
  return useQuery({
    queryKey: CONNECTOR_STATUS_KEY,
    queryFn: () => api.get<ConnectorStatusResponse>('/api/user/connector'),
    enabled: authReady && enabled,
    staleTime: 30_000,
    retry: false,
  });
}
