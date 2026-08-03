import { useQuery } from '@tanstack/react-query';

export type AggregateState = 'operational' | 'degraded' | 'downtime' | 'maintenance';
export type ResourceStatus = AggregateState | 'not_monitored';

export interface StatusHistoryDay {
  day: string;
  status: ResourceStatus;
  downtimeDuration: number;
  maintenanceDuration: number;
}

export interface PublicStatusResource {
  id: string;
  name: string;
  status: ResourceStatus;
  explanation: string | null;
  position: number;
  availability: number | null;
  statusHistory: StatusHistoryDay[];
}

export interface PublicStatusSection {
  id: string;
  name: string;
  position: number;
  resources: PublicStatusResource[];
}

export interface PublicStatusIncidentUpdate {
  id: string;
  message: string;
  publishedAt: string;
}

export interface PublicStatusIncident {
  id: string;
  title: string;
  reportType: string;
  state: AggregateState;
  startedAt: string;
  endedAt: string | null;
  updates: PublicStatusIncidentUpdate[];
}

export interface PublicStatusData {
  aggregateState: AggregateState;
  announcement: string | null;
  updatedAt: string;
  subscribeUrl: string | null;
  rssUrl: string | null;
  sections: PublicStatusSection[];
  incidents: PublicStatusIncident[];
}

export const publicStatusQueryKey = ['public-status'] as const;

export function usePublicStatus() {
  return useQuery({
    queryKey: publicStatusQueryKey,
    queryFn: async () => {
      const res = await fetch('/api/status/public');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      return (await res.json()) as PublicStatusData;
    },
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
    retry: 1,
  });
}
