import type { FeedbackTopic } from './support-mailto';

const API_BASE =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL
    ? String(import.meta.env.VITE_API_BASE_URL)
    : '';

export function formatSupportTicketRef(ticketNumber: number | null | undefined, id: string): string {
  if (ticketNumber != null) return String(ticketNumber);
  if (/^\d+$/.test(id)) return id;
  return id;
}

export type SubmitSupportTicketInput = {
  message: string;
  topic?: FeedbackTopic;
  appVersion?: string;
  pageUrl?: string;
  clientEnvironment?: string;
};

export type SubmitSupportTicketResult = {
  success: boolean;
  id: string;
  ticketNumber: number;
  createdAt: string;
};

export async function submitSupportTicket(input: SubmitSupportTicketInput): Promise<SubmitSupportTicketResult> {
  const res = await fetch(`${API_BASE}/api/support/tickets`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
  }

  return res.json() as Promise<SubmitSupportTicketResult>;
}
