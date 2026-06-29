import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useHarvousAdminCheck } from './useVotdPreview';
import type { FeedbackTopic } from '@/utils/support-mailto';

const API_BASE =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL
    ? String(import.meta.env.VITE_API_BASE_URL)
    : '';

async function adminApiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { credentials: 'include' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function adminApiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export type SupportTicketStatus = 'open' | 'closed';
export type SupportTicketListFilter = 'open' | 'closed' | 'all';

export type SupportTicketListItem = {
  id: string;
  ticketNumber: number | null;
  topic: FeedbackTopic | string | null;
  message: string;
  userName: string | null;
  userEmail: string | null;
  status: SupportTicketStatus;
  unread: boolean;
  createdAt: string;
};

export type SupportTicketDetail = SupportTicketListItem & {
  userId: string;
  appVersion: string | null;
  pageUrl: string | null;
  clientEnvironment: string | null;
  adminNote: string | null;
  adminReadAt: string | null;
  closedAt: string | null;
};

export type SupportTicketsListResponse = {
  success: boolean;
  status: SupportTicketListFilter;
  tickets: SupportTicketListItem[];
  openCount: number;
  unreadCount: number;
};

export type SupportTicketDetailResponse = {
  success: boolean;
  ticket: SupportTicketDetail;
};

export function useAdminSupportTickets(filter: SupportTicketListFilter) {
  const admin = useHarvousAdminCheck();
  return useQuery({
    queryKey: ['admin', 'support', 'tickets', filter],
    queryFn: () => adminApiGet<SupportTicketsListResponse>(`/api/admin/support/tickets?status=${filter}&limit=50`),
    enabled: admin.data?.isAdmin === true,
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

export function useAdminSupportUnreadCount() {
  const admin = useHarvousAdminCheck();
  return useQuery({
    queryKey: ['admin', 'support', 'unread-count'],
    queryFn: async () => {
      const data = await adminApiGet<SupportTicketsListResponse>('/api/admin/support/tickets?status=open&limit=1');
      return data.unreadCount;
    },
    enabled: admin.data?.isAdmin === true,
    staleTime: 15_000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
}

export function useAdminSupportTicket(id: string | null) {
  const admin = useHarvousAdminCheck();
  return useQuery({
    queryKey: ['admin', 'support', 'ticket', id],
    queryFn: () => adminApiGet<SupportTicketDetailResponse>(`/api/admin/support/tickets/${id}`),
    enabled: admin.data?.isAdmin === true && !!id,
    staleTime: 0,
  });
}

export function useUpdateSupportTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      id: string;
      status?: SupportTicketStatus;
      adminNote?: string | null;
      read?: boolean;
    }) =>
      adminApiPatch<SupportTicketDetailResponse>(`/api/admin/support/tickets/${params.id}`, {
        status: params.status,
        adminNote: params.adminNote,
        read: params.read,
      }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'support'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'support', 'ticket', variables.id] });
    },
  });
}
