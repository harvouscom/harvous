/**
 * Slack ping for new support tickets — checked hourly via a cron-triggered route.
 * See .github/workflows/support-notify-check.yml.
 */

import { db, SupportTickets, isNull, asc, inArray, and, eq } from '../db';
import { nowISO } from '../db/dates';
import { formatSupportTicketRef } from '@/utils/support-tickets';

const MAX_PREVIEW_LENGTH = 120;

function messagePreview(message: string): string {
  const line = message.trim().split('\n')[0] ?? '';
  return line.length > MAX_PREVIEW_LENGTH ? `${line.slice(0, MAX_PREVIEW_LENGTH - 3)}…` : line;
}

function buildSlackText(tickets: (typeof SupportTickets.$inferSelect)[]): string {
  const header =
    tickets.length === 1 ? '1 new Harvous support ticket' : `${tickets.length} new Harvous support tickets`;
  const lines = tickets.map((t) => {
    const ref = formatSupportTicketRef(t.ticketNumber, t.id);
    const topic = t.topic ? `[${t.topic}] ` : '';
    const who = t.userName || t.userEmail || 'Unknown user';
    return `#${ref} ${topic}${who} — ${messagePreview(t.message)}`;
  });
  return [header, ...lines].join('\n');
}

/** Finds tickets not yet pinged, POSTs a Slack message, marks them notified. No-op if nothing new or webhook unset. */
export async function checkAndNotifySupportTickets(): Promise<{ notified: number }> {
  const webhookUrl = process.env.SUPPORT_SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn('[support-notify] SUPPORT_SLACK_WEBHOOK_URL not set; skipping.');
    return { notified: 0 };
  }

  const tickets = await db
    .select()
    .from(SupportTickets)
    .where(
      and(
        isNull(SupportTickets.notifiedAt),
        eq(SupportTickets.status, 'open'),
        isNull(SupportTickets.adminReadAt),
      ),
    )
    .orderBy(asc(SupportTickets.createdAt));

  if (tickets.length === 0) return { notified: 0 };

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: buildSlackText(tickets) }),
  });

  if (!res.ok) {
    console.error('[support-notify] Slack webhook failed', res.status, await res.text().catch(() => ''));
    return { notified: 0 };
  }

  const notifiedAt = nowISO();
  await db
    .update(SupportTickets)
    .set({ notifiedAt })
    .where(inArray(SupportTickets.id, tickets.map((t) => t.id)));

  return { notified: tickets.length };
}
